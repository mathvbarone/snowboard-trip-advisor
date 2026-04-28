#!/bin/sh
# .claude/settings.json → PostToolUse:Bash hook
#
# After a successful `gh pr create` invocation, inject a reminder into
# the model context to run the per-PR workflow (Codex review + local-
# test execution) before surfacing the PR to the user.
#
# Mechanical complement to the per-PR memory rules:
#   - feedback_codex_review_per_pr.md (post @codex review on every PR)
#   - feedback_local_test_per_pr.md   (generate + execute a local-test
#                                       plan with Playwright MCP browser
#                                       checks; don't just describe steps)
#
# Contract:
#   - Input: JSON on stdin with shape
#       {"tool_name":"Bash","tool_input":{"command":"..."},"tool_response":{...}}
#   - Exit 0 unconditionally (non-blocking; PostToolUse runs after the
#     tool already executed).
#   - On `gh pr create` match: emit JSON on stdout with
#     hookSpecificOutput.additionalContext to be injected into the model.
#   - On non-match: emit nothing.

set -eu

# Parse the Bash command from stdin JSON without requiring jq. Node is
# always available in this project.
cmd="$(node -e '
  let buf = "";
  process.stdin.on("data", (c) => { buf += c; });
  process.stdin.on("end", () => {
    try {
      const d = JSON.parse(buf);
      const c = d && d.tool_input && d.tool_input.command;
      process.stdout.write(typeof c === "string" ? c : "");
    } catch (e) {
      process.stdout.write("");
    }
  });
' 2>/dev/null || printf '')"

# Match `gh pr create` followed by space-or-end. POSIX case patterns are
# anchored at both ends, so `*gh\ pr\ create` does NOT match
# `gh pr created` (because the string continues past `create`). Two
# patterns: `gh pr create` followed by space + args (the typical
# invocation) and `gh pr create` at end-of-string (no-arg form).
case "$cmd" in
  *"gh pr create "*|*"gh pr create")
    cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"PR opened via `gh pr create`. Per the per-PR workflow (memory: feedback_codex_review_per_pr.md + feedback_local_test_per_pr.md), do these in order BEFORE surfacing the PR to the user: (1) post `@codex review` as a PR comment via `gh pr comment <N> --body \"@codex review\"`; (2) generate a tailored local-test plan covering qa, build smoke, dev-server probes, and Playwright MCP browser checks; (3) EXECUTE every step yourself (don't just describe them in chat); (4) fold any in-scope failures on the same branch and reply to relevant threads. Only after that should you summarize to the user."}}
EOF
    ;;
esac
