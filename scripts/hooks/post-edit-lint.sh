#!/bin/sh
# .claude/settings.json → PostToolUse:Edit|Write hook
#
# Runs ESLint on the single file just edited. Non-blocking: lint failures
# surface via stderr so the agent sees them in-loop and can self-correct,
# but the tool call itself is not blocked (the Edit/Write already happened).
#
# Contract:
#   - Input: JSON on stdin with shape
#       {"tool_name": "Edit"|"Write", "tool_input": {"file_path": "..."},
#        "tool_response": {...}}
#   - Exit 0 unconditionally. Stderr is surfaced to the model.

set -eu

path="$(node -e '
  let buf = "";
  process.stdin.on("data", (c) => { buf += c; });
  process.stdin.on("end", () => {
    try {
      const d = JSON.parse(buf);
      const p = d && d.tool_input && d.tool_input.file_path;
      process.stdout.write(typeof p === "string" ? p : "");
    } catch (e) {
      process.stdout.write("");
    }
  });
' 2>/dev/null || printf '')"

# No path extracted → nothing to do.
[ -z "$path" ] && exit 0

# Only lint JS/TS family files.
case "$path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

# File must exist after the edit.
[ -f "$path" ] || exit 0

# ESLint must be installed.
[ -x ./node_modules/.bin/eslint ] || exit 0

# Run ESLint on just this file. Don't block on non-zero; surface the output.
output="$(./node_modules/.bin/eslint --no-color "$path" 2>&1 || true)"
if [ -n "$output" ]; then
  printf 'ESLint output for %s:\n' "$path" >&2
  printf '%s\n' "$output" >&2
fi

exit 0
