# Live Audit Report (2026-04-03)

## Skill + Plugin Check

- Process: `using-superpowers`, `feature-dev`
- Audit/UX: `web-design-guidelines`
- Browser automation: `browser-use` (mandatory first choice)
- Skill verification completed:
  - `C:/Users/zirku/.codex/vendor_imports/skills/skills/.curated/playwright/SKILL.md` set to Browser-Use-first.
  - `C:/Users/zirku/.codex/vendor_imports/skills/skills/.curated/playwright-interactive/SKILL.md` set to Browser-Use-first.

## Scope tested

- Website: `https://h-town.duckdns.org/wedding/`
- Areas: Dashboard, Timeline, Vendors, Budget, Gäste, Admin, chat drawer
- Chat modes: Free + Premium, Consultant + Operator

## Key findings

### P0: White-screen on `Gäste` navigation

- Repro:
  1. Open app.
  2. Click left nav `Gäste`.
  3. Page becomes blank (empty pink background, no controls).
- Impact: hard blocker for guest flow and full wedding progression.

### P0: Premium/Operator lane fails frequently

- UI error seen repeatedly:
  - `Der KI-Consultant war gerade nicht erreichbar. Bitte versucht es in ein paar Sekunden noch einmal.`
- Impact: agent-driven progression is unreliable when OpenClaw/premium lane is unavailable.

### P1: Chat progression stalls on location step

- Even after free-text and quick-reply messages (`Okay, weiter zu den Vendoren`), active step often stays:
  - `Location und Datum festziehen` = `Jetzt dran`
  - `Kern-Vendoren absichern` = `Später`
- Impact: cannot reliably reach requested 50% milestone in agent-led flow under current runtime behavior.

### P1: User-facing wording still too technical/inconsistent (live)

- Seen in live UI:
  - `Vendoren`, `Venue-Desk`, `Plan Your Day`, `RSVP`, `Co-Pilot`, `Spaeter`, `oeffnen`
- Impact: perceived as technical/AI-generated, not like a human wedding planner product.

## 50% wedding-planning progress check

- Requested: at least 50% with agent mode.
- Current verified status on live app:
  - `Profilfundament`: erledigt
  - `Location und Datum`: aktiv
  - `Kern-Vendoren`, `Gäste`, `Standesamt`, `Finaler Block`: not advanced by chat in a stable way
- Result: target **not reached** due blockers above (P0/P1), not due missing test effort.

## Local fixes prepared in repo

- Removed Playwright dependency/scripts in project root.
- Began terminology cleanup in `apps/web/src/App.tsx`:
  - more human labels (`Dienstleister`, `Rückmeldungen`, `Abschlussübersicht`, etc.)
- Umlaute and mojibake cleanup started across web text surfaces.

## Next required fixes

1. Fix `Gäste` route/render crash (white-screen root cause).
2. Stabilize OpenClaw chat lane and fallback behavior with explicit state handling.
3. Ensure chat turn processing actually advances guided step state.
4. Finish language pass for all user-visible strings (no `oe/ae/ue` placeholders).
5. Re-run full audit and verify at least 3/6 planning blocks in chat-led progression.

