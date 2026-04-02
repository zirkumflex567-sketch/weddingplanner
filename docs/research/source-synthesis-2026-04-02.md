# Recherche-Synthese vom 2026-04-02

## Zweck

Diese Datei fasst die vier vorhandenen Recherchequellen zusammen:

- `chatgpt.txt`
- `deepseek.txt`
- `gemini.txt`
- `grok.txt`

Zusaetzlich wurden am 2026-04-02 einige Kernannahmen kurz gegen offizielle Quellen gegengeprueft, damit wir nicht nur auf KI-Zusammenfassungen bauen.

## Gemeinsame Kernaussagen ueber alle vier Quellen

### 1. "Basic wedding planning" ist bereits Commodity

Alle vier Quellen kommen zum gleichen Kernpunkt:

- Checkliste
- Budget-Tracker
- Gaesteliste
- RSVP
- Seating
- Wedding Website
- Vendor-Verzeichnisse

sind am Markt bereits Standard. Damit gewinnen wir nicht.

### 2. Der eigentliche Hebel ist ein proaktiver Copilot

Die gemeinsame Produktthese lautet nicht "noch ein Planer", sondern:

- weniger manuelles Denken
- weniger Tool-Hopping
- weniger Such- und Abstimmungschaos
- bessere Entscheidungen aus Budget, Stil, Region und Verfuegbarkeit

Das Produkt muss operativ helfen, nicht nur Inhalte sammeln.

### 3. DACH-/Deutschland-Fokus ist ein realistischer Differenzierungsraum

Wiederkehrende Themen in allen Quellen:

- Standesamt-Logik
- Dokumente und Fristen
- deutschsprachige Kommunikation
- regionale Vendor-Suche
- Datenschutz / Self-Hosting

Das ist konsistent genug, um als Produktpfeiler zu gelten.

### 4. Vendor-Datenqualitaet ist strategisch wichtiger als reine Feature-Breite

Die Recherchen betonen mehrfach:

- Paare brauchen keine groessere Liste, sondern bessere Treffer
- Preisnaehe, Stil-Fit, Verfuegbarkeit und Antwortgeschwindigkeit sind wichtiger als Masse
- spaeter entsteht hier ein Daten-Moat

### 5. Ein web-first MVP ist der sinnvollste Start

Alle vier Quellen tendieren zu:

- responsive Web-App statt nativer App zuerst
- fruehe Konzentration auf Planungskern
- Vendor-Suche nur fuer die wichtigsten Kategorien im MVP
- Vendor-Portal erst spaeter

## Kurz validierte Signale aus offiziellen Quellen

### Marktniveau

Ein schneller Live-Sanity-Check bestaetigt, dass etablierte Produkte die Grundfunktionen bereits abdecken:

- [The Knot](https://www.theknot.com/)
- [Bridebook](https://bridebook.com/)

Das stuetzt die Annahme, dass wir nicht mit "mehr Listen" differenzieren.

### Rechtlicher / administrativer DACH-Pfeiler

Das [Bundesportal zur Anmeldung der Eheschliessung](https://verwaltung.bund.de/leistungsverzeichnis/DE/leistung/99059001104000/herausgeber/BB-100036805/region/120000000000) bestaetigt den Grundablauf:

- Anmeldung der Eheschliessung beim zustaendigen Standesamt
- Eheschliessung grundsaetzlich in jedem Standesamt in Deutschland moeglich
- Name, Unterlagen und Sonderfaelle sind ein echter eigener Produktbereich

Die rechtliche / administrative Begleitung ist also kein "nice to have", sondern ein valider Produktbaustein.

### Self-hosted AI als glaubwuerdige technische Basis

Ein kurzer Dokumentations-Check zu [Ollama](https://docs.ollama.com/) bestaetigt fuer den aktuellen Stand:

- OpenAI-kompatible Endpunkte
- Tool Calling
- strukturierte JSON-Ausgabe
- Embeddings

Das reicht aus, um Ollama als plausible Basiskomponente fuer einen privacy-first Assistenten im Architekturentwurf zu fuehren.

## Wo die vier Quellen sich unterscheiden

### 1. Datenbeschaffung

Spannung:

- aggressives Scraping als schneller Hebel
- versus sauberere Kombination aus offenen Daten, claimed profiles und eigener Extraktion

Arbeitsannahme:

- im MVP eher konservativ starten
- keine Plattform-Kopie
- keine personenbezogene Massenextraktion
- lieber kontrollierte Qualitaet als fragiles Volumen

### 2. MVP-Breite

Einige Quellen wollen frueh sehr viel:

- Papeterie
- Moodboards
- Day-of Control Room
- Vendor-Portal
- Angebots-/Vertragsmodule

Andere implizieren einen schlankeren Kern.

Arbeitsannahme:

- Planungskern zuerst
- Vendor-Matching fuer wenige Kategorien
- Budget und Aufgabenlogik frueh
- Day-of, Design-Studio und Vendor-Portal spaeter

### 3. Technische Stack-Details

Es gibt verschiedene Vorschlaege:

- React / Next.js
- Vue / Svelte
- Node / Express / FastAPI
- unterschiedliche Modell- und Datenbankvarianten

Das ist aktuell noch keine Widerspruchsfrage, sondern eine offene Architekturentscheidung.

## Vorlaeufige Schlussfolgerung

Fuer die weitere Arbeit behandeln wir das Projekt vorerst so:

> Ein DACH-orientierter, privacy-first Hochzeits-Co-Pilot, der aus wenigen Eingaben einen belastbaren Plan, priorisierte To-dos, Budgetfuehrung und bessere Vendor-Empfehlungen erzeugt.

### Empfohlener MVP-Fokus

- Couple-Onboarding
- persoenlicher Plan / Timeline / Task-System
- Budget-Grundlogik
- Vendor-Suche fuer wenige Kernkategorien
- legal/admin knowledge fuer Deutschland

### Bewusst nicht zuerst

- kompletter Marketplace
- breite Vendor-Monetarisierung
- komplexes Seating/Floor-Planning
- vollwertiges Papeterie-Studio
- massive Scraping- oder RAG-Infrastruktur

## Offene Forschungsfelder ab hier

- Welche Vendor-Datenquellen sind fuer Deutschland legal, nachhaltig und qualitativ genug?
- Wie viel "KI-Automatisierung" ist im ersten Release wirklich nutzbar statt nur beeindruckend?
- Welche Informationen brauchen Paare im Onboarding unbedingt, damit spaetere Vorschlaege hochwertig werden?
- Wie genau soll der Vertrauensvorteil "privacy-first" in Produkt und Marketing formuliert werden?

## Referenzen

### Lokale Arbeitsquellen

- `chatgpt.txt`
- `deepseek.txt`
- `gemini.txt`
- `grok.txt`

### Externe Sanity-Checks

- [The Knot](https://www.theknot.com/)
- [Bridebook](https://bridebook.com/)
- [Bundesportal: Eheschliessung Anmeldung](https://verwaltung.bund.de/leistungsverzeichnis/DE/leistung/99059001104000/herausgeber/BB-100036805/region/120000000000)
- [Ollama Docs](https://docs.ollama.com/)
