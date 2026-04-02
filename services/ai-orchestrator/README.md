# services/ai-orchestrator

Gemeinsame KI-Schicht fuer Wedding Consultant, Siggi und spaetere Research-Workflows.

## Aktueller Code

- `src/index.ts` enthaelt den Ollama-Client, strukturierte Chat-Orchestrierung und weiter den Vendor-Research-Brief
- `src/server.ts` startet den internen Fastify-Dienst
- `src/index.test.ts` deckt JSON-Parsing und beide Chat-Endpunkte ab

## Interne Endpunkte

- `GET /health`
- `POST /chat/wedding-consultant`
- `POST /chat/siggi-intake`

## Zielbild

- eine gemeinsame lokale LLM-Schicht fuer mehrere Produkte auf dem VPS
- sichere Fallbacks, damit Wedding und Siggi bei Modellproblemen nicht hart brechen
- spaeter auch Voice- und Dokumenten-Workflows ueber denselben internen Dienst

## Wichtige Umgebungsvariablen

- `OLLAMA_BASE_URL`, Standard `http://127.0.0.1:11434`
- `OLLAMA_MODEL`, aktuell fuer CPU-first VPS auf kleine Qwen-Modelle ausgelegt

## Deployment-Hinweis

Auf `htown` laeuft der Dienst als eigener Systemd-Service und wird von der Wedding API intern ueber `AI_ORCHESTRATOR_URL` angesprochen. Fuer Live-Deploys unter Subpfaden sollte die Web-App mit `VITE_BASE_PATH` gebaut werden.
