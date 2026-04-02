# services/voice-runtime

Leichter Python-Worker fuer lokale Sprachfeatures auf `htown`.

## Aufgaben

- `POST /transcribe` mit `faster-whisper`
- `POST /speak` mit `chatterbox`
- Warmhalten der Modelle im RAM, damit Sprachfeatures nicht bei jeder Anfrage neu laden

## Laufzeit

- Python-Entry: `server.py`
- Standardport: `3020`
- erwartet vorhandene Python-Umgebung mit `faster-whisper`, `torch` und `chatterbox`

## Erwartete Umgebungsvariablen

- `HOST`, Standard `127.0.0.1`
- `PORT`, Standard `3020`
- `WHISPER_MODEL`, Standard `base`
- `WHISPER_COMPUTE_TYPE`, Standard `int8`
- `CHATTERBOX_DEVICE`, Standard `cpu`
