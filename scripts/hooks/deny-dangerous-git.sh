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
#   - `--no-verify` anywhere in the command (bypasses the pre-commit hook
#     that enforces `npm run qa`; forbidden by CLAUDE.md).
#   - `git push --force`, `git push --force-with-lease`, or `git push -f`
#     when the target ref matches `main` or `master`. Force-pushing to
#     feature branches is allowed (branch realignment after squash-merge
#     is a legitimate pattern).
#
# What does NOT get blocked:
#   - `git commit --amend` on unpushed commits (legitimate TDD flow).
#   - `git reset --hard` generically (legitimate for branch resets).
#   - Force-push to any branch that is not `main` or `master`.

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

# --- Rule 1: block --no-verify anywhere ---
# Covers `git commit --no-verify`, `git push --no-verify`, and any wrapper.
case "$cmd" in
  *--no-verify*)
    block "--no-verify bypasses the pre-commit quality gate (CLAUDE.md: forbidden)"
    ;;
esac

# --- Rule 2: block force-push to main/master ---
# Detect `git push` with a force variant (--force / --force-with-lease / -f)
# that targets main or master (with or without `origin`).
is_git_push=0
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)git[[:space:]]+push([[:space:]]|$)'; then
  is_git_push=1
fi

has_force=0
if printf '%s' "$cmd" | grep -qE '(--force|--force-with-lease)([[:space:]]|=|$)'; then
  has_force=1
elif printf '%s' "$cmd" | grep -qE '[[:space:]]-f([[:space:]]|$)'; then
  has_force=1
fi

targets_protected=0
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]]|/)main([[:space:]]|:|$)'; then
  targets_protected=1
elif printf '%s' "$cmd" | grep -qE '(^|[[:space:]]|/)master([[:space:]]|:|$)'; then
  targets_protected=1
fi

if [ "$is_git_push" = "1" ] && [ "$has_force" = "1" ] && [ "$targets_protected" = "1" ]; then
  block "force-push to main/master is forbidden (CLAUDE.md git safety protocol)"
fi

exit 0
