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

Wenn Schluessel fehlen, werden Connectoren nicht hart crashen, sondern mit `skipped` und klarer Note im Run abgelegt.

## Datenregel

Directory-Sources wie Portale oder Rankings sind nur fuer Discovery erlaubt.
Produktiv publiziert werden sollen nur:

- first-party Facts von Vendor-Websites
- strukturierte Business-Facts
- claimed data
- Datensaetze mit klarer Provenance und Freshness
