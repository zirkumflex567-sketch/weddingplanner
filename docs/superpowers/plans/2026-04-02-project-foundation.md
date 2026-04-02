# Wedding Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current research dump into an executable product foundation with agreed scope, architecture decisions, and a bootstrap-ready repository shape.

**Architecture:** Start docs-first and domain-first. Lock the product thesis, MVP boundaries, and core data model before committing to framework-specific implementation work. Keep planning, vendor data ingestion, and AI orchestration as separate concerns from day one.

**Tech Stack:** Documentation-first planning, web-first product, relational core data model, self-hosted AI candidate via Ollama, vendor-data pipeline as a separate service.

---

### Task 1: Freeze the MVP thesis

**Files:**
- Modify: `docs/product/product-foundation.md`
- Create: `docs/product/mvp-scope.md`
- Modify: `docs/questions/open-questions.md`

- [ ] **Step 1: Review the current foundation docs**

Read:

- `docs/research/source-synthesis-2026-04-02.md`
- `docs/product/product-foundation.md`
- `docs/questions/open-questions.md`

Expected: clear agreement on target users, product promise, and major unknowns.

- [ ] **Step 2: Write the MVP scope document**

Create `docs/product/mvp-scope.md` with:

- core user journey
- in-scope features
- explicitly out-of-scope features
- success criteria for a first private alpha

- [ ] **Step 3: Validate scope coherence**

Run: `Get-Content -Raw 'C:\Users\Shadow\Documents\wedding\docs\product\mvp-scope.md'`

Expected: scope is small enough for a first vertical slice and does not include vendor portal or broad marketplace work.

- [ ] **Step 4: Commit**

```bash
git add docs/product/product-foundation.md docs/product/mvp-scope.md docs/questions/open-questions.md
git commit -m "docs: define wedding mvp scope"
```

### Task 2: Define the domain model and vendor data strategy

**Files:**
- Create: `docs/architecture/domain-model.md`
- Create: `docs/research/vendor-data-strategy.md`
- Modify: `docs/architecture/system-overview.md`

- [ ] **Step 1: Write the domain model draft**

Define minimum entities for:

- couple
- wedding
- task
- budget item
- vendor
- vendor match
- quote
- document

- [ ] **Step 2: Write the vendor data strategy draft**

Document:

- acceptable data sources
- minimum vendor fields
- ingestion stages
- legal and quality guardrails

- [ ] **Step 3: Review architecture alignment**

Run: `Get-Content -Raw 'C:\Users\Shadow\Documents\wedding\docs\architecture\domain-model.md'`

Expected: entities support planning core first and do not force marketplace complexity too early.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/domain-model.md docs/research/vendor-data-strategy.md docs/architecture/system-overview.md
git commit -m "docs: add domain model and vendor data strategy"
```

### Task 3: Bootstrap the implementation repository

**Files:**
- Modify: `README.md`
- Create: `apps/web/package.json`
- Create: `services/api/README.md`
- Create: `packages/shared/README.md`
- Create: `.editorconfig`

- [ ] **Step 1: Choose the concrete stack**

Decide:

- frontend framework
- backend framework
- package manager
- database and auth baseline

- [ ] **Step 2: Create the first bootstrap files**

Generate the minimal repo entry points only after the stack is chosen.

- [ ] **Step 3: Verify the bootstrap shape**

Run: `Get-ChildItem -Recurse 'C:\Users\Shadow\Documents\wedding'`

Expected: docs, app, service, package, data, and infra areas exist and match the chosen stack.

- [ ] **Step 4: Commit**

```bash
git add README.md apps services packages .editorconfig
git commit -m "chore: bootstrap wedding workspace"
```

### Task 4: Build the first vertical slice

**Files:**
- Create: `apps/web/src/...`
- Create: `services/api/src/...`
- Create: `packages/shared/src/...`
- Create: `tests/...`

- [ ] **Step 1: Write the first failing product tests**

Cover:

- create wedding profile
- generate first planning milestones
- return budget starter categories

- [ ] **Step 2: Implement minimal passing behavior**

Keep it intentionally narrow and deterministic.

- [ ] **Step 3: Run the validation suite**

Run: project-specific tests once the stack is chosen.

Expected: one end-to-end happy path from onboarding input to first plan output.

- [ ] **Step 4: Commit**

```bash
git add apps services packages tests
git commit -m "feat: add initial wedding planning vertical slice"
```
