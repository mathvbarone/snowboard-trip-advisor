# GitHub Actions CI Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions CI that runs the full repository quality gate on every pull request update and every push to `main`.

**Architecture:** A thin event-facing workflow at `.github/workflows/ci.yml` triggers on pull requests and pushes to `main`, then delegates to a reusable workflow at `.github/workflows/quality-gate.yml`. The reusable workflow owns Node setup, dependency install, and the single authoritative `npm run qa` gate so PR and `main` executions cannot drift.

**Tech Stack:** GitHub Actions, reusable workflows (`workflow_call`), Node.js 22, npm, existing `npm run qa`

---

## Planned File Structure

- `.github/workflows/ci.yml` — Create: event-facing workflow for PRs and pushes to `main`
- `.github/workflows/quality-gate.yml` — Create: reusable workflow that installs dependencies and runs `npm run qa`
- `.nvmrc` — Create: single source of truth for the CI Node version (`22`)

---

### Task 1: Pin The CI Node Version

**Files:**
- Create: `.nvmrc`

- [ ] **Step 1: Write the version file**

Create `.nvmrc` with exactly:

```txt
22
```

- [ ] **Step 2: Verify the file content**

Run:

```bash
cd /home/math/Projects/snowboard-trip-advisor
cat .nvmrc
```

Expected:

```txt
22
```

- [ ] **Step 3: Commit**

```bash
git add .nvmrc
git commit -m "chore: pin node version for ci"
```

---

### Task 2: Create The Reusable Quality Gate Workflow

**Files:**
- Create: `.github/workflows/quality-gate.yml`

- [ ] **Step 1: Create the workflows directory**

Run:

```bash
cd /home/math/Projects/snowboard-trip-advisor
mkdir -p .github/workflows
```

Expected: `.github/workflows/` exists.

- [ ] **Step 2: Write the reusable workflow**

Create `.github/workflows/quality-gate.yml` with exactly:

```yaml
name: Quality Gate

on:
  workflow_call:

jobs:
  qa:
    name: qa
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run quality gate
        run: npm run qa
```

- [ ] **Step 3: Verify the workflow file was written correctly**

Run:

```bash
sed -n '1,220p' /home/math/Projects/snowboard-trip-advisor/.github/workflows/quality-gate.yml
```

Expected:

- `name: Quality Gate`
- `on: workflow_call`
- `actions/checkout@v4`
- `actions/setup-node@v4`
- `node-version-file: .nvmrc`
- `cache: npm`
- `npm ci`
- `npm run qa`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/quality-gate.yml
git commit -m "ci: add reusable quality gate workflow"
```

---

### Task 3: Create The Event-Facing CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the trigger workflow**

Create `.github/workflows/ci.yml` with exactly:

```yaml
name: CI

on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened
      - ready_for_review
  push:
    branches:
      - main

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality-gate:
    uses: ./.github/workflows/quality-gate.yml
```

- [ ] **Step 2: Verify the trigger coverage**

Run:

```bash
sed -n '1,220p' /home/math/Projects/snowboard-trip-advisor/.github/workflows/ci.yml
```

Expected:

- `pull_request` includes `opened`, `synchronize`, `reopened`, `ready_for_review`
- `push.branches` includes only `main`
- `concurrency.cancel-in-progress: true`
- the only job uses `./.github/workflows/quality-gate.yml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run quality gate on pull requests and main"
```

---

### Task 4: Validate The Workflow Files And Local Gate

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `.github/workflows/quality-gate.yml`
- Verify: `.nvmrc`

- [ ] **Step 1: Run the local quality gate**

Run:

```bash
cd /home/math/Projects/snowboard-trip-advisor
npm run qa
```

Expected:

- `eslint .` exits `0`
- `tsc --noEmit` exits `0`
- `vitest run --coverage` exits `0`
- coverage remains 100% for lines, branches, functions, and statements

- [ ] **Step 2: Validate the reusable workflow syntax**

Run:

```bash
python - <<'PY'
from pathlib import Path
import yaml

for path in [
    Path('/home/math/Projects/snowboard-trip-advisor/.github/workflows/quality-gate.yml'),
    Path('/home/math/Projects/snowboard-trip-advisor/.github/workflows/ci.yml'),
]:
    with path.open('r', encoding='utf-8') as handle:
        yaml.safe_load(handle)
    print(f'OK {path.name}')
PY
```

Expected:

```txt
OK quality-gate.yml
OK ci.yml
```

- [ ] **Step 3: Verify the trigger workflow references the reusable workflow path correctly**

Run:

```bash
rg -n "uses: \./\.github/workflows/quality-gate\.yml|node-version-file: \.nvmrc|run: npm run qa" /home/math/Projects/snowboard-trip-advisor/.github/workflows
```

Expected:

- one hit for `uses: ./.github/workflows/quality-gate.yml`
- one hit for `node-version-file: .nvmrc`
- one hit for `run: npm run qa`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/quality-gate.yml .nvmrc
git commit -m "ci: wire github actions quality gate"
```

---

### Task 5: Push And Verify In GitHub

**Files:** none

- [ ] **Step 1: Push the branch**

Run:

```bash
cd /home/math/Projects/snowboard-trip-advisor
git push origin main
```

Expected: push succeeds and GitHub receives the workflow files.

- [ ] **Step 2: Verify the `push` workflow appears on the `main` commit**

Open the repository Actions tab or the commit checks UI for the pushed `main` commit.

Expected:

- one workflow named `CI`
- one job named `qa`
- the workflow succeeds

- [ ] **Step 3: Verify pull request behavior**

Create or update a pull request with another commit after the workflow files are on GitHub.

Expected:

- `CI` runs on PR open/update
- additional pushes to the same PR cancel superseded in-progress runs
- the reusable workflow executes the same `npm run qa` gate as `main`

---

## Self-Review

### Spec Coverage

- reusable workflow for the quality gate: Task 2
- event-facing workflow for PRs and pushes to `main`: Task 3
- single shared QA definition with no duplicated command logic: Tasks 2-3
- concurrency cancellation for superseded runs: Task 3
- explicit Node version source for CI: Task 1
- local and workflow-file verification: Task 4
- GitHub-side operational verification on `main` and PRs: Task 5

### Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation notes
- All files, commands, triggers, and workflow contents are explicit
- Verification steps include exact commands and expected results

### Type Consistency

- `.github/workflows/ci.yml` references `.github/workflows/quality-gate.yml` exactly once and uses the same path throughout
- `.github/workflows/quality-gate.yml` uses `.nvmrc` as the Node version source, matching Task 1
- the CI job always runs the same command, `npm run qa`, in both PR and `main` contexts

