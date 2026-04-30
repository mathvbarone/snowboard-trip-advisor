#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { checkAgentDisciplineSync } from './check-agent-discipline-sync.mjs'

const writeRepoFile = async (repoRoot, relativePath, content) => {
  const filePath = path.join(repoRoot, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
}

const createBaselineRepo = async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'sta-agent-discipline-'))

  await writeRepoFile(
    repoRoot,
    'AGENTS.md',
    '# AGENTS.md\n\nCanonical agent instructions live here.\nRuntime hook registration currently lives in `.claude/settings.json`.\n## Admin App Rules\n## Integration Adapter Rules\n## Visual-Diff Workflow\n## Migration / Hotfix Branch Rules\n',
  )
  await writeRepoFile(
    repoRoot,
    'CLAUDE.md',
    '# CLAUDE.md\n\nCompatibility shim. `AGENTS.md` is authoritative.\n',
  )
  await writeRepoFile(
    repoRoot,
    'README.md',
    'Details and agent rules are in [AGENTS.md](AGENTS.md).\n- Agent instructions: [AGENTS.md](AGENTS.md)\n`npm run qa  # lint → typecheck → coverage → tokens:check → test:hooks → test:agent-discipline-sync → check:agent-discipline-sync → test:integration`\n',
  )
  await writeRepoFile(
    repoRoot,
    '.github/pull_request_template.md',
    '- [ ] `README.md` drift assessed per AGENTS.md Documentation Discipline\n- [ ] Applicable Post-Pivot Rules (AGENTS.md) followed for this PR\'s paths\n- [ ] `npm run qa` passes locally (lint → typecheck → coverage → tokens:check → test:hooks → test:agent-discipline-sync → check:agent-discipline-sync → test:integration)\n- [ ] If this PR touches a Subagent Review Discipline trigger path (AGENTS.md), a subagent review has been run and findings addressed before requesting maintainer review\n',
  )
  await writeRepoFile(
    repoRoot,
    '.github/CODEOWNERS',
    '/AGENTS.md @mathvbarone\n/CLAUDE.md @mathvbarone\n/.claude/settings.json @mathvbarone\n/scripts/prepare-commit-msg @mathvbarone\n',
  )
  await writeRepoFile(repoRoot, '.claude/settings.json', '{}\n')
  await writeRepoFile(repoRoot, 'scripts/prepare-commit-msg', '#!/bin/sh\n')
  await writeRepoFile(
    repoRoot,
    'scripts/hooks/session-start-context.sh',
    'Read AGENTS.md\nCODEOWNERS — advisory in Phase 1\n',
  )

  return repoRoot
}

test('checkAgentDisciplineSync returns no issues for a reconciled repo state', async () => {
  const repoRoot = await createBaselineRepo()
  try {
    const issues = await checkAgentDisciplineSync({ repoRoot })
    assert.deepEqual(issues, [])
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('checkAgentDisciplineSync flags stale CLAUDE.md references in active docs', async () => {
  const repoRoot = await createBaselineRepo()
  try {
    await writeRepoFile(
      repoRoot,
      'README.md',
      'Details and agent rules are in [CLAUDE.md](CLAUDE.md).\n- Agent instructions: [CLAUDE.md](CLAUDE.md)\n',
    )

    const issues = await checkAgentDisciplineSync({ repoRoot })

    assert.equal(
      issues.some((issue) => issue.includes('README.md still points to CLAUDE.md')),
      true,
    )
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('checkAgentDisciplineSync flags stale qa descriptions in active docs', async () => {
  const repoRoot = await createBaselineRepo()
  try {
    await writeRepoFile(
      repoRoot,
      'README.md',
      'Details and agent rules are in [AGENTS.md](AGENTS.md).\n- Agent instructions: [AGENTS.md](AGENTS.md)\n`npm run qa  # npm run lint → npm run typecheck → npm run coverage`\n',
    )

    const issues = await checkAgentDisciplineSync({ repoRoot })

    assert.equal(
      issues.some((issue) => issue.includes('README.md does not describe the full `npm run qa` gate')),
      true,
    )
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('checkAgentDisciplineSync flags claimed Codex settings when no .Codex/settings.json exists', async () => {
  const repoRoot = await createBaselineRepo()
  try {
    await writeRepoFile(
      repoRoot,
      'AGENTS.md',
      '# AGENTS.md\n\nCanonical agent instructions live here.\nCodex hooks live in `.Codex/settings.json`.\n',
    )

    const issues = await checkAgentDisciplineSync({ repoRoot })

    assert.equal(
      issues.some(
        (issue) =>
          issue.includes('AGENTS.md claims `.Codex/settings.json`') &&
          issue.includes('file is missing'),
      ),
      true,
    )
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('checkAgentDisciplineSync flags missing CODEOWNERS protection for tracked git hooks', async () => {
  const repoRoot = await createBaselineRepo()
  try {
    await writeRepoFile(
      repoRoot,
      '.github/CODEOWNERS',
      '/AGENTS.md @mathvbarone\n/CLAUDE.md @mathvbarone\n/.claude/settings.json @mathvbarone\n',
    )

    const issues = await checkAgentDisciplineSync({ repoRoot })

    assert.equal(
      issues.some((issue) => issue.includes('CODEOWNERS is missing /scripts/prepare-commit-msg')),
      true,
    )
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('checkAgentDisciplineSync flags missing AGENTS rule families', async () => {
  const repoRoot = await createBaselineRepo()
  try {
    await writeRepoFile(
      repoRoot,
      'AGENTS.md',
      '# AGENTS.md\n\nCanonical agent instructions live here.\nRuntime hook registration currently lives in `.claude/settings.json`.\n',
    )

    const issues = await checkAgentDisciplineSync({ repoRoot })

    assert.equal(
      issues.some((issue) => issue.includes('AGENTS.md is missing the admin-app rule section')),
      true,
    )
    assert.equal(
      issues.some(
        (issue) => issue.includes('AGENTS.md is missing the migration and hotfix branch rules section'),
      ),
      true,
    )
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('checkAgentDisciplineSync flags session-start hook summaries that overstate CODEOWNERS enforcement', async () => {
  const repoRoot = await createBaselineRepo()
  try {
    await writeRepoFile(
      repoRoot,
      'scripts/hooks/session-start-context.sh',
      'Read AGENTS.md\nCODEOWNERS — load-bearing paths require maintainer review.\n',
    )

    const issues = await checkAgentDisciplineSync({ repoRoot })

    assert.equal(
      issues.some(
        (issue) =>
          issue.includes('scripts/hooks/session-start-context.sh does not describe the advisory Phase 1 CODEOWNERS policy'),
      ),
      true,
    )
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})
