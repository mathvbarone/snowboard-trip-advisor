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

# ---- Allow list: normal and edge-case-legitimate commands ----
run_test "allows: git status"                        "$HOOK" '{"tool_input":{"command":"git status"}}'                                  0
run_test "allows: git commit -s -m msg"              "$HOOK" '{"tool_input":{"command":"git commit -s -m msg"}}'                        0
run_test "allows: non-git command"                   "$HOOK" '{"tool_input":{"command":"ls -la"}}'                                      0
run_test "allows: tail -f (not git -f)"              "$HOOK" '{"tool_input":{"command":"tail -f logfile"}}'                             0
run_test "allows: rm -f (not git -f)"                "$HOOK" '{"tool_input":{"command":"rm -f tmp.txt"}}'                               0
run_test "allows: git push to feature branch"        "$HOOK" '{"tool_input":{"command":"git push origin feature/foo"}}'                 0
run_test "allows: git push --force to feature"       "$HOOK" '{"tool_input":{"command":"git push --force origin feature/foo"}}'         0
run_test "allows: git push --force-with-lease feat"  "$HOOK" '{"tool_input":{"command":"git push --force-with-lease origin feat/x"}}'   0
# Branch named feature/main is NOT protected (the protected token is `main` standalone or `origin/main`).
run_test "allows: push --force to feature/main"      "$HOOK" '{"tool_input":{"command":"git push --force origin feature/main"}}'        0
run_test "allows: push --force to user/main"         "$HOOK" '{"tool_input":{"command":"git push --force origin user/main"}}'           0
run_test "allows: push --force to hotfix/master"     "$HOOK" '{"tool_input":{"command":"git push --force origin hotfix/master"}}'       0
# Branch names containing `main` or `master` as a substring should NOT trigger.
run_test "allows: push --force to mainframe"         "$HOOK" '{"tool_input":{"command":"git push --force origin mainframe"}}'           0
run_test "allows: push --force to maintain"          "$HOOK" '{"tool_input":{"command":"git push --force origin maintain"}}'            0
run_test "allows: empty stdin"                       "$HOOK" ''                                                                         0
run_test "allows: malformed JSON"                    "$HOOK" 'not json'                                                                 0
run_test "allows: non-string command field"          "$HOOK" '{"tool_input":{"command":123}}'                                           0
run_test "allows: missing tool_input"                "$HOOK" '{"tool_name":"Bash"}'                                                     0
run_test "allows: git commit --amend (unpushed OK)"  "$HOOK" '{"tool_input":{"command":"git commit --amend"}}'                          0
# --no-verify embedded in a larger argument is NOT the banned flag form.
run_test "allows: git log --grep=--no-verify"        "$HOOK" '{"tool_input":{"command":"git log --grep=--no-verify"}}'                  0
run_test "allows: commit msg containing no-verify"   "$HOOK" '{"tool_input":{"command":"git log --grep=no-verify"}}'                    0

# ---- Deny list: --no-verify as a flag ----
run_test "denies: git commit --no-verify"            "$HOOK" '{"tool_input":{"command":"git commit --no-verify"}}'                      2
run_test "denies: git commit -sm with --no-verify"   "$HOOK" '{"tool_input":{"command":"git commit -s -m msg --no-verify"}}'            2
run_test "denies: --no-verify trailing flag"         "$HOOK" '{"tool_input":{"command":"git push --no-verify"}}'                        2

# ---- Deny list: force-push to main/master (direct form) ----
run_test "denies: git push --force origin main"      "$HOOK" '{"tool_input":{"command":"git push --force origin main"}}'                2
run_test "denies: git push -f origin main"           "$HOOK" '{"tool_input":{"command":"git push -f origin main"}}'                     2
run_test "denies: git push --force-with-lease main"  "$HOOK" '{"tool_input":{"command":"git push --force-with-lease origin main"}}'     2
run_test "denies: git push --force origin master"    "$HOOK" '{"tool_input":{"command":"git push --force origin master"}}'              2
run_test "denies: git push --force origin/main"      "$HOOK" '{"tool_input":{"command":"git push --force origin/main"}}'                2
run_test "denies: HEAD:main forced refspec"          "$HOOK" '{"tool_input":{"command":"git push --force origin HEAD:main"}}'           2

# ---- Deny list: +ref forced refspec (no --force flag) ----
run_test "denies: git push origin +main"             "$HOOK" '{"tool_input":{"command":"git push origin +main"}}'                       2
run_test "denies: git push origin +master"           "$HOOK" '{"tool_input":{"command":"git push origin +master"}}'                     2
run_test "denies: git push +refs/heads/main"         "$HOOK" '{"tool_input":{"command":"git push origin +refs/heads/main"}}'            2

# ---- Deny list: wrapper indirection (bash -c, sh -c, eval) ----
run_test "denies: bash -c 'git push --force main'"   "$HOOK" '{"tool_input":{"command":"bash -c \"git push --force origin main\""}}'    2
run_test "denies: sh -c 'git push -f main'"          "$HOOK" '{"tool_input":{"command":"sh -c \"git push -f origin main\""}}'           2
run_test "denies: eval 'git push +main'"             "$HOOK" '{"tool_input":{"command":"eval \"git push origin +main\""}}'              2

# ---- Deny list: case insensitivity ----
run_test "denies: uppercase GIT PUSH --FORCE main"   "$HOOK" '{"tool_input":{"command":"GIT PUSH --FORCE origin main"}}'                2
run_test "denies: mixed-case git PUSH --force main"  "$HOOK" '{"tool_input":{"command":"git PUSH --force origin main"}}'                2

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
