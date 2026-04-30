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

# ---------- .mjs unit tests (node --test) ----------
# The hook/installer helpers ship sibling unit-test files exercised via
# `node --test`. Run them before the bash integration tests below so this
# single entry point covers both layers and CI's exit code reflects
# regressions in either. Without this, unit-only-covered code paths
# wouldn't fail CI.
echo "==> Running .mjs unit tests via node --test..."
if ! node --test \
  scripts/hooks/post-pr-create-reminder.test.mjs \
  scripts/install-git-hooks.test.mjs; then
  echo "FAIL: .mjs unit tests failed" >&2
  exit 1
fi
echo "==> .mjs unit tests passed; continuing to bash integration tests..."
echo

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

# ---- Deny list: bundled short-flag clusters (Codex P1 finding) ----
# `-fu` is `-f` + `-u` clustered. `-uf` likewise. Force flag must be
# detected anywhere in a short-flag cluster.
run_test "denies: git push -fu origin main"          "$HOOK" '{"tool_input":{"command":"git push -fu origin main"}}'                    2
run_test "denies: git push -uf origin main"          "$HOOK" '{"tool_input":{"command":"git push -uf origin main"}}'                    2
run_test "denies: git push -fuv origin main"         "$HOOK" '{"tool_input":{"command":"git push -fuv origin main"}}'                   2
# Cluster without `f` is not force; should pass through (no force flag).
run_test "allows: git push -uv origin main (no -f)"  "$HOOK" '{"tool_input":{"command":"git push -uv origin main"}}'                    0

# ---- Deny list: force-push without explicit refspec (Codex P1 finding) ----
# When the refspec is omitted, git uses the current branch — which the
# hook can't determine and could be `main`. Block these unconditionally.
run_test "denies: git push --force (no args)"        "$HOOK" '{"tool_input":{"command":"git push --force"}}'                            2
run_test "denies: git push -f (no args)"             "$HOOK" '{"tool_input":{"command":"git push -f"}}'                                 2
run_test "denies: git push --force origin (no ref)"  "$HOOK" '{"tool_input":{"command":"git push --force origin"}}'                     2
run_test "denies: git push --force-with-lease only"  "$HOOK" '{"tool_input":{"command":"git push --force-with-lease"}}'                 2
run_test "denies: git push -fu origin (no ref)"      "$HOOK" '{"tool_input":{"command":"git push -fu origin"}}'                         2
# But: explicit non-protected refspec passes through.
run_test "allows: git push --force origin feat/foo"  "$HOOK" '{"tool_input":{"command":"git push --force origin feat/foo"}}'            0
run_test "allows: git push -fu origin feat/foo"      "$HOOK" '{"tool_input":{"command":"git push -fu origin feat/foo"}}'                0

# ---------- session-start-context.sh ----------
HOOK="$HOOKS_DIR/session-start-context.sh"
run_test "session-start: exits 0"                    "$HOOK" ''                                                                         0

# ---------- post-edit-lint.sh ----------
HOOK="$HOOKS_DIR/post-edit-lint.sh"
run_test "post-edit-lint: exit 0 on empty"           "$HOOK" ''                                                                         0
run_test "post-edit-lint: exit 0 on .md file"        "$HOOK" '{"tool_input":{"file_path":"README.md"}}'                                 0
run_test "post-edit-lint: exit 0 on nonexistent"     "$HOOK" '{"tool_input":{"file_path":"nonexistent.ts"}}'                            0
run_test "post-edit-lint: exit 0 on malformed JSON"  "$HOOK" 'not json'                                                                 0

# ---------- post-pr-create-reminder.sh ----------
HOOK="$HOOKS_DIR/post-pr-create-reminder.sh"

# Always exits 0; the discriminator is whether stdout carries the
# additionalContext payload. run_test only checks exit code, so we add a
# bespoke run_test_emits / run_test_silent pair to assert on stdout.

