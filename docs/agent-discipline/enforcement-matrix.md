# Agent Discipline Enforcement Matrix

Current status of the repository's agent-discipline surfaces.

| Surface | Status | Role |
|---|---|---|
| [AGENTS.md](../../AGENTS.md) | Active | Canonical checked-in rules file for all agents; Codex consumes this natively. |
| [CLAUDE.md](../../CLAUDE.md) | Active | Claude compatibility shim that points back to `AGENTS.md`. |
| [`.claude/settings.json`](../../.claude/settings.json) | Active | Committed Claude runtime hook registration for session-start, pre-bash, post-edit, and post-bash hooks. |
| `~/.codex/config.toml` | Local-only | User-local Codex preferences such as model selection and trust level. Not a repo authority surface. |
| `.Codex/settings.json` | Not present | Do not claim a repo-local Codex hook transport until this file actually exists and is wired. |
| [scripts/pre-commit](../../scripts/pre-commit) | Active | Local QA gate before commit. |
| [scripts/prepare-commit-msg](../../scripts/prepare-commit-msg) | Active | Local DCO trailer helper; installed by `npm run setup`. |
| [scripts/install-git-hooks.mjs](../../scripts/install-git-hooks.mjs) | Active | Installer for tracked git hooks. |
| [scripts/check-agent-discipline-sync.mjs](../../scripts/check-agent-discipline-sync.mjs) | Active | Fails `npm run qa` when active docs drift from the verified authority model. |
| [scripts/hooks/test-hooks.sh](../../scripts/hooks/test-hooks.sh) | Active | Verifies hook and hook-adjacent installer behavior. |
| [`.github/CODEOWNERS`](../../.github/CODEOWNERS) | Active | Protects load-bearing enforcement surfaces. |

## Notes

- Codex-native instruction loading is available now through `AGENTS.md`.
- Repo-local Codex hook parity is **not** claimed in this repository yet.
- If a future branch adds repo-local Codex runtime config, update this matrix, `AGENTS.md`, CODEOWNERS, and the sync-check script in the same change.
