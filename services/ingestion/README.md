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
- `SITE_CRAWLER_COMMAND` fuer den hostgebundenen Crawl-Fallback
- `SITE_CRAWLER_TIMEOUT_MS` optionales Timeout pro Fallback-Aufruf

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
- `SITE_CRAWLER_MIN_BROWSER_RECORDS` default `2` (darunter greift Crawler-Fallback)
- `SITE_CRAWLER_MAX_PAGES` default `8`
- `SITE_CRAWLER_FETCH_TIMEOUT_MS` default `15000`

Adapter-Extraktion (live):

- Suchlauf ueber Portal-Domain + Kategorie + Region
- Portal-Fallback-Seiten (`kontakt`, `impressum`, `ueber-uns`)
- Follow-up auf externe Vendor-Links aus Portallisten
- strukturierte Datennutzung aus `application/ld+json` (Schema.org)
- Felder: Name, Website, Quelle, Adresse, Telefon, E-Mail, Oeffnungszeiten, Preis-Hinweise
- zusaetzliche Signale: `ratingValue`, `ratingCount`, `sourceQualityScore`
- harte Qualitaetsfilter gegen Link-Shortener und Low-Value-Verzeichnistreffer
- fragliche Treffer werden nicht verworfen, sondern in Quarantaene geschrieben:
  - `output/ingestion/vendor-discovery-quarantine.json`
  - inklusive Quarantaenegrund fuer spaetere manuelle Pruefung
  - Quarantaene ist append-only (Kandidaten bleiben erhalten, nur manuelle Nacharbeit entscheidet)

Manueller Review-Export:

```bash
npm run quarantine:report --workspace @wedding/ingestion
```

Schreibt:

- `output/ingestion/quarantine-review.md`

Crawler-Stack-Hinweis:

- Skill-Suche via `npx skills find crawler` wurde eingebunden.
- Installiert: `mindmorass/reflex@site-crawler` als stabilere Crawl-Basis fuer die naechste Adapter-Stufe.
- Aktive technische Fallback-Stufe:
  - `services/ingestion/scripts/site-crawler-adapter.mjs`
  - wird automatisch genutzt, wenn Browser-Use zu wenig Treffer liefert oder fehlschlaegt.

Empfohlener htown-Cron fuer den Free-Baseline-Lauf (woechentlich Sonntag 03:30):

```bash
30 3 * * 0 cd /home/kevin/workspace/weddingplanner && npm run pipeline:weekly --workspace @wedding/ingestion >> /home/kevin/workspace/weddingplanner/output/ingestion/cron-weekly.log 2>&1
```

## Batch-Sweep Deutschland (neu)

Fuer konsequente Flaechenabdeckung kann die Pipeline regionen- und kategorieweise in Paketen laufen:

```bash
BROWSER_USE_CLI_COMMAND="node services/ingestion/scripts/browser-use-adapter.mjs" \
VENDOR_BATCH_REGION_SIZE=2 \
VENDOR_BATCH_CATEGORY_SIZE=3 \
VENDOR_BATCH_REGION_LIMIT=10 \
VENDOR_BATCH_CATEGORY_LIMIT=9 \
npm run pipeline:batch --workspace @wedding/ingestion
```

Batch-Parameter:

- `VENDOR_BATCH_MODE` = `weekly-baseline` oder `premium-deep-scan`
- `VENDOR_BATCH_REGION_SIZE` Anzahl Regionen pro Sweep-Paket
- `VENDOR_BATCH_CATEGORY_SIZE` Anzahl Kategorien pro Paket
- `VENDOR_BATCH_REGION_LIMIT` limitierte Pilot-Runs
- `VENDOR_BATCH_CATEGORY_LIMIT` limitierte Pilot-Runs
- `VENDOR_BATCH_REGION_OFFSET` rotiert den Startpunkt der Regionenliste
- `VENDOR_BATCH_CATEGORY_OFFSET` rotiert den Startpunkt der Kategorienliste

Outputs:

- einzelne Run-Reports `output/ingestion/batch-run-*.json`
- Gesamtsummary `output/ingestion/batch-summary-*.json`

Produktions-Scheduler-Helfer:

- `services/ingestion/scripts/run-batch-rotating.sh`
- berechnet taeglich den Offset per `date +%j` und rotiert so Regionen/Kategorien automatisch
- `services/ingestion/scripts/continuous-runner.mjs`
  - faehrt kleine Batch-Pakete dauerhaft nacheinander im Hintergrund
  - schreibt Runtime-Status nach `output/ingestion/continuous-runner-state.json`

Beispiel Start im Hintergrund (htown):

```bash
cd /home/kevin/workspace/weddingplanner
nohup env BROWSER_USE_CLI_COMMAND=/home/kevin/workspace/weddingplanner/services/ingestion/scripts/browser-use-adapter.mjs VENDOR_BATCH_REGION_SIZE=1 VENDOR_BATCH_CATEGORY_SIZE=1 VENDOR_BATCH_REGION_LIMIT=1 VENDOR_BATCH_CATEGORY_LIMIT=1 VENDOR_BATCH_INTERVAL_SECONDS=45 node services/ingestion/scripts/continuous-runner.mjs >> services/ingestion/output/ingestion/continuous-runner.log 2>&1 &
```

Live-Monitor:

- UI: `/wedding/coverage`
- API: `/wedding/api/prototype/ingestion/coverage`

## Datenregel

Directory-Sources wie Portale oder Rankings sind nur fuer Discovery erlaubt.
Produktiv publiziert werden sollen nur:

- first-party Facts von Vendor-Websites
- strukturierte Business-Facts
- claimed data
- Datensaetze mit klarer Provenance und Freshness
