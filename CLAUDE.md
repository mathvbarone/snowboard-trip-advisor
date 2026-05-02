# CLAUDE.md

Claude-specific compatibility shim. The full rule book lives in [`AGENTS.md`](AGENTS.md).

## Read This First

- **[`AGENTS.md`](AGENTS.md) is the authoritative checked-in rule book** for every agent operating on this repository. All TypeScript / style / React / coverage / PR-sizing / subagent-review / DCO / architecture rules live there. If you read only one file before touching code, read AGENTS.md.
- [`docs/agent-discipline/enforcement-matrix.md`](docs/agent-discipline/enforcement-matrix.md) records which gates are active, where they live, and which surfaces enforce them.
- [`.claude/settings.json`](.claude/settings.json) is the active committed Claude runtime hook registration. The hooks it registers (`PreToolUse:Bash`, `PostToolUse:Edit|Write`, `SessionStart`) implement enforcement gates that AGENTS.md describes.

## Local Setup

Same as AGENTS.md "Setup":

```bash
npm install
npm run setup
```

## Claude-Specific Notes

- The Claude SessionStart hook (`scripts/hooks/session-start-context.sh`) emits an enforcement summary into the model's session context at startup. **It does not replace AGENTS.md** — it surfaces a compact pointer. Read AGENTS.md fully before load-bearing changes.
- If a hook message, in-context reminder, or stale comment conflicts with AGENTS.md or the enforcement matrix, treat the checked-in docs as authoritative and fix the stale reference in the same branch.
- The PreToolUse:Bash hook (`scripts/hooks/deny-dangerous-git.sh`) blocks `--no-verify` and force-pushes to `main`/`master`. A blocked call surfaces the reason; adjust, don't retry.
- The PostToolUse:Edit|Write hook lints the file just edited; surface violations in-loop so the agent self-corrects before commit.

If a Codex-equivalent runtime hook surface lands later, AGENTS.md gets a parallel "Codex-Specific Notes" section and the enforcement matrix grows a column. Until then, the runtime gates listed in `.claude/settings.json` are Claude-only at runtime; the CI gates (`quality-gate / qa`, `dco`) cover everything for non-Claude agents at PR time.
