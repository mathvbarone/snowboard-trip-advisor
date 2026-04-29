#!/usr/bin/env node
// scripts/hooks/post-pr-create-reminder.mjs
//
// .claude/settings.json → PostToolUse:Bash hook (invoked via the .sh
// wrapper so the settings.json command path stays stable).
//
// After a SUCCESSFUL `gh pr create` invocation, inject a reminder into
// the model context to run the per-PR workflow (Codex review + local-
// test execution) before surfacing the PR to the user.
//
// **Worktree-aware:** the reminder also includes the absolute path of
// the worktree the agent's bash invocation actually ran from (resolved
// from hook-input `cwd` against `git worktree list --porcelain`), so
// the agent has no excuse to run dev/qa/build against a stale checkout.
//
// Mechanical complement to the per-PR memory rules:
//   - feedback_codex_review_per_pr.md (post @codex review on every PR)
//   - feedback_local_test_per_pr.md   (generate + execute a local-test
//                                       plan with Playwright MCP browser
//                                       checks; don't just describe steps)
//   - feedback_edit_tool_in_worktrees.md (path discipline in worktrees)
//
// Two-layer match (Codex review found both as P2 bugs in v1):
//   1. The command actually invoked `gh pr create` — not as a substring
//      inside `echo`, `grep`, a comment, etc. Detected by matching only
//      at command-start positions (start of string OR after a shell
//      separator: ;, &, |, &&, ||, newline).
//   2. The command SUCCEEDED — detected by looking for a github PR URL
//      (`https://github.com/<owner>/<repo>/pull/<N>`) in stdout. `gh pr
//      create` always prints the URL on success and never on failure.
//
// Worktree resolution layered ON TOP of the gate — only fires if the
// gate already fired. If resolution fails (no `cwd`, ambiguous match,
// `git worktree list` errors, or cwd is outside any worktree) the hook
// falls back to the v1 reminder verbatim, never blocks.
//
// Contract:
//   - Input: JSON on stdin with shape (per Claude Code hooks spec):
//       {"cwd":"/abs/path",
//        "tool_name":"Bash",
//        "tool_input":{"command":"..."},
//        "tool_response":{"stdout":"...","stderr":"...",...}}
//   - Output (on match): JSON on stdout with hookSpecificOutput.
//     additionalContext to inject into the model.
//   - Output (no match): nothing.
//   - Exit 0 unconditionally (PostToolUse hooks must not block).

import { execSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// ---------- Public, testable surface ----------

/**
 * Two-layer success gate. Returns true iff `command` issued
 * `gh pr create` at a real command position AND `stdout` contains a
 * GitHub PR URL (which `gh pr create` only prints on success).
 *
 * @param {{ command?: string, stdout?: string }} input
 * @returns {boolean}
 */
export function shouldFire(input) {
  const cmd = typeof input?.command === 'string' ? input.command : ''
  const stdout = typeof input?.stdout === 'string' ? input.stdout : ''

  // 1) Command-position match: gh pr create at start-of-string OR
  //    after a shell separator (newline, ;, &, |). Catches && and
  //    || because the regex matches on the first & or | of the pair.
  const cmdRe = /(?:^|[\n;&|])\s*gh\s+pr\s+create(?:\s|$)/m
  if (!cmdRe.test(cmd)) {
    return false
  }

  // 2) Success match: gh pr create prints the new PR URL on stdout
  //    on success and prints nothing matching this on failure.
  const urlRe = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/
  return urlRe.test(stdout)
}

/**
 * Resolve the agent's bash `cwd` against a `git worktree list --porcelain`
 * string. Returns the longest matching worktree root path (so a cwd nested
 * inside `.worktrees/feat` resolves to `feat`, not the parent main checkout).
 * Skips entries flagged `detached`, `locked`, or `prunable`. Falls back to
 * null on no match, or when the matched worktree is detached / locked /
 * prunable — the hook then emits the v1 reminder.
 *
 * Realpath normalization handles symlinked worktree roots; on darwin we
 * additionally lowercase paths (the OS treats `/Users/...` and `/users/...`
 * as the same filesystem location).
 *
 * @param {string} cwd  Absolute path the bash command ran from (hook-input).
 * @param {string} porcelain  Output of `git worktree list --porcelain`.
 * @param {{ platform?: string }} [opts]  For test injection of process.platform.
 * @returns {string | null}  Original (un-normalized) worktree path, or null.
 */
export function resolveWorktree(cwd, porcelain, opts = {}) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    return null
  }
  if (typeof porcelain !== 'string' || porcelain.length === 0) {
    return null
  }
  const platform = opts.platform ?? process.platform

  const blocks = parsePorcelainBlocks(porcelain)
  const cwdNorm = normalizePath(cwd, platform)

  // Return the LONGEST-PREFIX matching block across ALL blocks. The most-
  // specific worktree the cwd lives in is what the agent's command actually
  // ran inside, regardless of git's housekeeping flags (`detached`,
  // `locked`, `prunable`). Earlier versions suppressed excluded blocks but
  // that broke CI's default `actions/checkout` behavior (detached HEAD on
  // PR refs is the only worktree, and suppressing it returned null when a
  // valid resolution was available). Returning the path is more useful to
  // the agent — it accurately describes where the command ran — and any
  // staleness signal is captured by the path itself ("oh, this is the
  // .worktrees/stale-* directory").
  let bestBlock = null
  let bestLen = -1
  for (const block of blocks) {
    if (typeof block.path !== 'string' || block.path.length === 0) {
      continue
    }
    const wtNorm = normalizePath(block.path, platform)
    if (cwdNorm === wtNorm || cwdNorm.startsWith(`${wtNorm}/`)) {
      if (wtNorm.length > bestLen) {
        bestBlock = block
        bestLen = wtNorm.length
      }
    }
  }
  return bestBlock === null ? null : bestBlock.path
}

/**
 * Build the reminder body. With a non-null worktree path, prepends the
 * worktree-aware sentence; otherwise returns the v1 body verbatim.
 *
 * @param {string | null} worktreePath
 * @returns {string}
 */
export function buildReminder(worktreePath) {
  const v1Body =
    'PR opened via `gh pr create`. Per the per-PR workflow (memory: ' +
    'feedback_codex_review_per_pr.md + feedback_local_test_per_pr.md), do ' +
    'these in order BEFORE surfacing the PR to the user: (1) post `@codex ' +
    'review` as a PR comment via `gh pr comment <N> --body \\"@codex ' +
    'review\\"`; (2) generate a tailored local-test plan covering qa, ' +
    'build smoke, dev-server probes, and Playwright MCP browser checks; ' +
    "(3) EXECUTE every step yourself (don't just describe them in chat); " +
    '(4) fold any in-scope failures on the same branch and reply to ' +
    'relevant threads. Only after that should you summarize to the user.'

  if (typeof worktreePath !== 'string' || worktreePath.length === 0) {
    return v1Body
  }
  // The `cd <path> &&` is meant to be copy-paste-runnable, so the path is
  // POSIX-shell-quoted (single quotes; embedded `'` escaped via the `'\''`
  // idiom). The human-readable `at <path>` mention stays unquoted for
  // readability — it's prose, not a command.
  const cdArg = shellQuoteSingle(worktreePath)
  const prefix =
    `Run all dev/test/build commands from inside the worktree at ${worktreePath}; ` +
    `prefix bash invocations with cd ${cdArg} && so the trace is auditable. Then: `
  return prefix + v1Body
}

/**
 * POSIX shell-quote a string by wrapping in single quotes and escaping
 * any embedded single quotes via the `'\''` idiom (close quote, escaped
 * quote, reopen). Output is a single shell argument that survives
 * spaces, parens, semicolons, etc. without re-interpretation.
 *
 * @param {string} s
 * @returns {string}
 */
