#!/bin/sh
# .claude/settings.json → PreToolUse:Bash hook
#
# Blocks dangerous git commands that bypass quality gates or destroy pushed
# history. Invoked before every Bash tool call.
#
# Contract:
#   - Input: JSON on stdin with shape
#       {"tool_name": "Bash", "tool_input": {"command": "..."}}
#   - Exit 0: allow the tool call.
#   - Exit 2: block the tool call; stderr is surfaced to the model so it
#     can adjust its approach.
#
# What gets blocked:
#   - `--no-verify` as a command-line flag (bypasses the pre-commit hook
#     that enforces `npm run qa`; forbidden by CLAUDE.md).
#   - Force-push to `main` or `master`, detected by ANY of:
#       * `--force`, `--force-with-lease`, or `-f` as a flag
#       * `+ref` forced-refspec prefix (e.g. `git push origin +main`)
#     This is enforced even when wrapped in `bash -c`, `sh -c`, `eval`,
#     `xargs`, etc. — the hook matches on the full command text, including
#     uppercase variants.
#
# What does NOT get blocked:
#   - `--no-verify` embedded inside a larger argument like `--grep=--no-verify`.
#   - `git commit --amend` on unpushed commits (legitimate TDD flow).
#   - `git reset --hard` generically.
#   - Force-push to any branch that is not `main` or `master`
#     (including `feature/main`, `user/main`, `hotfix/master`).

set -eu

# Parse the command from stdin JSON without requiring jq. Node is always
# available in this project.
cmd="$(node -e '
  let buf = "";
  process.stdin.on("data", (c) => { buf += c; });
  process.stdin.on("end", () => {
    try {
      const d = JSON.parse(buf);
      const s = d && d.tool_input && d.tool_input.command;
      process.stdout.write(typeof s === "string" ? s : "");
    } catch (e) {
      process.stdout.write("");
    }
  });
' 2>/dev/null || printf '')"

# Nothing to inspect → allow.
if [ -z "$cmd" ]; then
  exit 0
fi

block() {
  printf 'BLOCKED by .claude/settings.json hook: %s\n' "$1" >&2
  printf 'Command: %s\n' "$cmd" >&2
  printf '\n' >&2
  printf 'The quality gate exists to prevent reverted merges. Do not circumvent.\n' >&2
  printf 'If you genuinely need to bypass this rule, stop and ask the user.\n' >&2
  exit 2
}

# Case-normalize the command for pattern matching; keep the original for
# display. Defeats `GIT PUSH --FORCE origin main` evasion.
lower="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"

# --- Rule 1: block --no-verify used as an argument flag ---
# Must appear as a standalone flag — preceded by start-of-string or
# whitespace, followed by whitespace / `=` / end. This avoids blocking
# legitimate uses like `git log --grep=--no-verify` where the string is
# embedded inside a larger grep argument.
if printf '%s' "$lower" | grep -qE '(^|[[:space:]])--no-verify([[:space:]]|=|$)'; then
  block "--no-verify bypasses the pre-commit quality gate (CLAUDE.md: forbidden)"
fi

# --- Rule 2: block force-push to main/master (even via wrappers) ---
# Block when ALL three are present in the command text:
#   (a) `git push` anywhere (even inside bash -c / sh -c / eval / xargs)
#   (b) a force mechanism (--force, --force-with-lease, -f, or `+ref` prefix)
#   (c) a protected branch token (`main` / `master`) in a ref position
#
# The separator classes use `[^[:alnum:]_/]` so quotes, plus signs,
# semicolons, etc. all terminate a match (allowing detection inside
# `bash -c "..."`). `/` is specifically excluded so `feature/main` does
# NOT match.

has_git_push=0
if printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+push([[:space:]]|$)'; then
  has_git_push=1
fi

has_force=0
# --force / --force-with-lease / -f as a standalone flag
if printf '%s' "$lower" | grep -qE '(^|[[:space:]])(--force|--force-with-lease|-f)([[:space:]]|=|$)'; then
  has_force=1
# +main / +master forced-refspec prefix
elif printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])\+(main|master)([^[:alnum:]_/]|$)'; then
  has_force=1
# +origin/main, +refs/heads/main forced-refspec prefix
elif printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])\+(origin/|refs/heads/)(main|master)([^[:alnum:]_/]|$)'; then
  has_force=1
fi

# Protected branch token. Two patterns:
#   (i)  standalone `main` / `master` — allowed separators on either side
#        are anything that is NOT alphanumeric/underscore/slash. This
#        matches bare `main`, `+main`, ` main`, `:main`, `main:`, `main"`,
#        etc., and crucially does NOT match `feature/main`, `main/foo`,
#        `maintain`, `mainframe`.
#   (ii) `origin/main` or `refs/heads/main` — explicit path prefix.
targets_protected=0
if printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_/])(main|master)([^[:alnum:]_/]|$)'; then
  targets_protected=1
elif printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])(origin|refs/heads)/(main|master)([^[:alnum:]_/]|$)'; then
  targets_protected=1
fi

if [ "$has_git_push" = "1" ] && [ "$has_force" = "1" ] && [ "$targets_protected" = "1" ]; then
  block "force-push to main/master is forbidden (CLAUDE.md git safety protocol)"
fi

exit 0
