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
4. Discovery findet Kandidaten ueber zulassige Quellen.
5. Facts und first-party Quellen werden extrahiert und normalisiert.
6. Dedupe und Quality entscheiden, was publiziert werden darf.
7. Erst danach erscheinen neue Datensaetze im Produkt.

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
