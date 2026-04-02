# Vorgeschlagene Projektstruktur

## Ziel der Struktur

Die Struktur soll frueh sauber trennen zwischen:

- Produktflaeche fuer Paare
- Business-Logik
- Datenbeschaffung
- KI-Orchestrierung
- geteilten Modellen
- Doku und Betrieb

Sie ist absichtlich technologieoffen genug, damit wir spaeter Next.js, SvelteKit, FastAPI oder aehnliche Entscheidungen noch sauber einsetzen koennen.

## Verzeichnisvorschlag

```text
wedding/
├── apps/
│   └── web/
├── services/
│   ├── api/
│   ├── ingestion/
│   └── ai-orchestrator/
├── packages/
│   └── shared/
├── data/
│   ├── raw/
│   └── curated/
├── infra/
├── scripts/
└── docs/
```

## Verantwortung pro Bereich

### `apps/web/`

Geplante Nutzeroberflaeche:

- Couple-Onboarding
- Dashboard
- Task- und Budgetansicht
- Vendor-Suche
- spaeter Wedding Website / Vendor Views

### `services/api/`

Zentrale Backend-Flaeche fuer:

- Auth
- Sessions
- Domain-Logik
- Task- und Budgetberechnung
- Vendor-Abfragen
- Integrationen zu KI- und Datendiensten

### `services/ingestion/`

Getrennte Pipeline fuer:

- Datenimporte
- strukturierte Extraktion
- Normalisierung
- Duplikat-Handling
- spaetere Freshness-Jobs

Das bleibt bewusst ausserhalb der Haupt-API, damit Datenarbeit und Produktlogik nicht vermischt werden.

### `services/ai-orchestrator/`

Eigener Bereich fuer:

- Prompts
- strukturierte Outputs
- Tool-Aufrufe
- Workflow-Komposition
- spaetere Guardrails und Evaluationen

So bleibt KI-Logik testbar und isoliert statt ueber die ganze App verstreut.

### `packages/shared/`

Geteilte Artefakte fuer:

- Typen / Schemas
- Validierung
- Mapping-Konstanten
- gemeinsame Utilities
- spaetere UI-Tokens oder Design-Grundlagen

### `data/raw/`

Unveraenderte oder nur minimal aufbereitete Eingangsdaten:

- Rohimporte
- Research-Exporte
- spaetere Vendor-Imports

### `data/curated/`

Bereinigte und produktnahe Datensaetze:

- normalisierte Vendor-Eintraege
- Taxonomien
- Seeds fuer Demo- oder Testdaten

### `infra/`

Betriebsrelevante Artefakte:

- Deployment
- Reverse Proxy
- Storage-Konfiguration
- Background Jobs
- spaetere CI/CD- oder Hosting-Notizen

### `scripts/`

Lokale Arbeitshelfer:

- Imports
- Setup-Skripte
- Datenchecks
- Seeds
- Diagnose-Utilities

## Warum diese Trennung fuer dieses Produkt wichtig ist

Das Projekt ist sehr wahrscheinlich kein "nur Frontend" und kein "nur CRUD-Backend".
Es kombiniert:

- Nutzerflaechen
- regelbasierte Domain-Logik
- externe Datenarbeit
- KI-gestuetzte Entscheidungen

Wenn wir das frueh in getrennte Verantwortungsbereiche schneiden, bleibt das Projekt wartbar.

## Bewusste Nicht-Entscheidungen

Noch offen und absichtlich nicht in die Struktur eingebacken:

- Monorepo-Tooling
- konkrete Programmiersprachen pro Service
- DB-Migrations-Tooling
- Queue / Worker-Setup
- Hosting-Provider

Diese Entscheidungen treffen wir erst nach MVP-Schaerfung.
