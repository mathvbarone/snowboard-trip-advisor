---
name: harness
description: |
  Knowledge transfer about this repo's rule-enforcement harness — how it's
  designed, why each layer exists, and the lessons learned building it.
  Invoke when (a) adding a new project rule and choosing where to enforce it,
  (b) writing or extending a `.claude/settings.json` hook script, (c)
  debugging why a hook fired or didn't fire, (d) auditing enforcement
  coverage, or (e) being asked to refactor agent instructions in a way that
  would weaken compliance (e.g. "split CLAUDE.md into multiple files").
---

# Harness — rule-enforcement knowledge for this project

This project enforces its rules with **mechanical gates**, not convention.
The reason: agents (and humans) skip documented rules at scale. A rule that
isn't enforced is a rule that decays the moment attention moves elsewhere.

This skill captures the design, the lessons learned, and the recipes for
extending it.

## Mental model

Enforcement is a stack of layers, ordered by strength. **A new rule belongs
at the strongest layer that can express it.** Documenting a rule in
`CLAUDE.md` is the weakest possible mechanism — relying on agent compliance.

| Strength | Layer | What it gates | Configured in |
|---|---|---|---|
| Strongest | CI required status checks | merge to a protected branch | `.github/workflows/ci.yml`, `quality-gate.yml` + `scripts/apply-branch-protection.sh` |
| Strong | Pre-commit hook | local commit | `scripts/pre-commit` (installed by `npm run setup`) |
| Strong | Branch protection | force-push, required checks, CODEOWNERS reviews | `scripts/apply-branch-protection.sh` (one-time apply by maintainer) |
| Strong | CODEOWNERS | merge of changes to load-bearing paths | `.github/CODEOWNERS` |
| Medium | Claude Code agent hooks | dangerous tool invocations at the source | `.claude/settings.json` + `scripts/hooks/*.sh` |
| Medium | SessionStart context injection | what the agent knows the rules ARE at session start | `scripts/hooks/session-start-context.sh` |
| Weak | PR template checklist | visible reminder during review | `.github/pull_request_template.md` |
| Weakest | `CLAUDE.md` instructions | agent compliance with documented rules | `CLAUDE.md` |

## Decision tree: where does a new rule belong?

```
Can the rule be expressed as a passing/failing test or check?
├── Yes → write a CI job (strongest). Add the context to apply-branch-protection.sh.
└── No, it's about source-code style
    ├── Can ESLint express it? → add to eslint.config.js at error severity.
    └── No → continue
        Is it about an unsafe tool invocation (git, rm -rf, etc.)?
        ├── Yes → extend scripts/hooks/deny-dangerous-git.sh + add tests
        └── No → continue
            Is it about who can change a file?
            ├── Yes → CODEOWNERS entry
            └── No → continue
                Is it about agent process (e.g. require subagent review)?
                ├── Yes → Subagent Review Discipline trigger list in CLAUDE.md
                └── No → document in CLAUDE.md as a last resort
```

## What's deployed in this repo

| Gate | Path | Purpose |
|---|---|---|
| CI: `quality-gate / qa` | `.github/workflows/quality-gate.yml` (called from `ci.yml`) | runs `npm run qa` (lint → typecheck → coverage → test:hooks) |
| CI: `dco` | `.github/workflows/ci.yml` | every non-merge commit must carry `Signed-off-by:` |
| Pre-commit | `scripts/pre-commit` | runs `npm run qa` before every commit |
| `PreToolUse:Bash` hook | `scripts/hooks/deny-dangerous-git.sh` | blocks `--no-verify` and force-push to `main`/`master` |
| `PostToolUse:Edit\|Write` hook | `scripts/hooks/post-edit-lint.sh` | runs ESLint on the edited file |
| `SessionStart` hook | `scripts/hooks/session-start-context.sh` | injects the enforcement summary + branch state |
| Hook test harness | `scripts/hooks/test-hooks.sh` | wired into `npm run qa` via `test:hooks` |
| CODEOWNERS | `.github/CODEOWNERS` | maintainer review on spec, ADRs, CLAUDE.md, workflows, the hook scripts themselves, the harness skill |
| Branch protection | `scripts/apply-branch-protection.sh` | idempotent `gh api` script, `enforce_admins: true` |
| PR template | `.github/pull_request_template.md` | visible checklist |
| Subagent review trigger list | `CLAUDE.md` § Subagent Review Discipline | mechanical path-glob list |

