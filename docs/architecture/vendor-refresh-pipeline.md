# Vendor Refresh Pipeline

## Ziel

Deutschlandweite Vendor- und Venue-Daten nicht vorab massenhaft ziehen, sondern erst dann,
wenn ein Kunde fuer eine konkrete Suche bezahlt hat.

## Grundsatz

Die Pipeline arbeitet in zwei Modi:

- kuratierte Sofortabdeckung fuer vorhandene Seed-Regionen
- bezahlter Refresh fuer aktuelle deutschlandweite Daten

## Ablauf

1. Kunde bezahlt fuer eine konkrete Anfrage.
2. API erstellt einen `vendor-refresh-job`.
3. `services/ingestion` plant Suchraeume, Connectoren, Freshness und Publish-Gates.
4. Ein `vendor-refresh-run` fuehrt die Live-Connectoren fuer eine Kategorie aus.
5. Discovery findet Kandidaten ueber zulassige Quellen.
6. Facts und first-party Quellen werden extrahiert, gecrawlt und normalisiert.
7. Dedupe und Quality entscheiden, was publiziert werden darf.
8. Erst danach erscheinen neue Datensaetze im Produkt.

Zwischen Quality und Produkt-Publish liegt jetzt explizit ein Review-Schritt:

- Run erzeugt reviewbare Kandidaten
- Kandidaten werden intern approved oder rejected
- nur approved Kandidaten gehen in den internen Katalog

## Connector-Klassen

- `directory-discovery`: nur Kandidatenfindung, nie Produkt-Truth
- `google-places`: strukturierte Business-Facts
- `vendor-websites`: first-party Facts, Leistungen, PDFs, Preisanker
- `claimed-profiles`: spaetere vom Vendor gepflegte Daten
- `self-hosted-nominatim`: Geocoding und Suchraumplanung

## Publish-Gate

Pflichtfelder vor Publish:

- Name
- Kategorie
- Region
- Kontakt oder Website
- Provenance
- Freshness Timestamp

Geblockte Felder als Produkt-Truth:

- Drittportal-Reviewscores
- Drittportal-Reviewcounts
- Verzeichnis-Rankings

## Bedeutung fuer das Repo

Der Planning-Core darf weiterhin kuratierte Seeds fuer Demo und Prototyping nutzen.
Die deutschlandweite SaaS-Faehigkeit kommt aber nicht mehr aus Hardcodes im Planning-Core,
sondern aus der Refresh-Pipeline.

## Aktueller Runtime-Stand

Die erste ausfuehrbare Runtime ist jetzt im Repo vorhanden:

- Brave Search als Discovery-Quelle fuer Kandidatenfindung
- Google Places Text Search fuer strukturierte Business-Facts
- Vendor-Website-Fetching mit leichtem Same-Origin-Crawling fuer first-party Facts
- Run-Persistenz mit Connector-Status, Preview-Daten und Qualitaetsreport
- Review-Kandidaten und interner Publish-Katalog

Qualitaetsreports unterscheiden aktuell zwischen:

- `ready-for-review`
- `needs-attention`

und tragen konkrete Issues wie fehlende Pflichtfelder, fehlende Publish-Records oder nur auditierte geblockte Felder.

## Browser-Use Discovery Pipeline (neu)

Die Pipeline hat jetzt einen orchestrierten Lauf fuer zwei Tier-Modi:

- `weekly-baseline` (Free): fuehrt den regulaeren Wochenlauf auf htown aus
- `premium-deep-scan`: fuehrt einen schaerferen Suchlauf on-demand aus

Technischer Ablauf:

1. Pro Kategorie wird ein normaler `vendor-refresh-run` ausgefuehrt (Brave/Places/Website-Crawl).
2. Danach werden alle relevanten Portale aus `vendorSourcePortals` mit Browser Use headless abgefragt.
3. Ergebnisse werden in eine persistente Discovery-DB zusammengefuehrt:
   - `output/ingestion/vendor-discovery-db.json`
4. Weekly-Laufzeitfenster wird in State gespeichert:
   - `output/ingestion/pipeline-state.json`
5. Jeder Lauf erzeugt einen Report:
   - `output/ingestion/run-<mode>-<timestamp>.json`

Wichtig:

- Kein manuelles Sammeln von Portaldaten im Codefluss.
- Free und Premium nutzen denselben Datenpfad, Premium laeuft nur tiefer und on-demand.
- Browser-Use ist bewusst als externes CLI angebunden, damit htown/shadow denselben Adapter nutzen koennen.
