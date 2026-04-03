import base64
import json
import os
import sys
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> int:
    payload = json.load(sys.stdin)
    audio_base64 = payload.get("audioBase64", "")
    mime_type = payload.get("mimeType", "audio/webm")
    language_hint = payload.get("languageHint") or "de"
    model_name = os.environ.get("FASTER_WHISPER_MODEL", "base")
    suffix = ".webm"

    if "ogg" in mime_type:
        suffix = ".ogg"
    elif "wav" in mime_type:
        suffix = ".wav"
    elif "mp3" in mime_type:
        suffix = ".mp3"

    audio_bytes = base64.b64decode(audio_base64)

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(audio_bytes)
        temp_path = Path(handle.name)

    try:
        model = WhisperModel(model_name, device="auto", compute_type="int8")
        segments, info = model.transcribe(str(temp_path), language=language_hint, vad_filter=True)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        json.dump(
            {
                "text": text,
                "language": getattr(info, "language", language_hint) or language_hint,
                "durationSeconds": getattr(info, "duration", None),
            },
            sys.stdout,
        )
        sys.stdout.write("\n")
        return 0
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