function shellQuoteSingle(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

// ---------- Internal helpers ----------

/**
 * Parse `git worktree list --porcelain` output into block objects. Each
 * worktree is a sequence of "<key> <value>" lines (or bare `detached`/
 * `locked`/`prunable` markers) separated by blank lines.
 *
 * @param {string} porcelain
 * @returns {Array<{path?: string, head?: string, branch?: string,
 *                  detached?: boolean, locked?: boolean, prunable?: boolean}>}
 */
function parsePorcelainBlocks(porcelain) {
  const blocks = []
  let current = {}
  for (const rawLine of porcelain.split('\n')) {
    const line = rawLine.trimEnd()
    if (line === '') {
      if (Object.keys(current).length > 0) {
        blocks.push(current)
        current = {}
      }
      continue
    }
    if (line.startsWith('worktree ')) {
      current.path = line.slice('worktree '.length)
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length)
    } else if (line === 'detached' || line.startsWith('detached ')) {
      current.detached = true
    } else if (line === 'locked' || line.startsWith('locked ')) {
      current.locked = true
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      current.prunable = true
    }
    // Unknown keys are ignored (forward-compat with future git versions).
  }
  if (Object.keys(current).length > 0) {
    blocks.push(current)
  }
  return blocks
}

/**
 * Normalize a filesystem path for cwd↔worktree comparison. Resolves
 * symlinks via realpath (falls back to absolute resolve on error), and
 * lowercases on darwin (case-insensitive HFS+/APFS default).
 *
 * @param {string} p
 * @param {string} platform
 * @returns {string}
 */
function normalizePath(p, platform) {
  // Strip a single trailing slash so '/foo/' and '/foo' compare equal.
  const stripped = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
  let resolved
  try {
    resolved = realpathSync(stripped)
  } catch {
    resolved = resolvePath(stripped)
  }
  return platform === 'darwin' ? resolved.toLowerCase() : resolved
}

/**
 * Run `git -C <projectDir> worktree list --porcelain`. Returns the stdout
 * string on success, or null on any failure (git missing, not a repo,
 * timeout, etc.). Always non-throwing.
 *
 * @param {string} projectDir
 * @returns {string | null}
 */
function runWorktreeList(projectDir) {
  try {
    return execSync('git worktree list --porcelain', {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

// ---------- Entry point ----------

/**
 * Read all of stdin synchronously (fd 0). Hooks receive a small JSON
 * payload — buffering the entire stream is fine.
 *
 * @returns {string}
 */
function readStdinSync() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function main() {
  const raw = readStdinSync()
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return // Silently no-op on bad JSON; PostToolUse must never block.
  }
  if (input === null || typeof input !== 'object') {
    return
  }

  const command = input.tool_input?.command
  const stdout = input.tool_response?.stdout
  if (!shouldFire({ command, stdout })) {
    return
  }

  // Only consult worktree list AFTER the gate fires (saves the git fork
  // on every Bash call; the gate filters >99% of tool invocations).
  let resolvedWorktree = null
  const cwd = typeof input.cwd === 'string' ? input.cwd : ''
  if (cwd.length > 0) {
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? cwd ?? process.cwd()
    const porcelain = runWorktreeList(projectDir)
    if (porcelain !== null) {
      resolvedWorktree = resolveWorktree(cwd, porcelain)
    }
  }

  const additionalContext = buildReminder(resolvedWorktree)
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext,
    },
  }
  process.stdout.write(JSON.stringify(payload))
}

// Run main only when invoked as a script, not when imported by the test.
// import.meta.url comparison against process.argv[1] is the standard ESM
// pattern. Inside `node --test`, process.argv[1] points at the test file
// loader, never at this module, so main() is skipped during tests.
const invokedDirectly = (() => {
  if (typeof process.argv[1] !== 'string') {
    return false
  }
  try {
    return pathToFileURL(resolvePath(process.argv[1])).href === import.meta.url
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  main()
}
