# services/ingestion

Ausfuehrbarer Kern fuer die bezahlte Vendor-Refresh-Pipeline.

## Verantwortung

- Discovery-Planung fuer deutschlandweite Suchraeume
- Connector-Auswahl pro Quelle und Kategorie
- Freshness-Fenster fuer bezahlte Refresh-Jobs
- Stage-Modell fuer Discovery, Facts, Normalize, Dedupe, Quality und Publish
- Publish-Gate, das Drittportal-Rankings als Produkt-Truth blockiert

## Aktueller Code

- `src/index.ts` plant Refresh-Jobs aus einer bezahlten Kundenanfrage
- `src/connectors.ts` normalisiert Discovery-, Places- und Website-Fakten in publish-safe Preview-Daten
- `src/runtime.ts` fuehrt echte Connector-Runs mit Env-Guards, Crawling und Qualitaetsreport aus
- `src/index.test.ts` prueft deutschlandweite Coverage, source-safe Connector-Planung, Live-Run-Ausfuehrung und Publish-Gates

## Laufzeit-Konfiguration

Fuer echte Connector-Runs nutzt der Ingestion-Service aktuell:

- `BRAVE_SEARCH_API_KEY` fuer Discovery ueber Brave Search
- `BRAVE_SEARCH_API_BASE_URL` optional fuer alternative Base-URLs
- `GOOGLE_MAPS_API_KEY` fuer Google Places Text Search
- `GOOGLE_PLACES_API_BASE_URL` optional fuer alternative Base-URLs
- `BROWSER_USE_CLI_COMMAND` fuer den headless Browser-Use-Discovery-Lauf
- `BROWSER_USE_TIMEOUT_MS` optionales Timeout pro Browser-Use-Aufruf

Wenn Schluessel fehlen, werden Connectoren nicht hart crashen, sondern mit `skipped` und klarer Note im Run abgelegt.

## Pipeline-Modi

- `npm run pipeline:weekly --workspace @wedding/ingestion`
  - fuehrt den Free-Baseline-Lauf aus
  - nutzt Weekly-State in `output/ingestion/pipeline-state.json`
  - schreibt aktualisierte Discovery-Daten nach `output/ingestion/vendor-discovery-db.json`
- `npm run pipeline:premium --workspace @wedding/ingestion`
  - fuehrt den Premium-Deep-Scan fuer denselben Datenpfad aus
  - ist als on-demand Lauf fuer Premium-Anfragen gedacht

Optionale Runtime-Parameter:

- `VENDOR_PIPELINE_REGION` (default `Deutschland`)
- `VENDOR_PIPELINE_CATEGORIES` (CSV, z. B. `venue,catering,music`)
- `VENDOR_PIPELINE_FORCE=true` ignoriert den Weekly-Intervallschutz

Lokaler headless Smoke-Test ohne echtes Browser-Use-CLI:

```bash
BROWSER_USE_CLI_COMMAND="node services/ingestion/scripts/browser-use-mock.cjs" npm run pipeline:weekly --workspace @wedding/ingestion
```

Produktiver Headless-Adapter (search + extraction):

```bash
BROWSER_USE_CLI_COMMAND="node services/ingestion/scripts/browser-use-adapter.mjs" npm run pipeline:weekly --workspace @wedding/ingestion
```

Adapter-Tuning:

- `BROWSER_USE_ADAPTER_MAX_RESULTS_FREE` default `8`
- `BROWSER_USE_ADAPTER_MAX_RESULTS_PREMIUM` default `16`
- `BROWSER_USE_ADAPTER_TIMEOUT_MS` default `15000`

Empfohlener htown-Cron fuer den Free-Baseline-Lauf (woechentlich Sonntag 03:30):

```bash
30 3 * * 0 cd /home/kevin/workspace/weddingplanner && npm run pipeline:weekly --workspace @wedding/ingestion >> /home/kevin/workspace/weddingplanner/output/ingestion/cron-weekly.log 2>&1
```

## Datenregel

Directory-Sources wie Portale oder Rankings sind nur fuer Discovery erlaubt.
Produktiv publiziert werden sollen nur:

- first-party Facts von Vendor-Websites
- strukturierte Business-Facts
- claimed data
- Datensaetze mit klarer Provenance und Freshness
