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
#       * `--force`, `--force-with-lease`, or `-f` (incl. clustered short
#         flags like `-fu`, `-uf`, `-fuv`)
#       * `+ref` forced-refspec prefix (e.g. `git push origin +main`)
#     Enforced even when wrapped in `bash -c`, `sh -c`, `eval`, `xargs`,
#     and case-insensitive (`GIT PUSH --FORCE` is matched).
#   - Force-push without an explicit refspec (e.g. `git push --force` or
#     `git push --force origin`). The implicit target is the current
#     branch, which the hook cannot determine statically and could be
#     `main`. The agent must be explicit about the target ref.
#
# What does NOT get blocked:
#   - `--no-verify` embedded inside a larger argument like `--grep=--no-verify`.
#   - `git commit --amend` on unpushed commits (legitimate TDD flow).
#   - `git reset --hard` generically.
#   - Force-push with an explicit non-main/master refspec (e.g.
#     `git push --force origin feature/main`, `user/master`).

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
if printf '%s' "$lower" | grep -qE '(^|[[:space:]])--no-verify([[:space:]]|=|$)'; then
  block "--no-verify bypasses the pre-commit quality gate (CLAUDE.md: forbidden)"
fi

# --- Rule 2: block dangerous git push variants ---
# Block when `git push` is present (even via wrappers) AND a force mechanism
# is present, AND either:
#   (a) the target is main/master, OR
#   (b) there is no explicit refspec (current branch is implicit and could
#       be main).

has_git_push=0
if printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+push([[:space:]]|$)'; then
  has_git_push=1
fi

has_force=0
# --force / --force-with-lease as long flags
if printf '%s' "$lower" | grep -qE '(^|[[:space:]])--force(-with-lease)?([[:space:]]|=|$)'; then
  has_force=1
# -f as a short flag, including in clustered short-flag form like -fu, -uf, -fuv.
# Match `-` followed by any cluster of short-flag letters where `f` appears.
elif printf '%s' "$lower" | grep -qE '(^|[[:space:]])-[a-z0-9]*f[a-z0-9]*([[:space:]]|=|$)'; then
  has_force=1
# +ref forced-refspec prefix (e.g. `git push origin +main`)
elif printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])\+(main|master)([^[:alnum:]_/]|$)'; then
  has_force=1
elif printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])\+(origin/|refs/heads/)(main|master)([^[:alnum:]_/]|$)'; then
  has_force=1
fi

# Protected branch token. Two patterns:
#   (i)  standalone `main` / `master` — preceded and followed by anything
#        that is NOT alphanumeric/underscore/slash. Catches bare `main`,
#        `+main`, ` main`, `:main`, `main:`, `main"`. Does NOT match
#        `feature/main`, `main/foo`, `maintain`, `mainframe`.
#   (ii) `origin/main` or `refs/heads/main` — explicit path prefix.
targets_protected=0
if printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_/])(main|master)([^[:alnum:]_/]|$)'; then
  targets_protected=1
elif printf '%s' "$lower" | grep -qE '(^|[^[:alnum:]_])(origin|refs/heads)/(main|master)([^[:alnum:]_/]|$)'; then
  targets_protected=1
fi

# Detect whether the `git push` invocation has an explicit refspec — i.e.
# at least two positional arguments after `git push` (a remote and a ref).
# A single positional arg (just the remote) means git uses the current
# branch as the ref, which we cannot statically determine and could be
# `main`. We block force-push in that case unconditionally.
#
# Implementation: extract everything between `git push` and the next
# command separator, split into whitespace-delimited tokens, count those
# that don't start with `-` (flag).
explicit_refspec="$(node -e '
  const cmd = process.argv[1] || "";
  const m = cmd.match(/git\s+push\b([^&|;]*)/);
  if (!m) { process.stdout.write("none"); process.exit(0); }
  const tail = m[1];
  const tokens = tail.split(/\s+/).filter((t) => t.length > 0 && !t.startsWith("-"));
  process.stdout.write(tokens.length >= 2 ? "yes" : "no");
' -- "$lower" 2>/dev/null || printf 'unknown')"

if [ "$has_git_push" = "1" ] && [ "$has_force" = "1" ]; then
  if [ "$targets_protected" = "1" ]; then
    block "force-push to main/master is forbidden (CLAUDE.md git safety protocol)"
  elif [ "$explicit_refspec" = "no" ]; then
    block "force-push without an explicit refspec is forbidden — the implicit target is the current branch, which could be main/master. Specify the target ref explicitly (e.g. 'git push --force origin <branch>')."
  fi
fi

exit 0
