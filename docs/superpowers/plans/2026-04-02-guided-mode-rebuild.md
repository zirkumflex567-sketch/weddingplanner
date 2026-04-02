# Guided Wedding Consultant Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the prototype into a guided-only wedding consultant flow with profile management and a minimal, step-by-step interface.

**Architecture:** Keep the existing prototype workspace domain model and consultation logic, but add explicit profile-library endpoints for list/delete and replace the overloaded dashboard with a focused shell. The web app should expose only one current planning block at a time, with chat guidance, profile actions, and compact progress context.

**Tech Stack:** React 19, TypeScript, Fastify, Vitest, Playwright smoke/audit scripts

---

### File Responsibilities

- `C:\Users\Shadow\Documents\wedding\services\api\src\app.ts`
  Add profile-library routes for listing and deleting prototype workspaces.
- `C:\Users\Shadow\Documents\wedding\services\api\src\prototype-store.ts`
  Extend the workspace store interface and implementations with list/delete behavior and lightweight summaries.
- `C:\Users\Shadow\Documents\wedding\services\api\src\app.test.ts`
  Lock profile-library API behavior before backend implementation.
- `C:\Users\Shadow\Documents\wedding\apps\web\src\App.tsx`
  Replace the overloaded dashboard layout with a guided-only shell: profile library, active consultant flow, one visible planning step at a time.
- `C:\Users\Shadow\Documents\wedding\apps\web\src\app.css`
  Redesign the visual system around a calmer, editorial guided experience instead of dense dashboard grids.
- `C:\Users\Shadow\Documents\wedding\apps\web\src\lib\api.ts`
  Add list/delete profile calls used by the guided shell.
- `C:\Users\Shadow\Documents\wedding\scripts\app-audit.cjs`
  Rework the browser audit around the new guided-only journey including create/select/delete profile behavior.

### Task 1: Profile Library Backend

**Files:**
- Modify: `C:\Users\Shadow\Documents\wedding\services\api\src\app.test.ts`
- Modify: `C:\Users\Shadow\Documents\wedding\services\api\src\prototype-store.ts`
- Modify: `C:\Users\Shadow\Documents\wedding\services\api\src\app.ts`

- [ ] Write failing API tests for listing and deleting stored profiles.
- [ ] Run the targeted API test and verify it fails for missing routes/store methods.
- [ ] Implement list/delete support in the store plus Fastify routes.
- [ ] Run API tests again until green.

### Task 2: Guided-Only Frontend Shell

**Files:**
- Modify: `C:\Users\Shadow\Documents\wedding\apps\web\src\App.tsx`
- Modify: `C:\Users\Shadow\Documents\wedding\apps\web\src\lib\api.ts`
- Modify: `C:\Users\Shadow\Documents\wedding\apps\web\src\app.css`

- [ ] Define failing browser expectations in the audit for profile creation, profile deletion, step-by-step consultation, and reduced visible surface.
- [ ] Rebuild the page shell around profile library + current guided step only.
- [ ] Keep access to guests, budget, vendors, and admin, but reveal them only inside the currently selected guidance block.
- [ ] Preserve consultation persistence per workspace.

### Task 3: Verification And Docs

**Files:**
- Modify: `C:\Users\Shadow\Documents\wedding\scripts\app-audit.cjs`
- Modify: `C:\Users\Shadow\Documents\wedding\README.md`
- Modify: `C:\Users\Shadow\Documents\wedding\apps\web\README.md`

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run audit:app`.
- [ ] Update the README files to describe the guided-only product shape.
