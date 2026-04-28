// scripts/hooks/post-pr-create-reminder.test.mjs
//
// Unit tests for the worktree-aware post-pr-create-reminder hook. Run with
// `node --test scripts/hooks/post-pr-create-reminder.test.mjs` (no external
// deps; uses the built-in `node:test` runner).
//
// Covers:
//   - shouldFire(): two-layer gate (command-position + success-URL).
//   - resolveWorktree(): cwd → worktree-root resolution against an injected
//     porcelain string, with darwin case folding and detached / locked /
//     prunable filtering.
//   - buildReminder(): with-path vs without-path body shape.
//
// Integration tests (real stdin/stdout, real `git worktree list --porcelain`,
// and the .sh wrapper) live in scripts/hooks/test-hooks.sh.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

import {
  shouldFire,
  resolveWorktree,
  buildReminder,
} from './post-pr-create-reminder.mjs'

// ---------- shouldFire ----------

test('shouldFire: gh pr create at start with PR URL → fires', () => {
  assert.equal(
    shouldFire({
      command: 'gh pr create --title foo --body bar',
      stdout: 'https://github.com/owner/repo/pull/42\n',
    }),
    true,
  )
})

test('shouldFire: substring inside echo does NOT fire (P2 #1)', () => {
  assert.equal(
    shouldFire({
      command: 'echo "gh pr create"',
      stdout: 'gh pr create\n',
    }),
    false,
  )
})

test('shouldFire: gh pr create after && fires', () => {
  assert.equal(
    shouldFire({
      command: 'cd repo && gh pr create --base main',
      stdout: 'https://github.com/o/r/pull/2\n',
    }),
    true,
  )
})

test('shouldFire: gh pr create after ; fires', () => {
  assert.equal(
    shouldFire({
      command: 'date; gh pr create',
      stdout: 'https://github.com/o/r/pull/3',
    }),
    true,
  )
})

test('shouldFire: gh pr create with no PR URL in stdout does NOT fire', () => {
  assert.equal(
    shouldFire({
      command: 'gh pr create --title foo',
      stdout: 'Error: GraphQL error\n',
    }),
    false,
  )
})

test('shouldFire: gh pr created-at (different subcommand) does NOT fire', () => {
  assert.equal(
    shouldFire({
      command: 'gh pr created-at',
      stdout: '',
    }),
    false,
  )
})

test('shouldFire: missing fields default to empty strings', () => {
  assert.equal(shouldFire({}), false)
  assert.equal(shouldFire({ command: 'gh pr create' }), false)
  assert.equal(
    shouldFire({ stdout: 'https://github.com/o/r/pull/1' }),
    false,
  )
})

// ---------- resolveWorktree ----------

const FIXTURE_PORCELAIN = `worktree /Users/x/repo
HEAD aaaa1111
branch refs/heads/main

worktree /Users/x/repo/.worktrees/feat
HEAD bbbb2222
branch refs/heads/feat-branch

worktree /Users/x/repo/.worktrees/detached-wt
HEAD cccc3333
detached

worktree /Users/x/repo/.worktrees/locked-wt
HEAD dddd4444
branch refs/heads/locked-branch
locked

worktree /Users/x/repo/.worktrees/prunable-wt
HEAD eeee5555
branch refs/heads/prunable-branch
prunable
`

test('resolveWorktree: cwd matches worktree root exactly → returns that root', () => {
  const result = resolveWorktree(
    '/Users/x/repo/.worktrees/feat',
    FIXTURE_PORCELAIN,
    { platform: 'linux' },
  )
  assert.equal(result, '/Users/x/repo/.worktrees/feat')
})

test('resolveWorktree: cwd inside worktree subdirectory → returns worktree root', () => {
  // /Users/x/repo/.worktrees/feat/apps/public/src is inside the feat
  // worktree. The longest-prefix match is feat (not the parent /Users/x/repo
  // root, which is also a registered worktree).
  const result = resolveWorktree(
    '/Users/x/repo/.worktrees/feat/apps/public/src',
    FIXTURE_PORCELAIN,
    { platform: 'linux' },
  )
  assert.equal(result, '/Users/x/repo/.worktrees/feat')
})

test('resolveWorktree: cwd outside any worktree → null', () => {
  assert.equal(
    resolveWorktree('/tmp/elsewhere', FIXTURE_PORCELAIN, {
      platform: 'linux',
    }),
    null,
  )
})

test('resolveWorktree: cwd matches a detached worktree → null (skipped)', () => {
  assert.equal(
    resolveWorktree(
      '/Users/x/repo/.worktrees/detached-wt',
      FIXTURE_PORCELAIN,
      { platform: 'linux' },
    ),
    null,
  )
})

test('resolveWorktree: cwd matches a locked worktree → null (skipped)', () => {
  assert.equal(
    resolveWorktree(
      '/Users/x/repo/.worktrees/locked-wt',
      FIXTURE_PORCELAIN,
      { platform: 'linux' },
    ),
    null,
  )
})

test('resolveWorktree: cwd matches a prunable worktree → null (skipped)', () => {
  assert.equal(
    resolveWorktree(
      '/Users/x/repo/.worktrees/prunable-wt',
      FIXTURE_PORCELAIN,
      { platform: 'linux' },
    ),
    null,
  )
})

