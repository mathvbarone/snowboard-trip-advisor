# CLAUDE.md

Claude compatibility entrypoint.

## Read This First

- [AGENTS.md](AGENTS.md) is the authoritative checked-in rules file for this repository.
- [docs/agent-discipline/enforcement-matrix.md](docs/agent-discipline/enforcement-matrix.md) records which enforcement surfaces are active, planned, or local-only.
- [`.claude/settings.json`](.claude/settings.json) remains the active committed Claude runtime hook registration.

## Local Setup

```bash
npm install
npm run setup
```

`npm run setup` installs tracked local git hooks from:

- [scripts/pre-commit](scripts/pre-commit)
- [scripts/prepare-commit-msg](scripts/prepare-commit-msg)

## Claude-Specific Notes

- The session-start hook injects an enforcement summary, but it does not replace `AGENTS.md`.
- If a hook message or stale comment conflicts with `AGENTS.md` or the enforcement matrix, treat the checked-in docs as authoritative and fix the stale reference in the same branch.
