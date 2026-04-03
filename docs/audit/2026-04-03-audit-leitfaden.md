# Audit Leitfaden (Browser-Use-first)

## Ziel

- Vollständiger Website-Audit mit Fokus auf:
  - SEO
  - Security
  - Inhalt/Sprache
  - Funktionen/Flows
  - Code-/Runtime-Symptome
  - Performance-/Stabilitätsindikatoren

## Skill-Stack

- `using-superpowers`
- `feature-dev`
- `web-design-guidelines`
- `browser-use`

Regel: Browser Use zuerst. Playwright nur als expliziter Fallback.

## Testablauf

1. Startseite laden, Navigation und primäre CTA prüfen.
2. Chat-Drawer öffnen, Free/Consultant testen.
3. Premium/Operator testen (OpenClaw-Lane + Fallback-Verhalten).
4. Alle Seiten anklicken: Dashboard, Timeline, Vendors, Budget, Gäste, Admin.
5. Step-Chips und Chat-Quick-Replies auf Fortschritt prüfen.
6. Mindestens einen „komplette Hochzeit planen“-Durchlauf versuchen.
7. Findings nach Priorität klassifizieren (P0/P1/P2).

## Erfolgskriterien

- Keine harten UI-Abstürze.
- Chat antwortet stabil und führt im Ablauf weiter.
- Mindestens 50% der Schritte nachvollziehbar erreicht.
- Sprache ist konsistent, menschlich und nicht technisch.