# run_test_emits <name> <hook> <input> — exits 0 AND emits non-empty stdout.
run_test_emits() {
  name="$1"
  hook="$2"
  input="$3"
  set +e
  out="$(printf '%s' "$input" | "$hook" 2>/dev/null)"
  actual=$?
  set -e
  if [ "$actual" = "0" ] && [ -n "$out" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_LINES="$FAILED_LINES\n  - $name (expected exit 0 + non-empty stdout; got exit $actual + stdout=[$out])"
  fi
}

# run_test_emits_contains <name> <hook> <input> <substring> — exits 0
# AND stdout contains <substring>. Used to assert worktree-path injection
# (and absence of injection) for the post-pr-create-reminder hook.
run_test_emits_contains() {
  name="$1"
  hook="$2"
  input="$3"
  needle="$4"
  set +e
  out="$(printf '%s' "$input" | "$hook" 2>/dev/null)"
  actual=$?
  set -e
  case "$out" in
    *"$needle"*) found=1 ;;
    *)           found=0 ;;
  esac
  if [ "$actual" = "0" ] && [ "$found" = "1" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_LINES="$FAILED_LINES\n  - $name (expected exit 0 + stdout containing [$needle]; got exit $actual + stdout=[$out])"
  fi
}

# run_test_emits_excludes <name> <hook> <input> <substring> — exits 0,
# stdout is non-empty (i.e. hook fired) AND does NOT contain <substring>.
# Used to assert v1-fallback when cwd resolution fails.
run_test_emits_excludes() {
  name="$1"
  hook="$2"
  input="$3"
  needle="$4"
  set +e
  out="$(printf '%s' "$input" | "$hook" 2>/dev/null)"
  actual=$?
  set -e
  case "$out" in
    *"$needle"*) found=1 ;;
    *)           found=0 ;;
  esac
  if [ "$actual" = "0" ] && [ -n "$out" ] && [ "$found" = "0" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_LINES="$FAILED_LINES\n  - $name (expected exit 0 + non-empty stdout NOT containing [$needle]; got exit $actual + stdout=[$out])"
  fi
}

