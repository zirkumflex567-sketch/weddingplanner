# Vendor Source Network 2026-04-03

## Zielbild

Wir wollen nicht nur ein paar kuratierte lokale Seeds, sondern eine belastbare Grundausstattung fuer ganz Deutschland:

- Hochzeitslocations
- Caterer
- Fotografen
- DJs / Musik
- Floristik
- Styling / Brautmode
- spaeter weitere Kategorien wie Torte, Papeterie, Transport, Kinderbetreuung, Vermietung
- zusaetzlich Uebernachtung rund um Venue und Feier

Dafuer trennen wir kuenftig klar zwischen:

- `Free`: deutschlandweite Grundausstattung durch htown
- `Premium`: tiefer Radius-/PLZ-Scan plus explizite Suche nach zusaetzlichen unabh??ngigen Kandidaten

## Quellnetz fuer die Grundausstattung

### Wedding-Marketplaces

- `hochzeits-location.info`
  - Venue-Spezialportal fuer DACH
  - stark fuer Hochzeitslocations, Bewertungen, Ausstattung und Vergleich
- `Hochzeitslocation.de`
  - deutschlandweiter Location-Index
  - gut fuer Marktbreite und Venue-Cross-Checks
- `WeddyPlace`
  - breite Hochzeitsdienstleister-Abdeckung
  - wichtig fuer Kategorien jenseits von Locations
- `weddix`
  - langjaehriges deutsches Hochzeitsportal mit Branchenbuch
  - stark fuer deutschlandweite Basisausstattung
- `WedCheck`
  - hilfreich fuer Spezialkategorien und Zusatzgewerke
- `Weddchecker`
  - weitere Wedding-Quelle fuer Coverage und Duplikat-Pruefung

### Event-/General-Marketplaces

- `eventlocations.com`
  - wichtig fuer alternative Locations, die nicht nur auf Hochzeiten ausgerichtet sind
- `fiylo`
  - Eventlocations und Dienstleister in Deutschland
  - wertvoll fuer Ausweichlocations und Event-Catering
- `eventpeppers`
  - stark fuer Musik, Entertainment und Spezialacts
- `Trustlocal`
  - lokale Dienstleister mit Preis-/Bewertungssignalen
  - wichtig fuer Fotografen, Caterer, DJs und Services

### Unterkunft / Gastportal

- `Booking.com`
  - bevorzugter Zielpfad fuer Uebernachtung
  - spaeter mit Affiliate-Links und Venue-nahem Routing

## Produktlogik: Free vs Premium

### Free auf htown

Ziel:

- deutschlandweite Basisausstattung mit sauberem Quellenkontext

Vorgehen:

- grosse Portalquellen systematisch durchsuchen
- Datensaetze in das bestehende `VendorSeed`-/`VendorMatch`-Schema ueberfuehren
- Kontakt, Adresse, Preisquelle und Oeffnungszeiten mitziehen, wenn oeffentlich und belastbar
- alternative Eventlocations mit Hochzeitsfit mit aufnehmen
- Uebernachtung bevorzugt auf Booking.com-Ziele oder gleichwertige Hotelpfade leiten

### Premium Deep Scan

Ziel:

- fuer konkrete `PLZ`, `Ort` oder `Umkreis` tiefer suchen als die Grundausstattung

Vorgehen:

- erst Portalquellen im Wunschradius abgrasen
- dann explizit nach weiteren offiziellen Websites suchen
- bewusst auch Anbieter aufnehmen, die nicht primaer Hochzeit schreiben, aber vom Angebot passen
- Hotelauswahl enger ans Venue koppeln
- fuer Engpaesse echte Ausweichoptionen liefern

## Alternativkandidaten ausdruecklich mitdenken

Nicht nur klassisch ???Hochzeitslocation???, sondern auch:

- Gutshaeuser
- Weingueter
- Restaurants mit Eventflaechen
- Boutique-Hotels
- Schlosshotels
- Tagungshaeuser mit starkem Ambiente
- Industrie-Lofts
- Kulturbauten / Buergerhaeuser / Eventhallen
- Hofanlagen / Scheunen / Landhaeuser

Diese Alternativkandidaten sind besonders wichtig, wenn:

- beliebte Hochzeitslocations ausgebucht sind
- der Stil zwar passt, aber das Portal die Location nicht als Hochzeitshaus fuehrt

## Datentiefe pro Datensatz

Jeder Datensatz sollte nach Moeglichkeit enthalten:

- Name
- Kategorie
- Region / Stadt / PLZ
- Adresse
- Telefon
- E-Mail
- Website / Portfolio
- Quelle
- Preisanker plus Preisquelle
- Oeffnungszeiten, falls sinnvoll
- kurzer Fit-Hinweis

## Umsetzung im Code

Die formale Quell-Registry liegt jetzt in:

- `packages/shared/src/vendor-source-network.ts`

Diese Datei beschreibt:

- welche Portale wir absuchen
- wofuer sie stark sind
- welche Rolle sie im Free- und Premium-Weg spielen

## Naechste technische Schritte

1. htown-Crawler-/Refresh-Job fuer deutschlandweite Grundsammlung aufsetzen
2. Portalweise Normalisierung in das bestehende Vendor-Schema bauen
3. Dublettenlogik nach Name, Ort, Website und Kontakt verbessern
4. Unterkunftsmodul von ???lokale Zufallstreffer??? auf echtes Booking-/Hotel-Routing umstellen
5. Premium-Deep-Scan fuer PLZ / Radius / Stilfilter als separaten Lauf aufsetzen