## Lessons learned writing the hooks

These pitfalls are **all real bugs that shipped and were caught by reviews.**
Apply them when extending or writing new hooks.

### Regex patterns — false positives to avoid

- **Use word-boundary matching, not substring.** `--no-verify` as a
  substring matches `git log --grep=--no-verify` (legitimate). Pattern:
  `(^|[[:space:]])--no-verify([[:space:]]|=|$)` — preceded by start-of-
  string or whitespace; followed by whitespace, `=`, or end-of-string.

- **Branch-name separators must exclude `/`.** `feature/main` is a feature
  branch, not the `main` branch. Use `[^[:alnum:]_/]` as the separator
  class so `/` does NOT count as a valid boundary before `main`. The same
  separators correctly allow quote characters (`"`), so wrapped commands
  like `bash -c "git push --force origin main"` still match.

- **Substring suffixes (`mainframe`, `maintain`) must not match `main`.**
  `[^[:alnum:]_/]` after `main` excludes alphanumerics, so `mainframe`
  doesn't trigger.

### Regex patterns — false negatives to avoid

- **Case-normalize before matching.** `GIT PUSH --FORCE origin main`
  bypasses lowercase patterns. `tr '[:upper:]' '[:lower:]'` first.

- **Detect indirection wrappers.** `bash -c '...'`, `sh -c '...'`,
  `eval '...'`, `xargs ...` all embed commands inside arguments. Loosen
  the `git push` boundary regex to `(^|[^[:alnum:]_])git[[:space:]]+push`
  so quotes and backticks correctly serve as command boundaries.

- **Detect bundled short flags.** `git push -fu origin main` clusters
  `-f` + `-u`. Pattern: `(^|[[:space:]])-[a-z0-9]*f[a-z0-9]*([[:space:]]|=|$)` —
  match any cluster containing `f`.

- **Detect `+ref` forced refspec.** `git push origin +main` is a force-push
  without `--force`. Pattern: `(^|[^[:alnum:]_])\+(main|master)([^[:alnum:]_/]|$)`.

- **Detect missing refspec.** `git push --force` (no args) and
  `git push --force origin` (only remote) push the **current branch**,
  which the hook can't see and could be `main`. Block when force flag is
  present and there are <2 positional args after `git push`. The
  `deny-dangerous-git.sh` script uses a node helper to count positional
  tokens.

### Worktree compatibility

- **Don't test for `.git` as a directory.** In linked worktrees `.git` is
  a file containing `gitdir: ...`, not a directory. Use
  `git rev-parse --git-dir >/dev/null 2>&1` instead. Spec §10.4 endorses
  worktrees for the weekly-merge / hotfix flow, so this matters.

### CI gotchas

- **DCO must skip merge commits.** Spec §10.4 prescribes weekly
  `git merge main` into `pivot/data-transparency`. Auto-generated merge
  commits don't carry human DCO sign-off. Use `git rev-list --no-merges`
  in the DCO check.

- **Reusable workflow status-check names include the calling job.** A job
  defined in `quality-gate.yml` and called as
  `jobs.quality-gate: uses: ./.github/workflows/quality-gate.yml` shows up
  on the PR as `quality-gate / qa`, not `qa`. Match this exactly in the
  branch-protection contexts list.

### The hook can block its own bash invocation

The `PreToolUse:Bash` hook matches its regex anywhere in the command-line
text — including prose. A `git commit -s -m "..."` whose message body
contains a trigger pattern (e.g. an example like `git push --force origin
main` written for documentation) will be blocked.

**Workaround:** write the message to a file and use `git commit -F path`.
The path string doesn't contain the patterns. Same applies to any other
bash invocation that happens to contain trigger prose.

### Test harness conventions

- Every new hook rule MUST have an allow-case test AND a deny-case test in
  `scripts/hooks/test-hooks.sh`. Bare deny tests are not enough — they
  miss false-positive regressions.
- The harness is wired into `npm run qa` via the `test:hooks` script, so
  hook regressions fail the gate.
- The `test:hooks` script silences stdout/stderr; if you need to see hook
  output during debugging, run the hook directly with stdin redirection.

## Recipes

### Add a new CI required check

1. Add the job to `.github/workflows/ci.yml` (or to `quality-gate.yml` if
   it should run for everything `qa` runs for).
