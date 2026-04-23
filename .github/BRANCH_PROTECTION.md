# Branch Protection

Branch protection for `main` and `pivot/data-transparency` is codified as an idempotent script at [`scripts/apply-branch-protection.sh`](../scripts/apply-branch-protection.sh).

## Apply

```bash
./scripts/apply-branch-protection.sh
```

Requires the `gh` CLI authenticated with a token that has repo admin scope. Re-run after creating new long-lived branches.

## Settings applied

| Setting | `main` | `pivot/data-transparency` |
|---|---|---|
| Require PR before merge | ✓ | ✓ |
| Required status checks | `quality-gate / qa`, `dco` | `quality-gate / qa`, `dco` |
| Strict status checks (branches up-to-date with base) | ✓ | ✓ |
| Required reviews | 1 (CODEOWNERS) | 1 (CODEOWNERS) |
| Dismiss stale approvals on new push | ✓ | ✓ |
| Conversation resolution required | ✓ | ✓ |
| `enforce_admins` | ✓ | ✓ |
| Force push | ✗ | ✗ |
| Deletion | ✗ | ✗ |
| Linear history | ✓ | ✗ |

## Rationale

- **`enforce_admins: true`** — prevents silent admin bypass. The maintainer merges via the PR flow like anyone else.
- **Linear history OFF on `pivot/data-transparency`** — supports the weekly `git merge main` strategy in spec §10.4. Rebase is not allowed on that branch (non-fast-forward merges are required).
- **`qa` + `dco` required status checks** — ensure the quality gate and DCO sign-off pass on every PR.
- **CODEOWNERS-required reviews** — route load-bearing paths (spec, ADRs, enforcement surface) to the maintainer.
- **`required_conversation_resolution: true`** — unresolved review comments block merge.

## Why a script instead of prose

Documentation drifts. A script is idempotent, runnable, and reviewable in diff. The Markdown file exists as a pointer; the settings live in the script.
