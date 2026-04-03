# Wedding Live Full Audit (Run: 2026-04-03)

## Scope
- Live URL: `https://h-town.duckdns.org/wedding/`
- API URL: `https://h-town.duckdns.org/wedding/api`
- Verified endpoints:
  - `/wedding/health` ✅
  - `/wedding/api/health` ✅
  - `/wedding/api/prototype/workspaces` ✅
  - `/wedding/api/prototype/consultant/jobs` ✅
  - `/wedding/api/prototype/ingestion/coverage` ✅

## User-realistic runs executed
1. **Returning user path**: Open latest profile → navigate dashboard modules → open concierge/chat.
2. **Chat realism path**: Free text request for nearby venues + budgeting intent in consultant panel.
3. **Mobile path**: 390x844 viewport navigation, top controls, action buttons, dock interactions.
4. **Profile creation/edit path**: Open profile form, modify real profile values, continue to dashboard state.

---

## Lighthouse (fresh run)
Source: `docs/audit/fullrun/lh-summary.json`

- Performance: **87**
- Accessibility: **100**
- Best Practices: **100**
- SEO: **91**
- FCP: **3.0s**
- LCP: **3.1–3.2s**
- CLS: **0**
- TBT: **0ms**

---

## Key findings (severity)

### P0 (must-fix)
1. **Mobile interaction blocking / pointer interception**
   - Symptom: actionable buttons intermittently unclickable on mobile due overlay/header/dock interception.
   - Evidence: click failures with intercept traces (`workspace-rail`, `mobile-dock`, `workspace-topbar` intercepting pointer events).
   - Impact: core task flow can dead-end for mobile users.

2. **Profile library pollution / duplicate profile clutter**
   - Symptom: dozens of stale profiles shown, high cognitive load, weak information scent.
   - Impact: first-time and returning users lose orientation; wrong profile risk.

### P1 (high)
3. **Consultant/operator response quality gap**
   - Symptom: user asks concrete venue/budget action, response often generic: “keine konkrete Änderung erkannt…”.
   - Impact: perceived intelligence/trust drops; conversion to action is weak.

4. **Home vs API security-header parity mismatch**
   - Symptom: API has CSP/HSTS/XFO etc.; home HTML response lacks equivalent protection headers.
   - Impact: inconsistent security posture for UI surface.

5. **Primary mobile menu affordance unclear**
   - Symptom: “Menü” tap gives weak/no obvious state transition.
   - Impact: navigation discoverability/friction.

### P2 (medium)
6. **Copy/wording quality issues**
   - Example: hero wording quality and readability inconsistencies (“ueberschallten…” typo/tone quality).
   - Impact: premium perception hit.

7. **Form automation/validation robustness (QA tooling signal)**
   - During form-fill testing a client-side validation summary pathway failed in tool-driven flow.
   - Impact: suggests brittle edge behavior in automated/rapid input scenarios.

---

## Security snapshot
Source: `docs/audit/fullrun/headers.txt`

- API health response includes:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
- Home HTML response currently missing equivalent header set.

---

## Code/ops snapshot
- `npm audit` in current workspace: no actionable vulnerabilities reported (`docs/audit/fullrun/npm-audit.json`).
- Largest files tracked for complexity awareness: `docs/audit/fullrun/top-files.txt`.

---

## Prioritized remediation plan

### P0
- Fix mobile pointer-event layering and z-index interaction contracts for `workspace-topbar`, `workspace-rail`, `mobile-dock`.
- Introduce profile list hygiene: dedupe, archive/auto-clean, search/filter, cap visible list.

### P1
- Strengthen consultant/operator intent parser and action execution mapping for venue/budget intents.
- Apply security-header parity to `/wedding/` route at nginx layer (CSP/HSTS/XFO/referrer-policy).
- Improve menu state feedback and transition clarity on mobile.

### P2
- Wording pass for premium/clear German UX copy.
- Harden form interaction edge cases and validation messaging consistency.

---

## Evidence artifacts
- `docs/audit/fullrun/lh-summary.json`
- `docs/audit/fullrun/lh-desktop.json`
- `docs/audit/fullrun/lh-mobile.json`
- `docs/audit/fullrun/headers.txt`
- `docs/audit/fullrun/live-endpoint-status.json`
- `docs/audit/fullrun/top-files.txt`
- Browser captures taken during run (desktop + mobile concierge/chat interactions).
