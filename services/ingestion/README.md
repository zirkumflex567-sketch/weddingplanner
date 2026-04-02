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
- `src/index.test.ts` prueft deutschlandweite Coverage, source-safe Connector-Planung und Publish-Gates

## Datenregel

Directory-Sources wie Portale oder Rankings sind nur fuer Discovery erlaubt.
Produktiv publiziert werden sollen nur:

- first-party Facts von Vendor-Websites
- strukturierte Business-Facts
- claimed data
- Datensaetze mit klarer Provenance und Freshness
