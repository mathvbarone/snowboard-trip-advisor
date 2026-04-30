import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import {
  checkAgentDisciplineSync,
  runCheckAgentDisciplineSync,
} from './check-agent-discipline-sync.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(here, '..')

const writeRepoFile = async (
  repoRoot: string,
  relativePath: string,
  content: string,
): Promise<void> => {
  const filePath = path.join(repoRoot, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
}

const removeRepoFile = async (repoRoot: string, relativePath: string): Promise<void> => {
  await rm(path.join(repoRoot, relativePath), { force: true })
}

const createBaselineRepo = async (): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'sta-agent-discipline-vitest-'))

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

describe('checkAgentDisciplineSync', (): void => {
  it('returns no issues for a reconciled repo state', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await expect(checkAgentDisciplineSync({ repoRoot })).resolves.toEqual([])
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags stale CLAUDE.md references in active docs', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(
        repoRoot,
        'README.md',
        'Details and agent rules are in [CLAUDE.md](CLAUDE.md).\n- Agent instructions: [CLAUDE.md](CLAUDE.md)\n',
      )

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(issues.some((issue) => issue.includes('README.md still points to CLAUDE.md'))).toBe(
        true,
      )
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags stale qa descriptions in active docs', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(
        repoRoot,
        'README.md',
        'Details and agent rules are in [AGENTS.md](AGENTS.md).\n- Agent instructions: [AGENTS.md](AGENTS.md)\n`npm run qa  # npm run lint → npm run typecheck → npm run coverage`\n',
      )

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(
        issues.some((issue) => issue.includes('README.md does not describe the full `npm run qa` gate')),
      ).toBe(true)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags stale CLAUDE.md references in the PR template', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(
        repoRoot,
        '.github/pull_request_template.md',
        '- [ ] Applicable Post-Pivot Rules ([CLAUDE.md](CLAUDE.md)) followed for this PR\'s paths\n',
      )

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(
        issues.some((issue) =>
          issue.includes('.github/pull_request_template.md still points to CLAUDE.md'),
        ),
      ).toBe(true)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags claimed Codex settings when no .Codex/settings.json exists', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(
        repoRoot,
        'AGENTS.md',
        '# AGENTS.md\n\nCanonical agent instructions live here.\nCodex hooks live in `.Codex/settings.json`.\n## Admin App Rules\n## Integration Adapter Rules\n## Visual-Diff Workflow\n## Migration / Hotfix Branch Rules\n',
      )

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(
        issues.some(
          (issue) =>
            issue.includes('AGENTS.md claims `.Codex/settings.json`') &&
            issue.includes('file is missing'),
        ),
      ).toBe(true)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags missing CODEOWNERS protection for tracked git hooks', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(
        repoRoot,
        '.github/CODEOWNERS',
        '/AGENTS.md @mathvbarone\n/CLAUDE.md @mathvbarone\n/.claude/settings.json @mathvbarone\n',
      )

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(
        issues.some((issue) => issue.includes('CODEOWNERS is missing /scripts/prepare-commit-msg')),
      ).toBe(true)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags missing AGENTS rule families', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(
        repoRoot,
        'AGENTS.md',
        '# AGENTS.md\n\nCanonical agent instructions live here.\nRuntime hook registration currently lives in `.claude/settings.json`.\n',
      )

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(
        issues.some((issue) => issue.includes('AGENTS.md is missing the admin-app rule section')),
      ).toBe(true)
      expect(
        issues.some(
          (issue) =>
            issue.includes('AGENTS.md is missing the migration and hotfix branch rules section'),
        ),
      ).toBe(true)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags a CLAUDE shim that does not identify AGENTS.md as authoritative', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(repoRoot, 'CLAUDE.md', '# CLAUDE.md\n\nLegacy instructions only.\n')

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(
        issues.some((issue) =>
          issue.includes('CLAUDE.md does not identify AGENTS.md as the authoritative rules file'),
        ),
      ).toBe(true)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('flags session-start hook summaries that overstate CODEOWNERS enforcement', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await writeRepoFile(
        repoRoot,
        'scripts/hooks/session-start-context.sh',
        'CODEOWNERS — load-bearing paths require maintainer review.\n',
      )

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(
        issues.some((issue) =>
          issue.includes(
            'scripts/hooks/session-start-context.sh does not describe the advisory Phase 1 CODEOWNERS policy',
          ),
        ),
      ).toBe(true)
      expect(
        issues.some((issue) =>
          issue.includes('scripts/hooks/session-start-context.sh does not point the runtime summary at AGENTS.md'),
        ),
      ).toBe(true)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('handles missing active-doc files and reports missing CODEOWNERS coverage', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await removeRepoFile(repoRoot, 'README.md')
      await removeRepoFile(repoRoot, '.github/pull_request_template.md')
      await removeRepoFile(repoRoot, 'CLAUDE.md')
      await removeRepoFile(repoRoot, '.github/CODEOWNERS')

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(issues).toEqual([
        'CODEOWNERS is missing /AGENTS.md',
        'CODEOWNERS is missing /.claude/settings.json',
        'CODEOWNERS is missing /scripts/prepare-commit-msg',
      ])
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('skips CODEOWNERS entry checks for tracked files that are not present', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    try {
      await removeRepoFile(repoRoot, 'AGENTS.md')
      await removeRepoFile(repoRoot, '.claude/settings.json')
      await removeRepoFile(repoRoot, 'scripts/prepare-commit-msg')

      const issues = await checkAgentDisciplineSync({ repoRoot })
      expect(issues.some((issue) => issue.includes('AGENTS.md is missing the admin-app rule section'))).toBe(true)
      expect(issues.some((issue) => issue.includes('CODEOWNERS is missing /AGENTS.md'))).toBe(
        false,
      )
      expect(
        issues.some((issue) => issue.includes('CODEOWNERS is missing /.claude/settings.json')),
      ).toBe(false)
      expect(
        issues.some((issue) => issue.includes('CODEOWNERS is missing /scripts/prepare-commit-msg')),
      ).toBe(false)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('writes failures to stderr and exits non-zero through the runner', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    const stderrChunks: string[] = []
    const exitCodes: number[] = []
    try {
      await writeRepoFile(
        repoRoot,
        'README.md',
        'Details and agent rules are in [CLAUDE.md](CLAUDE.md).\n- Agent instructions: [CLAUDE.md](CLAUDE.md)\n',
      )

      const issues = await runCheckAgentDisciplineSync({
        repoRoot,
        stderr: {
          write(chunk: string): number {
            stderrChunks.push(chunk)
            return chunk.length
          },
        },
        exit(code: number): void {
          exitCodes.push(code)
        },
      })

      expect(issues).toContain('README.md still points to CLAUDE.md instead of AGENTS.md')
      expect(exitCodes).toEqual([1])
      expect(stderrChunks.join('')).toContain('agent-discipline-sync: README.md still points to CLAUDE.md instead of AGENTS.md')
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('uses the default process exit path when the runner finds issues', async (): Promise<void> => {
    const repoRoot = await createBaselineRepo()
    const exitSignal = new Error('process.exit')
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null): never => {
        throw code === 1 ? exitSignal : new Error(`unexpected-exit:${String(code)}`)
      })
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      await writeRepoFile(
        repoRoot,
        'README.md',
        'Details and agent rules are in [CLAUDE.md](CLAUDE.md).\n- Agent instructions: [CLAUDE.md](CLAUDE.md)\n',
      )

      await expect(runCheckAgentDisciplineSync({ repoRoot })).rejects.toBe(exitSignal)
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(stderrSpy).toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
      stderrSpy.mockRestore()
      await rm(repoRoot, { recursive: true, force: true })
    }
  })

  it('runs the CLI entrypoint when invoked directly', async (): Promise<void> => {
    const originalArgv1 = process.argv[1]
    const scriptPath = path.join(workspaceRoot, 'scripts', 'check-agent-discipline-sync.mjs')
    const importSuffix = String(Date.now())
    try {
      process.argv[1] = scriptPath
      await import(`${pathToFileURL(scriptPath).href}?direct-invoke=${importSuffix}`)
    } finally {
      if (originalArgv1 === undefined) {
        process.argv.splice(1, 1)
      } else {
        process.argv[1] = originalArgv1
      }
    }
  })
})
