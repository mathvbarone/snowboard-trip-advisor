#!/bin/sh
# .claude/settings.json → PostToolUse:Bash hook
#
# After a SUCCESSFUL `gh pr create` invocation, inject a reminder into
# the model context to run the per-PR workflow (Codex review + local-
# test execution) before surfacing the PR to the user.
#
# Mechanical complement to the per-PR memory rules:
#   - feedback_codex_review_per_pr.md (post @codex review on every PR)
#   - feedback_local_test_per_pr.md   (generate + execute a local-test
#                                       plan with Playwright MCP browser
#                                       checks; don't just describe steps)
#
# Two-layer match (Codex review found both as P2 bugs in v1):
#   1. The command actually invoked `gh pr create` — not as a substring
#      inside `echo`, `grep`, a comment, etc. Detected by matching only
#      at command-start positions (start of string OR after a shell
#      separator: ;, &, |, &&, ||, newline).
#   2. The command SUCCEEDED — detected by looking for a github PR URL
#      (`https://github.com/<owner>/<repo>/pull/<N>`) in stdout. `gh pr
#      create` always prints the URL on success and never on failure.
#
# Contract:
#   - Input: JSON on stdin with shape
#       {"tool_name":"Bash","tool_input":{"command":"..."},
#        "tool_response":{"stdout":"...","stderr":"...",...}}
#   - Exit 0 unconditionally (non-blocking; PostToolUse runs after the
#     tool already executed).
#   - On match (command-position AND success-URL): emit JSON on stdout
#     with hookSpecificOutput.additionalContext to inject into the
#     model.
#   - On non-match: emit nothing.

set -eu

# Read stdin once into a node script that does both checks.
result="$(node -e '
  let buf = "";
  process.stdin.on("data", (c) => { buf += c; });
  process.stdin.on("end", () => {
    try {
      const d = JSON.parse(buf);
      const cmd = (d && d.tool_input && d.tool_input.command) || "";
      const stdout = (d && d.tool_response && d.tool_response.stdout) || "";
      // 1) Command-position match: gh pr create at start-of-string OR
      //    after a shell separator (newline, ;, &, |). Catches && and
      //    || because the regex will match on the first & or | of the
      //    pair; the surrounding whitespace is also tolerated.
      const cmdRe = /(?:^|[\n;&|])\s*gh\s+pr\s+create(?:\s|$)/m;
      const cmdMatches = cmdRe.test(cmd);
      // 2) Success match: gh pr create prints the new PR URL on stdout
      //    on success and prints nothing matching this on failure.
      const urlRe = /https:\/\/github\.com\/[^\/\s]+\/[^\/\s]+\/pull\/\d+/;
      const urlMatches = urlRe.test(stdout);
      process.stdout.write(cmdMatches && urlMatches ? "fire" : "skip");
    } catch (e) {
      process.stdout.write("skip");
    }
  });
' 2>/dev/null || printf 'skip')"

if [ "$result" = "fire" ]; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"PR opened via `gh pr create`. Per the per-PR workflow (memory: feedback_codex_review_per_pr.md + feedback_local_test_per_pr.md), do these in order BEFORE surfacing the PR to the user: (1) post `@codex review` as a PR comment via `gh pr comment <N> --body \"@codex review\"`; (2) generate a tailored local-test plan covering qa, build smoke, dev-server probes, and Playwright MCP browser checks; (3) EXECUTE every step yourself (don't just describe them in chat); (4) fold any in-scope failures on the same branch and reply to relevant threads. Only after that should you summarize to the user."}}
EOF
fi