# run_test_silent <name> <hook> <input> — exits 0 AND emits empty stdout.
run_test_silent() {
  name="$1"
  hook="$2"
  input="$3"
  set +e
  out="$(printf '%s' "$input" | "$hook" 2>/dev/null)"
  actual=$?
  set -e
  if [ "$actual" = "0" ] && [ -z "$out" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_LINES="$FAILED_LINES\n  - $name (expected exit 0 + empty stdout; got exit $actual + stdout=[$out])"
  fi
}

# Two-layer match: (a) command at command-start position AND (b) stdout
# carries a github PR URL (success indicator). Only emit when both fire.
PR_URL_OK='https://github.com/owner/repo/pull/42\n'

# --- emit cases (command position match + PR URL in stdout) ---
run_test_emits  "post-pr-create: emits — gh pr create at start, success"        "$HOOK" '{"tool_input":{"command":"gh pr create --title foo --body bar"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'
run_test_emits  "post-pr-create: emits — chained (cd ... && gh pr create)"      "$HOOK" '{"tool_input":{"command":"cd repo && gh pr create --base main"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'
run_test_emits  "post-pr-create: emits — chained with ;"                        "$HOOK" '{"tool_input":{"command":"date; gh pr create"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'

# --- silent cases — command-position fail (Codex P2 #1) ---
# `echo "gh pr create"` is the false-positive Codex flagged on the v1
# implementation. The hook MUST NOT fire when the substring lives inside
# echo/grep/comment/etc., even if the stdout happens to mention a URL.
run_test_silent "post-pr-create: silent — echo with substring (P2 #1)"          "$HOOK" '{"tool_input":{"command":"echo \"gh pr create\""},"tool_response":{"stdout":"gh pr create\n"}}'
run_test_silent "post-pr-create: silent — grep matches the substring (P2 #1)"   "$HOOK" '{"tool_input":{"command":"grep '\''gh pr create'\'' file.txt"},"tool_response":{"stdout":"gh pr create\n"}}'
run_test_silent "post-pr-create: silent — gh pr created-at"                     "$HOOK" '{"tool_input":{"command":"gh pr created-at"},"tool_response":{"stdout":""}}'
run_test_silent "post-pr-create: silent — gh pr list"                           "$HOOK" '{"tool_input":{"command":"gh pr list"},"tool_response":{"stdout":""}}'
run_test_silent "post-pr-create: silent — gh pr comment"                        "$HOOK" '{"tool_input":{"command":"gh pr comment 16 --body \"x\""},"tool_response":{"stdout":""}}'
run_test_silent "post-pr-create: silent — npm run qa"                           "$HOOK" '{"tool_input":{"command":"npm run qa"},"tool_response":{"stdout":""}}'

# --- silent cases — success-gate fail (Codex P2 #2) ---
# Failed `gh pr create` (auth, network, etc.) leaves no PR URL in
# stdout. Hook must not fire even though command position matches.
run_test_silent "post-pr-create: silent — gh pr create empty stdout (auth fail)" "$HOOK" '{"tool_input":{"command":"gh pr create --title foo"},"tool_response":{"stdout":""}}'
run_test_silent "post-pr-create: silent — gh pr create error stdout"             "$HOOK" '{"tool_input":{"command":"gh pr create"},"tool_response":{"stdout":"Error: GraphQL error\n"}}'
run_test_silent "post-pr-create: silent — gh pr create no tool_response"         "$HOOK" '{"tool_input":{"command":"gh pr create --title foo"}}'

# --- silent cases — malformed input ---
run_test_silent "post-pr-create: silent — empty stdin"                          "$HOOK" ''
run_test_silent "post-pr-create: silent — malformed JSON"                       "$HOOK" 'not json'

# --- worktree-aware injection cases ---
# Resolve the current worktree's absolute path from `git worktree list
# --porcelain`. We use the *current* invocation directory (where this
# test harness was launched from) as the cwd input — that way the test
# stays correct whether run from the main checkout or from a worktree.
# The hook process inherits CLAUDE_PROJECT_DIR explicitly so it consults
# the same git worktree list we just queried.
PROJECT_DIR="$(pwd)"
export CLAUDE_PROJECT_DIR="$PROJECT_DIR"
SELF_WORKTREE="$(git -C "$PROJECT_DIR" rev-parse --show-toplevel)"

# Build a synthetic JSON payload with cwd set to the current worktree.
# `printf` is the portable way to emit a string with a single embedded
# variable; we construct the JSON inline below.
WT_PAYLOAD_MATCH='{"cwd":"'"$SELF_WORKTREE"'","tool_input":{"command":"gh pr create"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'
WT_PAYLOAD_NESTED='{"cwd":"'"$SELF_WORKTREE/scripts/hooks"'","tool_input":{"command":"gh pr create"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'
WT_PAYLOAD_OUTSIDE='{"cwd":"/tmp/definitely-not-a-worktree","tool_input":{"command":"gh pr create"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'
WT_PAYLOAD_NO_CWD='{"tool_input":{"command":"gh pr create"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'

run_test_emits_contains \
  "post-pr-create: injects worktree path when cwd matches" \
  "$HOOK" "$WT_PAYLOAD_MATCH" "worktree at $SELF_WORKTREE"
run_test_emits_contains \
  "post-pr-create: injects worktree path when cwd is nested inside worktree" \
  "$HOOK" "$WT_PAYLOAD_NESTED" "worktree at $SELF_WORKTREE"
run_test_emits_excludes \
  "post-pr-create: falls back to v1 when cwd is outside any worktree" \
  "$HOOK" "$WT_PAYLOAD_OUTSIDE" "worktree at /"
run_test_emits_excludes \
  "post-pr-create: falls back to v1 when cwd field is missing" \
  "$HOOK" "$WT_PAYLOAD_NO_CWD" "worktree at /"

# Latency SLO: hook must complete in well under 500ms (no network calls;
# only one synchronous `git worktree list --porcelain` exec). Use perl
# for sub-second portability across BSD/GNU date. Take 3 samples and
# assert on the min — a real >500ms regression still trips 3-of-3, but
# busy CI runners no longer flake on a single noisy sample.
SLO_INPUT='{"cwd":"'"$SELF_WORKTREE"'","tool_input":{"command":"gh pr create"},"tool_response":{"stdout":"'"$PR_URL_OK"'"}}'
MIN_MS=999999
for SAMPLE in 1 2 3; do
  START_MS="$(perl -MTime::HiRes=time -e 'printf "%d\n", time()*1000')"
  printf '%s' "$SLO_INPUT" | "$HOOK" >/dev/null 2>&1
  END_MS="$(perl -MTime::HiRes=time -e 'printf "%d\n", time()*1000')"
  ELAPSED_MS=$((END_MS - START_MS))
  [ "$ELAPSED_MS" -lt "$MIN_MS" ] && MIN_MS=$ELAPSED_MS
done
if [ "$MIN_MS" -lt 500 ]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  FAILED_LINES="$FAILED_LINES\n  - post-pr-create: latency SLO <500ms (min=${MIN_MS}ms over 3 samples)"
fi

# ---------- summary ----------
printf '\nHook tests: %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed tests:%b\n' "$FAILED_LINES" >&2
  exit 1
fi
exit 0
