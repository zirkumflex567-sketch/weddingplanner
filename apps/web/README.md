# apps/web

Geplanter Platz fuer die Couple-Web-App bzw. spaeter eine PWA.

Hier landen spaeter:

- Onboarding
- Dashboard
- Tasks
- Budget
- Vendor-Suche

Aktueller Stand:

- Guided-Only-Web-App mit Profilbibliothek statt ueberladenem Dashboard
- gespeicherte Beratungsprofile koennen angelegt, geoeffnet und geloescht werden
- nach dem Profilstart ist immer nur ein aktiver Planungsschritt sichtbar
- nutzt die lokale API ueber `/api/prototype/workspaces...`
- speichert die aktuelle Workspace-ID lokal im Browser fuer Wiederaufnahme nach Reload
- zeigt Ausgaben/Anzahlungen direkt gegen das geplante Budget
- erlaubt Status, Quote, Paket, Verfuegbarkeit, Vertragsstand, Zahlungsstand, Anzahlung, Follow-up und Notizen pro kuratiertem Vendor-Match
- zeigt fuer kuratierte Vendor-Matches jetzt auch Stadt, Website und Quellenlink
- zeigt je Kern-Vendor-Kategorie jetzt einen Vergleichsblock fuer Budgetziel, guenstigstes Angebot, Verfuegbarkeit, Vertrag und Follow-up-Risiko
- fuehrt die Beratung jetzt direkt nach Profilstart als chatartige Hochzeitsberatung mit Antwortchips, Freitext und persistierter Wiederaufnahme pro Workspace
- blendet Guests, Budget, Vendoren, Admin und Control Room nur noch schrittbezogen ein
- aktualisiert den Couple-Workspace jetzt auch nach Fokus-/Tabwechseln wieder aus der API, damit oeffentliche RSVP-Antworten sofort sichtbar werden
- hat eine oeffentliche RSVP-Seite unter `/rsvp/:token` fuer Gaeste
- pflegt im Guest-Schritt jetzt auch Plus-One, Kinder und Songwunsch
- hat eine erste oeffentliche Wedding-Website unter `/site/:token` fuer Basisinfos, Reise, Hotel und Dresscode
