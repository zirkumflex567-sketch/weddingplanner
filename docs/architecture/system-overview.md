# Systemueberblick

## Zielbild

Ein privacy-first System, das Planung, Vendor-Daten und KI-Unterstuetzung zusammenfuehrt, ohne alles in einen einzigen, unklaren Backend-Block zu kippen.

## Erste Komponenten

### 1. Web App

Die Web App ist die Hauptoberflaeche fuer Paare:

- Onboarding
- Dashboard
- Aufgaben
- Budget
- Vendor-Vergleich

### 2. API / Domain Layer

Die API bildet die Geschaeftslogik ab:

- Weddings
- Couples
- Guests
- Tasks
- Budget-Posten
- Vendor-Kandidaten

### 3. Data Ingestion Layer

Die Ingestion-Pipeline verarbeitet externe und spaetere interne Daten:

- Rohimporte
- strukturierte Extraktion
- Normalisierung
- Anreicherung
- Qualitaetssicherung

### 4. AI Orchestrator

Die KI-Ebene erzeugt keine "freie Magie", sondern strukturierte Hilfen:

- Planentwuerfe
- Aufgaben-Priorisierung
- Vendor-Zusammenfassungen
- Vergleichserklaerungen
- spaetere Dokumenten- und Angebotsauswertung

Wichtige Betriebsannahme fuer dieses Projekt:

- Modell-Inferenz und spaetere Dokumentenverarbeitung laufen auf `Shadow`
- der VPS uebernimmt nur Webhosting, API-Bereitstellung und servernahe Dienste
- KI-Compute ist damit bewusst vom oeffentlichen Runtime-Surface getrennt

### 5. Persistenz

Fruehe Arbeitsannahme:

- relationale Datenbank fuer Kernobjekte
- optional spaeter Vektor-/Suchschicht fuer semantische Recherche
- Dateispeicher fuer Dokumente und Medien

## Architekturprinzipien

### Structured first

KI-Ausgaben sollen moeglichst frueh in strukturierte Form gebracht werden:

- Tasks
- Felder
- Scores
- Empfehlungen mit Begruendung

### Human reviewable

Wichtige Ergebnisse muessen fuer Nutzer nachvollziehbar sein:

- warum ein Vendor vorgeschlagen wurde
- warum ein Task priorisiert wurde
- warum Budgetwarnungen ausgeloest wurden

### Privacy by design

Persoenliche und spaetere dokumentennahe Daten sind kein Nebenthema.
Deshalb muessen Modell- und Speicherschnittstellen klar bleiben.

### Replaceable components

Wir sollten einzelne Teile spaeter austauschen koennen:

- LLM-Anbieter oder self-hosted Modell
- Such-/Vektor-Layer
- Datenerfassungspipeline
- Storage-Backend

## Erster Systemfluss

1. Paar gibt Grunddaten im Onboarding ein.
2. API speichert den Wedding-Grundzustand.
3. AI Orchestrator erzeugt daraus Plan, Prioritaeten und erste Handlungsvorschlaege.
4. API liefert strukturierte Ergebnisse an die Web App.
5. Vendor-Daten werden separat aufbereitet und in eine suchbare, kuratierte Form ueberfuehrt.
6. Web App kombiniert Nutzerkontext und kuratierte Vendor-Daten fuer Vergleiche und Empfehlungen.

## Technische Leitplanken fuer spaeter

- Web-first, mobile-tauglich
- API klar von Ingestion trennen
- KI nicht direkt in UI-Komponenten verstecken
- produktkritische Datenmodelle nicht aus Prompt-Text ableiten, sondern explizit definieren
- Shadow als AI-Execution-Node behandeln, VPS als Hosting-Node
