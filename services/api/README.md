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
- Runtime-Topologie fuer Shadow/VPS

Der Prototype-Store laeuft lokal dateibasiert fuer die App-Nutzung und ist bewusst nur Prototypenpersistenz, keine finale Produktionsdatenhaltung.
Bestehende persistierte Workspaces werden beim Laden auf neue Felder wie Vendor-Tracking normalisiert, damit Prototyp-Daten nicht bei jedem Ausbau verloren gehen.
Gaeste bekommen ausserdem einen stabilen Access-Token fuer oeffentliche RSVP-Links mit Antwort, Essenswahl und Nachricht.
Vendor-Matches werden jetzt datengetrieben aus `packages/shared/src/vendor-seeds.ts` erzeugt, inklusive Alias-Matching fuer `67454` bzw. `Hassloch` und Quellenmetadaten fuer die Seed-Eintraege.
