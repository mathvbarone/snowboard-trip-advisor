#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(here, '..')

const exists = async (filePath) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const readText = async (filePath) => {
  if (!(await exists(filePath))) {
    return null
  }
  return readFile(filePath, 'utf8')
}

const ensureCodeownersEntry = (issues, codeowners, entry) => {
  if (codeowners === null || !codeowners.includes(entry)) {
    issues.push(`CODEOWNERS is missing ${entry}`)
  }
}

const ensureContains = (issues, text, fileLabel, snippet, message) => {
  if (text === null || !text.includes(snippet)) {
    issues.push(`${fileLabel} ${message}`)
  }
}

export async function checkAgentDisciplineSync({ repoRoot = defaultRepoRoot } = {}) {
  const issues = []

  const agentsPath = path.join(repoRoot, 'AGENTS.md')
  const claudePath = path.join(repoRoot, 'CLAUDE.md')
  const readmePath = path.join(repoRoot, 'README.md')
  const prTemplatePath = path.join(repoRoot, '.github', 'pull_request_template.md')
  const codeownersPath = path.join(repoRoot, '.github', 'CODEOWNERS')
  const claudeSettingsPath = path.join(repoRoot, '.claude', 'settings.json')
  const codexSettingsPath = path.join(repoRoot, '.Codex', 'settings.json')
  const prepareCommitMsgPath = path.join(repoRoot, 'scripts', 'prepare-commit-msg')
  const sessionStartHookPath = path.join(repoRoot, 'scripts', 'hooks', 'session-start-context.sh')

  const [agents, claude, readme, prTemplate, codeowners, sessionStartHook] = await Promise.all([
    readText(agentsPath),
    readText(claudePath),
    readText(readmePath),
    readText(prTemplatePath),
    readText(codeownersPath),
    readText(sessionStartHookPath),
  ])

  if (readme !== null) {
    if (readme.includes('CLAUDE.md')) {
      issues.push('README.md still points to CLAUDE.md instead of AGENTS.md')
    }
    if (!readme.includes('AGENTS.md')) {
      issues.push('README.md does not point to AGENTS.md')
    }
    ensureContains(
      issues,
      readme,
      'README.md',
      'test:agent-discipline-sync → check:agent-discipline-sync',
      'does not describe the full `npm run qa` gate',
    )
  }

  if (prTemplate !== null) {
    if (prTemplate.includes('CLAUDE.md')) {
      issues.push('.github/pull_request_template.md still points to CLAUDE.md instead of AGENTS.md')
    }
    ensureContains(
      issues,
      prTemplate,
      '.github/pull_request_template.md',
      'test:agent-discipline-sync → check:agent-discipline-sync',
      'does not describe the full `npm run qa` gate',
    )
  }

  if (claude !== null && !claude.includes('AGENTS.md')) {
    issues.push('CLAUDE.md does not identify AGENTS.md as the authoritative rules file')
  }

  if (agents !== null && agents.includes('.Codex/settings.json') && !(await exists(codexSettingsPath))) {
    issues.push('AGENTS.md claims `.Codex/settings.json`, but that file is missing')
  }
  ensureContains(
    issues,
    agents,
    'AGENTS.md',
    '## Admin App Rules',
    'is missing the admin-app rule section',
  )
  ensureContains(
    issues,
    agents,
    'AGENTS.md',
    '## Integration Adapter Rules',
    'is missing the integration-adapter rule section',
  )
  ensureContains(
    issues,
    agents,
    'AGENTS.md',
    '## Visual-Diff Workflow',
    'is missing the visual-diff workflow section',
  )
  ensureContains(
    issues,
    agents,
    'AGENTS.md',
    '## Migration / Hotfix Branch Rules',
    'is missing the migration and hotfix branch rules section',
  )

  ensureContains(
    issues,
    sessionStartHook,
    'scripts/hooks/session-start-context.sh',
    'CODEOWNERS — advisory in Phase 1',
    'does not describe the advisory Phase 1 CODEOWNERS policy',
  )
  ensureContains(
    issues,
    sessionStartHook,
    'scripts/hooks/session-start-context.sh',
    'Read AGENTS.md',
    'does not point the runtime summary at AGENTS.md',
  )

  if (await exists(agentsPath)) {
    ensureCodeownersEntry(issues, codeowners, '/AGENTS.md')
  }
  if (await exists(claudePath)) {
    ensureCodeownersEntry(issues, codeowners, '/CLAUDE.md')
  }
  if (await exists(claudeSettingsPath)) {
    ensureCodeownersEntry(issues, codeowners, '/.claude/settings.json')
  }
  if (await exists(prepareCommitMsgPath)) {
    ensureCodeownersEntry(issues, codeowners, '/scripts/prepare-commit-msg')
  }

  return issues
}

export async function runCheckAgentDisciplineSync({
  repoRoot = defaultRepoRoot,
  stderr = process.stderr,
  exit = (code) => process.exit(code),
} = {}) {
  const issues = await checkAgentDisciplineSync({ repoRoot })
  if (issues.length > 0) {
    for (const issue of issues) {
      stderr.write(`agent-discipline-sync: ${issue}\n`)
    }
    exit(1)
  }

  return issues
}

const invokedDirectly = (() => {
  const scriptPath = process.argv[1]
  return typeof scriptPath === 'string' && path.resolve(scriptPath) === fileURLToPath(import.meta.url)
})()

if (invokedDirectly) {
  await runCheckAgentDisciplineSync()
}
