import base64
import io
import json
import os
import tempfile
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from faster_whisper import WhisperModel
from chatterbox.tts import ChatterboxTTS


HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "3020"))
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
CHATTERBOX_DEVICE = os.environ.get("CHATTERBOX_DEVICE", "cpu")

_whisper_model: WhisperModel | None = None
_tts_model: ChatterboxTTS | None = None


def get_whisper_model() -> WhisperModel:
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(
            WHISPER_MODEL_NAME,
            device="cpu",
            compute_type=WHISPER_COMPUTE_TYPE,
        )
    return _whisper_model


def get_tts_model() -> ChatterboxTTS:
    global _tts_model
    if _tts_model is None:
        _tts_model = ChatterboxTTS.from_pretrained(device=CHATTERBOX_DEVICE)
    return _tts_model


def decode_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(content_length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def audio_suffix_for_mime_type(mime_type: str | None) -> str:
    normalized = (mime_type or "").lower()
    if "wav" in normalized:
        return ".wav"
    if "mp4" in normalized or "mpeg" in normalized or "mp3" in normalized:
        return ".mp4"
    if "ogg" in normalized:
        return ".ogg"
    return ".webm"


def transcribe_audio(audio_base64: str, mime_type: str | None, language_hint: str | None) -> dict[str, Any]:
    audio_bytes = base64.b64decode(audio_base64)
    suffix = audio_suffix_for_mime_type(mime_type)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
      temp_file.write(audio_bytes)
      temp_path = temp_file.name

    try:
        segments, info = get_whisper_model().transcribe(
            temp_path,
            language=language_hint or None,
            beam_size=1,
            vad_filter=True,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return {
            "text": text,
            "language": getattr(info, "language", language_hint or "unknown"),
            "durationSeconds": getattr(info, "duration", None),
        }
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass


def synthesize_audio(text: str, voice: str | None) -> dict[str, Any]:
    cleaned_text = text.strip()
    if not cleaned_text:
        raise ValueError("text is required")

    model = get_tts_model()
    if voice == "siggi":
        waveform = model.generate(
            cleaned_text,
            exaggeration=0.35,
            temperature=0.65,
            cfg_weight=0.45,
        )
    else:
        waveform = model.generate(
            cleaned_text,
            exaggeration=0.4,
            temperature=0.7,
            cfg_weight=0.5,
        )

    pcm = waveform.squeeze(0).detach().cpu().clamp(-1, 1).numpy()
    pcm_int16 = (pcm * 32767).astype("int16")

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24000)
        wav_file.writeframes(pcm_int16.tobytes())

    return {
        "audioBase64": base64.b64encode(buffer.getvalue()).decode("utf-8"),
        "mimeType": "audio/wav",
        "sampleRate": 24000,
    }


class VoiceRuntimeHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            return send_json(
                self,
                200,
                {
                    "status": "ok",
                    "whisperModel": WHISPER_MODEL_NAME,
                    "ttsModel": "chatterbox",
                },
            )
        return send_json(self, 404, {"error": "not_found"})

    def do_POST(self) -> None:
        try:
            payload = decode_json_body(self)
        except Exception as error:
            return send_json(self, 400, {"error": f"invalid_json: {error}"})

        try:
            if self.path == "/transcribe":
                audio_base64 = payload.get("audioBase64")
                if not isinstance(audio_base64, str) or len(audio_base64) == 0:
                    return send_json(self, 400, {"error": "audioBase64 is required"})

                response = transcribe_audio(
                    audio_base64,
                    payload.get("mimeType"),
                    payload.get("languageHint"),
                )
                return send_json(self, 200, response)

            if self.path == "/speak":
                text = payload.get("text")
                if not isinstance(text, str) or len(text.strip()) == 0:
                    return send_json(self, 400, {"error": "text is required"})

                response = synthesize_audio(text, payload.get("voice"))
                return send_json(self, 200, response)

            return send_json(self, 404, {"error": "not_found"})
        except Exception as error:
            return send_json(self, 500, {"error": str(error)})

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), VoiceRuntimeHandler)
    print(f"Voice runtime listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