2. Add the status-check context to the `required_status_checks.contexts`
   array in `scripts/apply-branch-protection.sh`. Use the actual rendered
   name (`<calling-job> / <inner-job>` for reusable workflows).
3. Maintainer re-runs `./scripts/apply-branch-protection.sh` to apply.

### Add a new `PreToolUse` rule

1. Extend `scripts/hooks/deny-dangerous-git.sh` (or write a new script
   alongside it).
2. Add allow-case AND deny-case tests to `scripts/hooks/test-hooks.sh`.
3. Run `./scripts/hooks/test-hooks.sh` to verify.
4. Run `npm run qa` to verify the harness gate.

### Add a path to the subagent review trigger

1. Add the path glob to `.github/CODEOWNERS` so maintainer review is
   required.
2. Add the same path glob to the `## Subagent Review Discipline` section
   of `CLAUDE.md`.
3. The trigger list is **mechanical** by design — no judgment calls.

### Debug a hook firing

1. Reproduce the hook input. The `PreToolUse:Bash` hook reads
   `{"tool_input":{"command":"..."}}` from stdin.
2. Run the hook directly:
   ```sh
   echo '{"tool_input":{"command":"<the command>"}}' \
     | ./scripts/hooks/deny-dangerous-git.sh
   echo "exit=$?"
   ```
3. Inspect stderr for the block reason. Inspect each `has_*` /
   `targets_*` regex by extracting it and running it standalone:
   ```sh
   echo '<the command>' | grep -qE '<the regex>'; echo "match=$?"
   ```
4. Add a regression test before fixing — see "Test harness conventions" above.

## Anti-patterns to refuse

These have been proposed in the project's history and rejected for good
reasons. **Don't reintroduce them without an ADR.**

### "Split CLAUDE.md into a hub-and-spoke directory structure"

Common request: "agents are ignoring rules; let's split `CLAUDE.md` into a
router file plus topical files in `docs/ai/` (or `.cursor/rules/` etc.)."

This is the wrong lever. It targets the **weakest** enforcement layer
(documented instructions) and adds drift (now changes have to land in
multiple files in sync). Splitting the rules across files often makes
compliance worse — agents read the router and skip the leaves.

The right response: add or strengthen a higher-strength gate (CI check,
hook, CODEOWNERS) for whatever rule was being ignored.

### "Add the lint rule when violations appear"

Reactive lint is too late. Agents will have already written the
violations and they'll need to be reverted. **All ESLint rules ship at
`severity: 'error'` from Day 1** (spec §6.3). Same principle for hooks:
when a bypass is found, fix it AND add a regression test in the same PR.

### "We can skip the subagent review on this load-bearing change because it's small"

The trigger list is mechanical for exactly this reason: any judgment
call lets compliance erode over time. If a path is in the trigger list,
the review is required. CODEOWNERS will block the merge otherwise.

### "Document this rule in CLAUDE.md and trust agents to follow it"

If a rule is important enough to document, it's important enough to
enforce. Walk back through the decision tree and find the strongest
layer that can express it. CLAUDE.md is a fallback, not a primary
enforcement mechanism.

## Verifying the harness is intact

After any change touching the harness:

1. `npm run qa` — passes lint + typecheck + 58 unit tests + 53 hook tests.
2. `./scripts/hooks/test-hooks.sh` — passes standalone (catches harness
   regressions even if `npm run qa` wiring is broken).
3. Manually exercise the canonical block-cases:
   ```sh
   echo '{"tool_input":{"command":"git commit --no-verify"}}' \
     | ./scripts/hooks/deny-dangerous-git.sh; echo "exit=$?"  # expect 2
   ```
4. CI on the PR: `quality-gate / qa` ✓ and `dco` ✓ before merge.
5. After merge, branch protection still requires both contexts — if you
   added a new context, the maintainer re-runs
   `./scripts/apply-branch-protection.sh`.

## Why this skill exists

Future agents working on this repo will be tempted to:

- Refactor `CLAUDE.md` into a hub-and-spoke layout to "improve
  organization" — this is the wrong lever (see anti-patterns above).
- Skip writing tests for a new hook because "it's just a small regex
  change" — every prior small regex change has had a bug.
- Disable a gate that's blocking them in the moment instead of fixing
  the root cause.

This skill is the load-bearing context that prevents those mistakes. If
the harness is being changed, this skill should be loaded first.
