# OpenClaw Consultant Recovery Plan (2026-04-03)

This document turns the last 30-minute alignment into an execution-grade task plan.
Goal: make the consultant feel like a real senior wedding planner, with OpenClaw as primary runtime.

## Scope

- Product surface: `apps/web` consultant UI and wording
- Conversation logic: `packages/shared` consultant flow and intent routing
- Runtime: `services/api` + deployed htown routing/port setup
- Persistence: workspace/session context handling for per-couple continuity
- QA: free and premium flows, every major link/action path, conversational realism

## Step 1: Stabilize Runtime and Deploy Path

### 1.1 Align runtime ports and reverse proxy
- Verify API listens on the expected port used by nginx (`/wedding/api` upstream).
- Ensure server startup uses production-safe host/port env behavior.
- Confirm static web build is served from the active nginx root.

### 1.2 Remove drift between source and live behavior
- Validate that deployed build files match current source.
- Document exact deploy command sequence (build, sync, restart, health check).

### Acceptance
- `GET /wedding/health` returns success.
- `GET /wedding/api/health` returns success.
- No stale build artifacts causing UI mismatch.

## Step 2: Enforce OpenClaw as Primary Brain

### 2.1 Runtime policy
- Make OpenClaw the first-choice provider for consultant/premium paths.
- Keep fallbacks only as explicit resilience lanes.

### 2.2 Observability
- Surface active lane status in UI and logs (`openclaw`, provider fallback, local rules).
- Emit provider/lane per response for auditability.

### Acceptance
- When OpenClaw is available, chat answers are OpenClaw-backed.
- Fallback usage is explicit, measurable, and not silent.

## Step 3: Define a Real Pro Planner Identity

### 3.1 Consultant persona contract
- Build a stable identity spec: tone, method, boundaries, escalation style.
- Keep language human, direct, and practical (no generic AI filler).

### 3.2 Consultation method
- Every answer should include:
  - brief understanding
  - recommendation with rationale
  - concrete next step
- Preserve emotional intelligence for wedding planning stress moments.

### Acceptance
- Sample transcripts read like a real expert consultant.
- No robotic/meta-AI phrasing in core conversation prompts.

## Step 4: Make Per-Couple Context Reliable

### 4.1 Context model
- Persist and restore per-workspace consultant context, priorities, and recent facts.
- Ensure conversation continuity across reloads and restarts.

### 4.2 Data hygiene
- Separate transient processing state from durable planning state.
- Prevent cross-couple context leakage.

### Acceptance
- Returning to a workspace resumes coherent context.
- Context reflects latest planning changes and does not drift.

## Step 5: Clean Language and UX for Real Users

### 5.1 Wording refactor
- Remove denglish/technical labels in user-facing text (`RSVP-Flow`, etc.).
- Replace transliterations (`ae/oe/ue`) with natural German where appropriate.

### 5.2 UI cleanup
- Remove duplicate UI elements.
- Fix or remove non-functional controls/links.
- Keep labels understandable for non-technical couples.

### Acceptance
- Language is clear and wedding-user friendly.
- No duplicate actions or dead UI controls in primary journeys.

## Step 6: Full Validation Across Free + Premium

### 6.1 Functional walkthrough
- Test each major page, action, and internal link.
- Validate chat behavior in consultant and operator modes.

### 6.2 Conversation stress test
- Challenge with free text, topic switching, greetings, and ambiguity.
- Ensure natural redirection (for example, jumping back to location planning).

### Acceptance
- Critical flows pass on both free and premium.
- Chat feels consistent, grounded, and professional.

## Step 7: Structured Handover and Release Notes

### 7.1 Delivery artifacts
- Change summary grouped by runtime, chat logic, UI copy, and QA results.
- Known limitations and next fixes listed explicitly.

### 7.2 Operational checklist
- Include exact verify commands and expected results.
- Include rollback notes for runtime and web artifacts.

### Acceptance
- Team can reproduce deploy, verification, and rollback without guesswork.

## Definition of Done

- All 7 steps completed with evidence.
- OpenClaw-first behavior verified in live environment.
- Consultant voice is professional, empathetic, and actionable.
- User-facing language is non-technical and polished.
- Free/premium regression checks documented and passed.
