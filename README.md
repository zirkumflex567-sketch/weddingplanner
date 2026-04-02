# Wedding

Arbeitsprojekt fuer einen DACH-orientierten, privacy-first Hochzeits-Co-Piloten.

## Status

Dieser Ordner enthaelt jetzt:

- vier bestehende Recherchedateien von verschiedenen KI-Modellen
- eine erste gemeinsame Dokumentationsbasis
- eine vorgeschlagene Projektstruktur fuer Produkt, API, Daten und KI-Orchestrierung
- einen ersten lauffaehigen Planning-Core als Workspace-Bootstrap

## Produktthese

Wir bauen keine weitere passive Hochzeits-Checkliste, sondern einen proaktiven, lokal datenstarken Hochzeits-Co-Piloten fuer Paare in Deutschland bzw. DACH:

- persoenliche Planung aus wenigen Eingaben
- bessere Vendor-Auswahl statt nur grosser Listen
- Budget-, Fristen- und Entscheidungsunterstuetzung
- privacy-first durch selbst gehostete KI-Komponenten

## Startpunkte

- [docs/README.md](docs/README.md)
- [docs/research/source-synthesis-2026-04-02.md](docs/research/source-synthesis-2026-04-02.md)
- [docs/research/vendor-market-67454-radius-40km-2026-04-02.md](docs/research/vendor-market-67454-radius-40km-2026-04-02.md)
- [docs/product/product-foundation.md](docs/product/product-foundation.md)
- [docs/product/mvp-scope.md](docs/product/mvp-scope.md)
- [docs/architecture/project-structure.md](docs/architecture/project-structure.md)
- [docs/architecture/tech-stack.md](docs/architecture/tech-stack.md)
- [docs/architecture/domain-model.md](docs/architecture/domain-model.md)
- [docs/questions/open-questions.md](docs/questions/open-questions.md)

## Vorgeschlagene Projektstruktur

- `apps/web/` fuer die Web-App bzw. PWA
- `services/api/` fuer Domain-Logik, Auth, Orchestrierung und Integrationen
- `services/ingestion/` fuer Vendor-Datenimport, Enrichment und Normalisierung
- `services/ai-orchestrator/` fuer Prompting, strukturierte Extraktion und Assistenten-Workflows
- `packages/shared/` fuer gemeinsame Typen, Schemas, Utilities und spaeter Design-Tokens
- `data/` fuer Rohdaten, kuratierte Datensaetze und spaeter generierte Artefakte
- `infra/` fuer Deployment-, Storage- und Betriebsartefakte
- `scripts/` fuer lokale Hilfsskripte und Import-Utilities
- `docs/` als Source of Truth fuer Forschung, Produkt, Architektur und Roadmap

## Aktuelle Annahmen

- Fokus zuerst auf Paare, nicht auf das Vendor-Portal
- web-first MVP statt nativer App
- Deutschland zuerst, DACH als naechster Schritt
- selbst gehostete KI ist Differenzierungsmerkmal, aber nicht Selbstzweck

## Naechste Entscheidungen

1. MVP-Grenze schaerfen: Was ist fuer den ersten echten Nutzertest zwingend?
2. Tech-Stack finalisieren: Web/App-Framework, API-Stack, Auth, DB, Storage.
3. Datenstrategie festziehen: lizenzierte Daten, claimed data, offene Daten, eigene Extraktion.
4. Domain-Modell festlegen: Couple, Wedding, Guest, Vendor, Quote, Task, Event, Document.

## Lokaler Start

- `npm install`
- `npm run test`
- `npm run dev:api`
- `npm run dev:web`
- `npm run audit:app` fuer einen echten End-to-End-Audit ueber Profilbibliothek, Guided Mode, RSVP, Budget und Vendor-Tracking
- `npm run test:consultant-smoke` fuer einen echten Browser-Smoke des Beratungs-Chats, solange API und Web lokal laufen

## Bereits umgesetzt

- `packages/shared` enthaelt jetzt einen ersten deterministischen Planning-Core
- `services/api` liefert `POST /planning/bootstrap`
- `services/api` speichert jetzt persistente Prototype-Workspaces inklusive Profilbibliothek, Guests, RSVP-Status, Ausgaben, Vendor-Tracking und Task-Status
- `apps/web` ist jetzt auf einen Guided-Only-Modus umgestellt: Profilbibliothek, neues Profil, Profil loeschen und danach nur noch ein aktiver Planungsschritt plus Wedding Consultant
- Gaeste bekommen jetzt einen oeffentlichen RSVP-Link fuer Selbstpflege von Antwort, Essenswahl und Nachricht
- `packages/shared` nutzt jetzt eine datengetriebene Vendor-Seed-Basis statt reiner Berlin-Hardcodes
- fuer `67454 / Hassloch` plus `40 km` liegt jetzt eine erste kuratierte Vendor-Abdeckung mit Quellenhinweisen vor
- ein gefuehrter Copilot-Flow mit `Planung starten` fuehrt jetzt Schritt fuer Schritt durch Fundament, Venue, Kern-Vendoren, Gaeste, Admin und Finalisierung
- der Beratungsmodus laeuft jetzt als Chat-Panel mit konkreten Antwortvorschlaegen, Freitext und Wiederaufnahme pro Workspace

## Aktuell nutzbarer Prototyp

- gespeicherte Hochzeitsprofile koennen angelegt, wieder aufgenommen und geloescht werden
- ein ausgewaehltes Profil wird ueber `localStorage` als aktive Beratung wieder aufgenommen
- Aenderungen am Hochzeitsprofil werden im Guided Mode gespeichert
- Guests koennen angelegt und per RSVP gepflegt werden
- Checklist-Aufgaben koennen abgehakt werden
- Budget-Positionen koennen als Angebot, Buchung oder bezahlte Ausgabe erfasst werden
- Vendor-Empfehlungen koennen als kontaktiert, angeboten, gebucht oder verworfen verfolgt werden
- Quotes, Paketnamen, Verfuegbarkeit, Vertragsstand, Anzahlungen, Follow-ups und Vendor-Notizen bleiben nach Reload im Workspace erhalten
- lokale Vendor-Matches fuer `67454 / Hassloch` zeigen jetzt Website- und Quellenlinks direkt im Guided Mode
- Gaeste koennen ueber eine oeffentliche RSVP-Seite selbst antworten und Essenshinweise hinterlassen
- Gaeste koennen jetzt auch Begleitung, Kinderzahl und Songwunsch ueber den RSVP-Flow pflegen
- eine erste oeffentliche Wedding-Website fuer Ablauf-, Reise-, Hotel- und Dresscode-Infos ist jetzt im Guided Mode pflegbar
- der Couple-Workspace zieht tab-uebergreifende RSVP-Aenderungen jetzt frisch aus der API
- Budget, Vendor-Matches, Event-Blueprints und DACH-Reminder reagieren auf das gespeicherte Profil
- die UI zeigt bewusst nur noch einen aktiven Planungsschritt statt einer ueberladenen Dashboard-Wand
- die laufende Beratung bleibt jetzt pro Workspace im Browser erhalten und kann nach Reload wieder aufgenommen werden
- der Kern-Vendoren-Schritt hat jetzt eine echte Angebotsflaeche mit Kategorie-Vergleich, Preisanker und Follow-up-/Vertragsstatus
