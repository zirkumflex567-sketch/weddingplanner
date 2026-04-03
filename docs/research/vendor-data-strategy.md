# Vendor-Datenstrategie

## Ziel

Eine nachhaltige Vendor-Datenbasis aufbauen, die fuer Nutzer nuetzlich ist und uns spaeter nicht rechtlich oder qualitativ um die Ohren fliegt.

## Grundprinzip

Nicht nur "moeglichst viele Vendoren", sondern:

- brauchbare Felder
- nachvollziehbare Herkunft
- aktualisierbare Daten
- saubere Qualitaet

Gleichzeitig soll die Datenbasis kuenftig bewusst breiter werden:

- deutschlandweite Grundausstattung fuer Free
- tiefer Radius-/PLZ-Scan fuer Premium
- klassische Hochzeitsanbieter plus alternative Event- und Venue-Kandidaten
- Unterkunfts- und Hotelpfade fuer Gaeste rund um die Feier

## Bevorzugte Datenquellen in Reihenfolge

### 1. Manuell kuratierte Seed-Daten

Fuer den MVP ist das die sicherste Option.

Vorteile:

- hohe Qualitaetskontrolle
- klarer Scope
- keine versteckten rechtlichen Nebenwirkungen

### 2. Claimed Data

Spaeter koennen Vendoren eigene Profile bestaetigen oder pflegen.

Vorteile:

- hoehere Aktualitaet
- bessere Datenqualitaet
- natuerlicher Einstieg in ein spaeteres B2B-Modell

### 3. Offene oder lizenzierte Daten

Wo sinnvoll, koennen offene Geo- oder Places-Daten die Grundstruktur ergaenzen.

Nutzen:

- Adresse
- Ort
- Kategorien
- Lagekontext

### 4. Strukturierte Extraktion von Vendor-eigenen Web-Inhalten

Nur konservativ und bewusst:

- Kontaktinformationen
- Leistungsbeschreibungen
- Preisanker
- Stilhinweise
- FAQ-Signale

Nicht Ziel:

- komplette Portalkopien
- unkontrollierte Review-Uebernahmen
- personenbezogene Datensammlungen

## Mindestfelder fuer MVP-Vendoren

Ein Vendor sollte fuer den MVP mindestens haben:

- Name
- Kategorie
- Region / Einsatzgebiet
- Website oder Kontaktweg
- grober Preisanker oder Preisband
- Stil-Tags
- grobe Kapazitaets-/Eignungshinweise
- Quellenhinweis
- Freshness-/Qualitaetsstatus

Ohne diese Felder ist ein Match nur schwer glaubwuerdig.

## Ingestion-Stufen

### Stage 1: Raw Capture

- Quelle festhalten
- Rohdaten ablegen
- keine aggressive Transformation

### Stage 2: Normalize

- Kategorien vereinheitlichen
- Regionen vereinheitlichen
- Dubletten erkennen
- Preisangaben in interne Struktur bringen

### Stage 3: Curate

- fehlende Pflichtfelder markieren
- Qualitaet einschaetzen
- Fit-relevante Tags ergaenzen

### Stage 4: Publish

- nur ausreichend gute Datensaetze fuer Produktsuche freigeben

## Qualitaetsregeln

- jede Empfehlung braucht einen Quellenkontext
- unvollstaendige Daten duerfen nicht mit falscher Praezision dargestellt werden
- Preisangaben sind als Band oder Approximation zu behandeln, solange keine echten Angebote vorliegen
- Freshness muss sichtbar oder intern pruefbar sein

## Tier-Modell fuer die naechste Umsetzung

### Free

- laeuft auf `htown`
- baut eine deutschlandweite Grundausstattung aus grossen Portalquellen
- soll viele Kernvendoren schon ohne Premium nutzbar machen

### Premium

- startet auf derselben Datenbasis
- fuehrt aber fuer Wunsch-PLZ, Wunschstadt oder Radius einen tieferen Suchlauf aus
- sucht danach zusaetzlich explizit nach unabh??ngigen offiziellen Websites und Ausweichoptionen

## Unterkunft als eigener Produktbaustein

Die Uebernachtung darf nicht duenn und zufaellig bleiben.

Ziel:

- Venue-nahe Hotels und Uebernachtungen strukturiert ausgeben
- bevorzugt auf Booking.com oder gleichwertige Hotelziele leiten
- spaeter Affiliate- und Routing-Logik im Gastportal verankern

## Alternative Venue-Kandidaten bewusst einschliessen

Wir suchen nicht nur ???explizite Hochzeitslocations???, sondern bewusst auch:

- Eventlocations
- Boutique-Hotels
- Schlosshotels
- Weingueter
- Restaurants mit Eventflaechen
- Gutshaeuser / Hofanlagen / Scheunen
- Kultur- und Tagungshaeuser mit passendem Ambiente

Damit wird der Produktwert deutlich hoeher, besonders bei Terminengpaessen.

