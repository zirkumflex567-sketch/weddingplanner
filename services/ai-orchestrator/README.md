# services/ai-orchestrator

Gemeinsame KI-Schicht fuer Wedding Consultant, Siggi und spaetere Research-Workflows.

## Aktueller Code

- `src/index.ts` enthaelt den Ollama-Client, plain-text Chat-Orchestrierung fuer kleine CPU-Modelle, strukturierte Fallbacks und weiter den Vendor-Research-Brief
- `src/server.ts` startet den internen Fastify-Dienst
- `src/index.test.ts` deckt JSON-Parsing, plain-text Antworten und beide Chat-Endpunkte ab

## Interne Endpunkte

- `GET /health`
- `POST /chat/wedding-consultant`
- `POST /chat/siggi-intake`
- `POST /voice/transcribe`
- `POST /voice/speak`

## Zielbild

- eine gemeinsame lokale LLM-Schicht fuer mehrere Produkte auf dem VPS
- sichere Fallbacks, damit Wedding und Siggi bei Modellproblemen nicht hart brechen
- spaeter auch Voice- und Dokumenten-Workflows ueber denselben internen Dienst

## Wichtige Umgebungsvariablen

- `OLLAMA_BASE_URL`, Standard `http://127.0.0.1:11434`
- `OLLAMA_MODEL`, Standard `qwen3:1.7b`

## CPU-first Empfehlung

- fuer natuerlichere Gespräche auf einem kleinen CPU-VPS ist `qwen3:1.7b` aktuell die stabile Standardwahl
- fuer noch mehr Tempo kann `qwen3:0.6b` als Fast-Mode genutzt werden, klingt aber knapper
- die Chat-Orchestrierung nutzt bewusst plain-text Antworten statt strikter JSON-Ausgabe, weil kleine Modelle damit auf CPU deutlich robuster und schneller antworten

## Deployment-Hinweis

Auf `htown` laeuft der Dienst als eigener Systemd-Service und wird von der Wedding API intern ueber `AI_ORCHESTRATOR_URL` angesprochen. Fuer Voice-Features erwartet der Orchestrator zusaetzlich einen lokalen Python-Voice-Worker unter `VOICE_RUNTIME_URL`. Fuer Live-Deploys unter Subpfaden sollte die Web-App mit `VITE_BASE_PATH` gebaut werden.
