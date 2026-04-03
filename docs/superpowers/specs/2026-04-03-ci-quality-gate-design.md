# GitHub Actions CI Quality Gate Design

## Goal

Run the repo quality gate automatically on every pull request update and every push to `main`, using only GitHub-side automation stored in the repository.

## Scope

Included:

- GitHub Actions workflow files in `.github/workflows/`
- Event triggers for pull requests and pushes to `main`
- Shared workflow structure for the existing `npm run qa` gate
- Action-level caching and concurrency controls

Excluded:

- Branch protection rules
- Required status check configuration in repository settings
- Merge queue
- Required reviews
- Deployment or release workflows

## Current Context

The repository already has a local quality gate:

- `npm run lint`
- `npm run typecheck`
- `npm run coverage`
- `npm run qa` chaining the full gate

There is no `.github/workflows/` directory yet. The remote is GitHub, so GitHub Actions is the correct CI target.

## Design Summary

Use two workflow files:

1. `.github/workflows/quality-gate.yml`
   A reusable workflow triggered by `workflow_call`. It contains the actual CI job definition and runs `npm run qa`.

2. `.github/workflows/ci.yml`
   The event-facing workflow. It triggers on pull requests and pushes to `main`, then calls the reusable quality-gate workflow.

This keeps the QA definition in one place and avoids duplicating the same job in separate PR and main workflows.

## Why This Approach

### Option A: Reusable workflow plus thin entry workflow

Recommendation.

Pros:

- Single source of truth for the quality-gate job
- No drift between PR validation and `main` validation
- Easier to extend later with additional callers
- Cleaner separation between triggers and execution logic

Cons:

- Slightly more indirection than a one-file workflow

### Option B: Single inline workflow

Pros:

- Simplest initial file count
- Easy for small repos to read at a glance

Cons:

- Harder to reuse once more workflows appear
- Trigger logic and job logic become entangled

### Option C: Separate duplicated PR and main workflows

Pros:

- Explicit event-specific files

Cons:

- Duplication
- High risk of drift
- No benefit for the current repo size

## Workflow Behavior

### Trigger Conditions

`ci.yml` should trigger on:

- `pull_request`
  - `opened`
  - `synchronize`
  - `reopened`
  - `ready_for_review`
- `push`
  - branches:
    - `main`

This gives feedback on every new PR revision and re-validates the exact commit that lands on `main`.

### Draft Pull Requests

Do not special-case draft PRs for now. The quality gate should run for drafts as well so failures surface immediately and the status behavior stays consistent.

If CI cost becomes a concern later, draft-specific optimizations can be added in a separate change.

### Concurrency

Use workflow-level concurrency to cancel superseded runs for the same ref:

- Group by workflow name plus ref
- `cancel-in-progress: true`

This is especially important on pull requests, where force-pushes and follow-up commits would otherwise waste runner time.

### Runner And Environment

Use:

- `runs-on: ubuntu-latest`
- `actions/checkout@v4`
- `actions/setup-node@v4`

Node setup should:

- Use the project’s intended Node version
- Enable npm dependency caching

The repo should define a single Node version for CI, ideally via `.nvmrc` or the workflow file itself. The implementation plan should inspect the repo and choose the least surprising source of truth.

### Install Strategy

Use `npm ci`, not `npm install`.

Reason:

- Reproducible installs from `package-lock.json`
- Faster and better suited for CI
- Detects lockfile drift immediately

### Quality Gate Command

Run exactly:

```bash
npm run qa
```

Do not split lint/typecheck/coverage into separate jobs yet. The repo already defines `qa` as the authoritative gate, and CI should mirror that contract instead of re-expressing it.

If the repo later needs faster partial feedback or matrix fan-out, the reusable workflow can evolve without changing the trigger layer.

## Failure And Signal Model

The workflow should fail if any part of `npm run qa` fails.

Expected status signals:

- PRs: one CI workflow run attached to the PR head commit
- `main`: one CI workflow run attached to the pushed merge commit or direct push commit

No artifact upload is required initially. The console output from `npm run qa` is sufficient for lint, typecheck, and coverage failures.

## File Structure

Planned files:

- Create: `.github/workflows/ci.yml`
  Entry workflow for pull requests and pushes to `main`

- Create: `.github/workflows/quality-gate.yml`
  Reusable workflow containing the shared Node setup and `npm run qa` job

Potential supporting file:

- Optional modify/create: `.nvmrc`
  Only if the repo does not already expose a clear Node version source and CI needs one

## Testing Strategy

The CI workflow design should be verified locally before relying on GitHub execution:

- YAML files pass basic syntax review
- Action versions are current and valid
- Commands used in CI already pass locally via `npm run qa`

After merge, operational verification is:

- Open or update a PR and confirm the workflow runs
- Merge to `main` and confirm the workflow reruns on the pushed `main` commit

## Risks

### Node Version Drift

If local development and CI use different Node versions, CI may fail unexpectedly. The implementation should pin a single version source and document it.

### Slow Feedback

Because `npm run qa` is a single chained command, failures stop at the first broken stage. This matches the local developer workflow, but it means later stages may not run until earlier failures are fixed.

This is acceptable for now because correctness and parity matter more than maximum parallelism.

### Future Workflow Growth

If deployment, preview, or nightly jobs are added later, the event-facing workflow must remain thin so it does not become the new duplication point. The reusable workflow approach keeps that expansion manageable.

## Acceptance Criteria

The design is complete when the repo can support:

- A PR workflow run on every new PR and every subsequent commit pushed to that PR
- A workflow run on every push to `main`
- The exact same quality-gate command in both cases: `npm run qa`
- A shared implementation of the QA job with no duplicated CI command definitions
- Cancellation of superseded in-progress runs for the same ref

