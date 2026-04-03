# Chat & Agent Live Status (htown)

Stand: 2026-04-03

## Live behoben

- Consultant-Endpunkte sind aktiv und antworten wieder:
  - `GET /prototype/consultant/sessions/:workspaceId`
  - `POST /prototype/consultant/reply`
  - `POST /prototype/consultant/transcribe`
  - `POST /prototype/consultant/speak`
- Premium-Antwortpfad liefert `provider=openclaw` und `model=openclaw-consultant-runtime`.
- Operator-Modus kann Workspace-Daten wirklich ändern (nicht nur chatten):
  - Kategorien deaktivieren/aktivieren (`catering`, `music`, `photography`, `florals`, `attire`)
  - Persistenz in `onboarding.disabledVendorCategories` verifiziert.
- Bugfix: `deaktiviere X` hat nicht mehr versehentlich direkt `aktiviere X` ausgelöst.

## Verifiziert (E2E)

- API-Flow:
  1. Workspace anlegen
  2. Consultant-Session öffnen
  3. Premium/Operator Nachricht senden
  4. Antwort + Session + persistierte Workspace-Änderung prüfen
- Browser-Flow:
  - Live auf `https://h-town.duckdns.org/wedding/`
  - Premium + Operator aktiv
  - Nachricht gesendet: `deaktiviere musik bitte`
  - Antwort enthält `Operator-Update: Musik deaktiviert.`

## Aktuelle Qualität

- Keine harten Chat-Ausfälle mehr im getesteten Flow.
- Antworten sind spürbar konsistenter im Operator-Modus.
- Umlaute im Chat wurden gezielt verbessert (ohne aggressive Global-Ersetzung, die Wörter beschädigt).

## Nächste Iteration

- Weitere natürliche Sprachmuster für Operator-Intents ergänzen (z. B. „rausnehmen“, „erstmal ohne ...“).
- Persona-Ton weiter schärfen: weniger technisch, mehr empathischer Hochzeitsplaner.
- Restliche `ae/oe/ue`-Texte in statischen UI-Strings systematisch in den Source-Daten bereinigen.

## Update 2026-04-03 (menschlicher Operator-Flow)

- Operator versteht jetzt natürlichere Eingaben wie:
  - „Wir haben schon einen DJ gefunden, füge DJ XY manuell hinzu …“
- Manuelle Anbieter werden kundenspezifisch gespeichert (als `planned`-Eintrag in den Workspace-Ausgaben mit `amount=0`), inklusive optionaler Kontaktdaten.
- Bei unvollständigen Angaben reagiert der Bot mit klarer Rückfrage (fehlender Name/Kategorie), statt still zu scheitern.
- Operator-Antworten priorisieren jetzt die konkrete Bestätigung der Aktion statt generischer Berater-Floskeln.
- Beratungs-Ton wurde weichgezeichnet (u. a. weniger „Hebel“-Sprache).
