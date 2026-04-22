#!/bin/sh
# scripts/hooks/test-hooks.sh
#
# Test harness for .claude/settings.json hook scripts. A broken hook
# silently breaks every tool call, so regressions here must be caught.
# Wired into `npm run qa` via the `test:hooks` script in package.json.

set -eu

HOOKS_DIR="./scripts/hooks"
PASS=0
FAIL=0
FAILED_LINES=""

# run_test <name> <hook_script> <input_json> <expected_exit>
run_test() {
  name="$1"
  hook="$2"
  input="$3"
  expected="$4"

  set +e
  printf '%s' "$input" | "$hook" >/dev/null 2>&1
  actual=$?
  set -e

  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_LINES="$FAILED_LINES\n  - $name (expected exit $expected, got $actual)"
  fi
}

# ---------- deny-dangerous-git.sh ----------
HOOK="$HOOKS_DIR/deny-dangerous-git.sh"

# Allow list
run_test "allows: git status"                        "$HOOK" '{"tool_input":{"command":"git status"}}'                                  0
run_test "allows: git commit -s -m msg"              "$HOOK" '{"tool_input":{"command":"git commit -s -m msg"}}'                        0
run_test "allows: non-git command"                   "$HOOK" '{"tool_input":{"command":"ls -la"}}'                                      0
run_test "allows: git push to feature branch"        "$HOOK" '{"tool_input":{"command":"git push origin feature/foo"}}'                 0
run_test "allows: git push --force to feature"       "$HOOK" '{"tool_input":{"command":"git push --force origin feature/foo"}}'         0
run_test "allows: git push --force-with-lease feat"  "$HOOK" '{"tool_input":{"command":"git push --force-with-lease origin feat/x"}}'   0
run_test "allows: empty stdin"                       "$HOOK" ''                                                                         0
run_test "allows: malformed JSON"                    "$HOOK" 'not json'                                                                 0
run_test "allows: git commit --amend (unpushed OK)"  "$HOOK" '{"tool_input":{"command":"git commit --amend"}}'                          0
run_test "allows: commit msg containing no-verify"   "$HOOK" '{"tool_input":{"command":"git log --grep=no-verify"}}'                    0

# Deny list — --no-verify
run_test "denies: git commit --no-verify"            "$HOOK" '{"tool_input":{"command":"git commit --no-verify"}}'                      2
run_test "denies: git commit -sm with --no-verify"   "$HOOK" '{"tool_input":{"command":"git commit -s -m msg --no-verify"}}'            2

# Deny list — force-push to main/master
run_test "denies: git push --force origin main"      "$HOOK" '{"tool_input":{"command":"git push --force origin main"}}'                2
run_test "denies: git push -f origin main"           "$HOOK" '{"tool_input":{"command":"git push -f origin main"}}'                     2
run_test "denies: git push --force-with-lease main"  "$HOOK" '{"tool_input":{"command":"git push --force-with-lease origin main"}}'     2
run_test "denies: git push --force origin master"    "$HOOK" '{"tool_input":{"command":"git push --force origin master"}}'              2

# ---------- session-start-context.sh ----------
HOOK="$HOOKS_DIR/session-start-context.sh"
run_test "session-start: exits 0"                    "$HOOK" ''                                                                         0

# ---------- post-edit-lint.sh ----------
HOOK="$HOOKS_DIR/post-edit-lint.sh"
run_test "post-edit-lint: exit 0 on empty"           "$HOOK" ''                                                                         0
run_test "post-edit-lint: exit 0 on .md file"        "$HOOK" '{"tool_input":{"file_path":"README.md"}}'                                 0
run_test "post-edit-lint: exit 0 on nonexistent"     "$HOOK" '{"tool_input":{"file_path":"nonexistent.ts"}}'                            0
run_test "post-edit-lint: exit 0 on malformed JSON"  "$HOOK" 'not json'                                                                 0

# ---------- summary ----------
printf '\nHook tests: %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed tests:%b\n' "$FAILED_LINES" >&2
  exit 1
fi
exit 0