test('resolveWorktree: darwin case-insensitive match', () => {
  // cwd uses /users/... (lowercase u). worktree fixture uses /Users/...
  // (uppercase U). Should match on darwin.
  const result = resolveWorktree(
    '/users/x/repo/.worktrees/feat',
    FIXTURE_PORCELAIN,
    { platform: 'darwin' },
  )
  assert.equal(result, '/Users/x/repo/.worktrees/feat')
})

test('resolveWorktree: linux case-sensitive, no match on case-mismatch', () => {
  assert.equal(
    resolveWorktree(
      '/users/x/repo/.worktrees/feat',
      FIXTURE_PORCELAIN,
      { platform: 'linux' },
    ),
    null,
  )
})

test('resolveWorktree: empty porcelain → null', () => {
  assert.equal(
    resolveWorktree('/anything', '', { platform: 'linux' }),
    null,
  )
})

test('resolveWorktree: missing cwd → null', () => {
  assert.equal(
    resolveWorktree('', FIXTURE_PORCELAIN, { platform: 'linux' }),
    null,
  )
})

test('resolveWorktree: longest-match-wins when cwd nested inside multiple registered worktrees', () => {
  // Both /Users/x/repo and /Users/x/repo/.worktrees/feat are registered.
  // Cwd inside the inner one must resolve to the inner one.
  const result = resolveWorktree(
    '/Users/x/repo/.worktrees/feat/apps/public',
    FIXTURE_PORCELAIN,
    { platform: 'linux' },
  )
  assert.equal(result, '/Users/x/repo/.worktrees/feat')
})

test('resolveWorktree: trailing slash on cwd treated as path equality', () => {
  // /Users/x/repo/.worktrees/feat/ (trailing slash) is equivalent to
  // /Users/x/repo/.worktrees/feat for matching purposes.
  const result = resolveWorktree(
    '/Users/x/repo/.worktrees/feat/',
    FIXTURE_PORCELAIN,
    { platform: 'linux' },
  )
  assert.equal(result, '/Users/x/repo/.worktrees/feat')
})

test('resolveWorktree: porcelain block with no `worktree` line is skipped (defensive)', () => {
  // Defensive shape: a block that only carries HEAD/branch lines (no
  // `worktree <path>` header). Real git would never emit this, but the
  // parser must skip it without crashing.
  const porcelain = `HEAD aaaa
branch refs/heads/orphan

worktree /Users/x/repo
HEAD bbbb
branch refs/heads/main
`
  assert.equal(
    resolveWorktree('/Users/x/repo', porcelain, { platform: 'linux' }),
    '/Users/x/repo',
  )
})

test('resolveWorktree: porcelain without trailing blank line still parses last block', () => {
  // No trailing newline-blank — exercises the post-loop flush in
  // parsePorcelainBlocks.
  const porcelain = 'worktree /Users/x/repo\nHEAD a\nbranch refs/heads/main'
  assert.equal(
    resolveWorktree('/Users/x/repo', porcelain, { platform: 'linux' }),
    '/Users/x/repo',
  )
})

test('resolveWorktree: nonexistent paths fall back to resolve() (no realpath)', () => {
  // Both cwd and worktree paths point at directories that don't exist on
  // the test host. realpathSync throws ENOENT; the resolver must catch
  // and compare via path.resolve. The match still succeeds because both
  // sides resolve to the same absolute string.
  const porcelain = 'worktree /this/does/not/exist/repo\nHEAD a\nbranch refs/heads/x\n'
  const result = resolveWorktree(
    '/this/does/not/exist/repo/sub',
    porcelain,
    { platform: 'linux' },
  )
  assert.equal(result, '/this/does/not/exist/repo')
})

test('resolveWorktree: symlink resolution via realpath (darwin and linux)', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'pp-create-symlink-test-'))
  try {
    const realPath = join(tmpRoot, 'real-worktree')
    mkdirSync(realPath)
    const linkPath = join(tmpRoot, 'link-worktree')
    symlinkSync(realPath, linkPath)

    const porcelain = `worktree ${realPath}
HEAD abcd
branch refs/heads/sym-branch
`
    // cwd is the symlink path; worktree list reports the real path.
    // realpath should resolve them to the same canonical path.
    const result = resolveWorktree(linkPath, porcelain, {
      platform: process.platform,
    })
    assert.equal(result, realPath)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

// ---------- buildReminder ----------

test('buildReminder: null path → v1 reminder, no worktree prefix', () => {
  const r = buildReminder(null)
  assert.match(r, /PR opened via `gh pr create`/)
  assert.doesNotMatch(r, /worktree at/)
  assert.doesNotMatch(r, /prefix bash invocations with cd/)
})

test('buildReminder: with path → prepends worktree-aware sentence', () => {
  const r = buildReminder('/Users/x/repo/.worktrees/feat')
  assert.match(r, /worktree at \/Users\/x\/repo\/\.worktrees\/feat/)
  assert.match(r, /cd \/Users\/x\/repo\/\.worktrees\/feat &&/)
  // The v1 reminder text must still be present after the prefix.
  assert.match(r, /PR opened via `gh pr create`/)
  assert.match(r, /post `@codex review`/)
})

test('buildReminder: prefix appears BEFORE the v1 body', () => {
  const r = buildReminder('/wt')
  const prefixIdx = r.indexOf('worktree at /wt')
  const v1Idx = r.indexOf('PR opened via')
  assert.ok(
    prefixIdx >= 0 && v1Idx >= 0 && prefixIdx < v1Idx,
    `prefix (${prefixIdx}) must precede v1 body (${v1Idx}); reminder=${r}`,
  )
})
