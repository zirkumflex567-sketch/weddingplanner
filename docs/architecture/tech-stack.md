# Technischer Start-Stack

## Entscheidung

Fuer den ersten Bootstrap setzen wir auf einen bewusst schlanken TypeScript-Stack:

- `npm` Workspaces als Monorepo-Basis
- `React` + `Vite` fuer die Web-App
- `Fastify` fuer die API-Schicht
- `Vitest` fuer Tests
- `TypeScript` ueber alle aktiven Pakete

## Warum genau dieser Stack

### npm Workspaces

`pnpm` ist lokal auf dieser Maschine derzeit nicht installiert. Mit npm Workspaces koennen wir sofort loslegen, ohne zusaetzliche globale Tooling-Annahmen.

### React + Vite

Fuer das erste produktive UI-Experiment ist das ein schneller und robuster Start:

- moderne DX
- schnelle Iteration
- geringer Bootstrap-Aufwand
- guter Fit fuer eine spaetere PWA

### Fastify

Fastify ist ein guter Start fuer eine klare, performante API mit niedriger Boilerplate und gutem Test-Flow ueber `app.inject()`.

Fuer dieses Projekt ist die API bewusst nicht der Ort fuer Modell-Compute. Sie ist der oeffentliche und deploybare Layer zwischen Web-App, Persistenz und spaeterer Shadow-KI-Orchestrierung.

### Vitest

Vitest passt natuerlich zu Vite und laeuft in Node 24 ohne Reibung. Das ist fuer den ersten TDD-Zyklus ideal.

## Aktuell verifizierte Versionen am 2026-04-02

- `react`: `19.2.4`
- `react-dom`: `19.2.4`
- `vite`: `8.0.3`
- `@vitejs/plugin-react`: `6.0.1`
- `vitest`: `4.1.2`
- `fastify`: `5.8.4`
- `@fastify/cors`: `11.2.0`
- `typescript`: `6.0.2`
- `@types/react`: `19.2.14`
- `@types/react-dom`: `19.2.3`
- `@types/node`: `25.5.0`

## Offizielle Referenzen

- [npm Workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
- [Vite Guide](https://vite.dev/guide/)
- [Fastify Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/)
- [Vitest Guide](https://vitest.dev/guide/)

## Bewusste Nicht-Entscheidungen

Noch nicht festgezogen:

- Datenbank-Layer
- Auth-Provider
- Queue / Background Jobs
- Persistenz fuer Vendor-Daten
- AI-Orchestrator-Runtime

Diese Bausteine ziehen wir nach, sobald der erste Planning Core als Vertical Slice steht.

## Laufzeitannahme Shadow vs. VPS

- `Shadow`: LLM-Ausfuehrung, strukturierte KI-Orchestrierung, spaetere Dokumentenintelligenz
- `VPS`: Webhosting, API, statische Assets, servernahe Integrationen und Deployments

Damit bleibt KI-Compute privat und kontrolliert, waehrend der VPS schlank und gut deploybar bleibt.
