# OpenClaw Consultant Taskboard (Execution)

Status: active execution board for the 7-step recovery scope.

## How To Use

- Keep this board updated during implementation.
- A step is only done when all acceptance checks pass.
- If a blocker appears, capture it under "Open Issues" immediately.

## Step 1: Runtime Stabilization

### Subtasks
- [ ] Verify nginx path mapping for `/wedding/`, `/wedding/assets/`, `/wedding/api/`.
- [ ] Align API listen port with nginx upstream.
- [ ] Build web app and sync build artifacts to active web root.
- [ ] Add a repeatable restart sequence for API + web deployment.

### Acceptance Checks
- [ ] `GET /wedding/health` returns success.
- [ ] `GET /wedding/api/health` returns success.
- [ ] No stale web bundle mismatch between source and live output.

## Step 2: OpenClaw-First Routing

### Subtasks
- [ ] Enforce OpenClaw as primary provider for premium consultant paths.
- [ ] Keep provider and local fallback lanes only as explicit fallback behavior.
- [ ] Expose selected lane in logs and UI labels.

### Acceptance Checks
- [ ] OpenClaw lane used when runtime is available.
- [ ] Fallback only used on explicit failure conditions.
- [ ] Provider decision trace is visible per response.

## Step 3: Senior Planner Identity

### Subtasks
- [ ] Define consultant persona contract (tone, method, boundaries).
- [ ] Apply style rules to opening prompts and ongoing responses.
- [ ] Remove generic AI phrasing from user-visible assistant copy.

### Acceptance Checks
- [ ] Transcript samples read as experienced wedding planner guidance.
- [ ] Responses consistently provide recommendation + rationale + next step.

## Step 4: Per-Couple Context Integrity

### Subtasks
- [ ] Persist and restore per-workspace consultant history and context.
- [ ] Ensure no context leakage across workspaces.
- [ ] Validate continuity after reload/restart.

### Acceptance Checks
- [ ] Conversation resumes correctly for the same workspace.
- [ ] Recent priorities/facts remain coherent after refresh.

## Step 5: Language and UX Cleanup

### Subtasks
- [ ] Replace technical/denglish labels with plain German user wording.
- [ ] Replace `ae/oe/ue` transliterations in key user-facing flows.
- [ ] Remove duplicate UI controls.
- [ ] Fix or remove non-functional links/actions.

### Acceptance Checks
- [ ] No obvious technical jargon in critical planning paths.
- [ ] No duplicate primary actions in the same view.
- [ ] No dead CTA in main journeys.

## Step 6: Full Free/Premium QA

### Subtasks
- [ ] Run full walkthrough of all major pages and links.
- [ ] Stress-test chat with topic shifts, greeting prompts, and ambiguous input.
- [ ] Validate free consultant mode and premium/operator mode separately.

### Acceptance Checks
- [ ] No blocking defects in core flows.
- [ ] Chat keeps context and redirects naturally when user changes focus.

## Step 7: Delivery and Handover

### Subtasks
- [ ] Document change log grouped by runtime, chat logic, and UX language.
- [ ] Document remaining risks and next patch priorities.
- [ ] Provide rollback and verification commands.

### Acceptance Checks
- [ ] Team can reproduce deploy + verify + rollback from docs alone.

## Open Issues

- (none yet)

