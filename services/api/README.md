# services/api

Geplanter Backend-Einstiegspunkt fuer:

- Auth
- Domain-Logik
- Wedding- und Couple-Modelle
- Task- und Budgetlogik
- Vendor-Abfragen

Aktueller Stand:

- `GET /health`
- `POST /planning/bootstrap`
- `POST /prototype/vendor-refresh-jobs`
- `GET /prototype/vendor-refresh-jobs`
- `GET /prototype/vendor-refresh-jobs/:id`
- `POST /prototype/vendor-refresh-jobs/:id/preview`
- `POST /prototype/vendor-refresh-jobs/:id/runs`
- `GET /prototype/vendor-refresh-jobs/:id/runs`
- `GET /prototype/vendor-refresh-jobs/:id/runs/:runId`
- `npm run dev --workspace @wedding/api` startet die lokale API auf `127.0.0.1:3001`
- `POST /prototype/workspaces`
- `GET /prototype/workspaces/:id`
- `PATCH /prototype/workspaces/:id/onboarding`
- `POST /prototype/workspaces/:id/guests`
- `PATCH /prototype/workspaces/:id/guests/:guestId`
- `GET /public/rsvp/:token`
- `PATCH /public/rsvp/:token`
- `POST /prototype/workspaces/:id/expenses`
- `PATCH /prototype/workspaces/:id/vendors/:vendorId`
- `PATCH /prototype/workspaces/:id/tasks/:taskId`

Die Bootstrap-Route liefert aktuell einen ersten deterministischen Plan aus Onboarding-Daten:

- normalisiertes Profil
- erste Meilensteine
- Budget-Startkategorien
- DACH-Admin-Reminder
- Event-Blueprints
- kuratierte Vendor-Matches
- vendor search strategy fuer kuratierte Sofortabdeckung plus deutschlandweiten Paid Refresh
- Runtime-Topologie fuer Shadow/VPS

Der Prototype-Store laeuft lokal dateibasiert fuer die App-Nutzung und ist bewusst nur Prototypenpersistenz, keine finale Produktionsdatenhaltung.
Bestehende persistierte Workspaces werden beim Laden auf neue Felder wie Vendor-Tracking normalisiert, damit Prototyp-Daten nicht bei jedem Ausbau verloren gehen.
Gaeste bekommen ausserdem einen stabilen Access-Token fuer oeffentliche RSVP-Links mit Antwort, Essenswahl und Nachricht.
Vendor-Matches werden jetzt datengetrieben aus `packages/shared/src/vendor-seeds.ts` erzeugt, waehrend die neue Refresh-Route source-safe Connector-Plaene fuer deutschlandweite Kundenanfragen erzeugt.

## Vendor-Refresh-Runs

Die Run-Endpoints fuehren die aktuell geplanten Connectoren fuer eine bezahlte Anfrage wirklich aus und speichern das Ergebnis pro Job:

- Discovery ueber Brave Search, wenn `BRAVE_SEARCH_API_KEY` gesetzt ist
- strukturierte Business-Facts ueber Google Places, wenn `GOOGLE_MAPS_API_KEY` gesetzt ist
- first-party Website-Fetching und leichtes Crawling ueber dieselben Vendor-URLs

Die API speichert pro Run:

- Connector-Status pro Quelle
- normalisierte Preview-Daten
- Qualitaetsstatus mit Issues
- Persistenz fuer spaetere Review- und Publish-Schritte
