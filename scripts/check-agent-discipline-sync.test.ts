import { describe, expect, it } from 'vitest'

import {
  REQUIRED_AGENTS_SECTIONS,
  checkAgentsAcknowledgesClaudeShim,
  checkAgentsAssertsCanonical,
  checkAgentsExists,
  checkAgentsSectionCoverage,
  checkBotsHaveAdrs,
  checkClaudeDefersToAgents,
  runAllChecks,
  type DriftCheckInputs,
} from './check-agent-discipline-sync'

// Section bodies are intentionally minimal — the checker only inspects H2
// headings, not section content. Building the fixture from
// REQUIRED_AGENTS_SECTIONS keeps the happy-path test in sync with whatever
// the source-of-truth list grows or shrinks to.
const FULL_AGENTS_FIXTURE = [
  '# AGENTS.md',
  '',
  'AGENTS.md is the canonical rule book for all agents on this repository.',
  'CLAUDE.md is a Claude-specific compatibility shim that points back here.',
  '',
  ...REQUIRED_AGENTS_SECTIONS.flatMap((section): readonly string[] => [
    `## ${section}`,
    '',
    'placeholder body',
    '',
  ]),
].join('\n')

const HAPPY_INPUTS: DriftCheckInputs = {
  agents: FULL_AGENTS_FIXTURE,
  claude: 'AGENTS.md is the authoritative checked-in rule book.',
  dependabot:
    'updates:\n  - package-ecosystem: npm\n    open-pull-requests-limit: 5\n    # author: dependabot[bot]@users.noreply.github.com\n',
  adrBasenames: ['0009-dco-exemption-for-dependabot.md'],
}

describe('checkAgentsExists', (): void => {
  it('emits no issue when AGENTS.md is present', (): void => {
    expect(checkAgentsExists(HAPPY_INPUTS)).toEqual([])
  })

  it('flags a missing AGENTS.md', (): void => {
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, agents: null }
    const issues = checkAgentsExists(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('agents-exists')
    expect(issues[0]?.message).toContain('AGENTS.md is missing')
  })
})

describe('checkAgentsAssertsCanonical', (): void => {
  it('passes when AGENTS.md says it is the canonical rule book', (): void => {
    expect(checkAgentsAssertsCanonical(HAPPY_INPUTS)).toEqual([])
  })

  it('passes when AGENTS.md says it is authoritative', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      agents: 'AGENTS.md is the authoritative agent rule book.',
    }
    expect(checkAgentsAssertsCanonical(inputs)).toEqual([])
  })

  it('passes when canonical appears before AGENTS.md (reverse order)', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      agents:
        'The canonical rule book is the file you are reading; this is AGENTS.md.',
    }
    expect(checkAgentsAssertsCanonical(inputs)).toEqual([])
  })

  it('skips silently when AGENTS.md is missing (the agents-exists check covers that)', (): void => {
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, agents: null }
    expect(checkAgentsAssertsCanonical(inputs)).toEqual([])
  })

  it('flags AGENTS.md without a canonical/authoritative claim', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      agents: 'AGENTS.md says hello and contains some other unrelated text.',
    }
    const issues = checkAgentsAssertsCanonical(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('agents-asserts-canonical')
  })
})

describe('checkClaudeDefersToAgents', (): void => {
  it('passes when CLAUDE.md says AGENTS.md is authoritative', (): void => {
    expect(checkClaudeDefersToAgents(HAPPY_INPUTS)).toEqual([])
  })

  it('passes when CLAUDE.md says the rule book lives in AGENTS.md', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      claude: 'The full rule book lives in AGENTS.md — read it first.',
    }
    expect(checkClaudeDefersToAgents(inputs)).toEqual([])
  })

  it('flags a missing CLAUDE.md', (): void => {
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, claude: null }
    const issues = checkClaudeDefersToAgents(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('claude-defers-to-agents')
    expect(issues[0]?.message).toContain('CLAUDE.md is missing')
  })

  it('flags a CLAUDE.md that does not defer to AGENTS.md', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      claude: 'CLAUDE.md is the only rule file you need.',
    }
    const issues = checkClaudeDefersToAgents(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('claude-defers-to-agents')
  })

  it('flags defer-then-override: claims canonicality but says CLAUDE.md overrides AGENTS.md', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      claude:
        'AGENTS.md is the canonical rule book. However, CLAUDE.md overrides AGENTS.md when they conflict.',
    }
    const issues = checkClaudeDefersToAgents(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('claude-defers-to-agents')
    expect(issues[0]?.message).toContain('override')
  })

  it('flags defer-then-override: claims canonicality but says rules below override', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      claude:
        'AGENTS.md is the authoritative rule book. The rules below take precedence over AGENTS.md.',
    }
    const issues = checkClaudeDefersToAgents(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('claude-defers-to-agents')
  })

  it('flags defer-then-override: rules in this file supersede', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      claude:
        'AGENTS.md is canonical. Rules in this file supersede whatever AGENTS.md says.',
    }
    const issues = checkClaudeDefersToAgents(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('claude-defers-to-agents')
  })

  it('does not false-flag legitimate prose that contains "but" or "however"', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      claude:
        'AGENTS.md is the authoritative rule book. However, this file lists Claude-specific runtime hooks. But you should read AGENTS.md first.',
    }
    expect(checkClaudeDefersToAgents(inputs)).toEqual([])
  })
})

describe('checkAgentsAcknowledgesClaudeShim', (): void => {
  it('passes when AGENTS.md describes CLAUDE.md as a shim', (): void => {
    expect(checkAgentsAcknowledgesClaudeShim(HAPPY_INPUTS)).toEqual([])
  })

  it('passes when AGENTS.md describes CLAUDE.md as compatibility', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      agents: 'CLAUDE.md is the Claude-runtime compatibility entrypoint.',
    }
    expect(checkAgentsAcknowledgesClaudeShim(inputs)).toEqual([])
  })

  it('skips silently when AGENTS.md is missing (agents-exists covers it)', (): void => {
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, agents: null }
    expect(checkAgentsAcknowledgesClaudeShim(inputs)).toEqual([])
  })

  it('flags AGENTS.md that does not name CLAUDE.md as a shim', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      agents: '## Authority Model\n\nAGENTS.md is the canonical rule book and stands alone.',
    }
    const issues = checkAgentsAcknowledgesClaudeShim(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('agents-acknowledges-claude-shim')
  })
})

describe('checkAgentsSectionCoverage', (): void => {
  it('passes on the full fixture (every required H2 present)', (): void => {
    expect(checkAgentsSectionCoverage(HAPPY_INPUTS)).toEqual([])
  })

  it('skips silently when AGENTS.md is missing (agents-exists covers it)', (): void => {
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, agents: null }
    expect(checkAgentsSectionCoverage(inputs)).toEqual([])
  })

  it('flags removal of a single load-bearing section (the closed PR #54 failure mode)', (): void => {
    const trimmed = FULL_AGENTS_FIXTURE.replace(
      /^## Coverage Rules$/m,
      '## Bogus Replacement Heading',
    )
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, agents: trimmed }
    const issues = checkAgentsSectionCoverage(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('agents-section-coverage')
    expect(issues[0]?.message).toContain('"## Coverage Rules"')
  })

  it('flags multiple missing sections in a single issue', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      agents: '# AGENTS.md\n\n## Setup\n\nonly setup remains.',
    }
    const issues = checkAgentsSectionCoverage(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.message).toContain('"## Quality Gate"')
    expect(issues[0]?.message).toContain('"## Code Rules"')
  })

  it('matches headings with parenthetical qualifiers (e.g. "## Admin App Rules (lands with Epic 4)")', (): void => {
    // Replace the bare "## Admin App Rules" with the real-world heading shape.
    const real = FULL_AGENTS_FIXTURE.replace(
      /^## Admin App Rules$/m,
      '## Admin App Rules (lands with Epic 4)',
    )
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, agents: real }
    expect(checkAgentsSectionCoverage(inputs)).toEqual([])
  })

  it('does not match a section that has the required name as a strict prefix of a longer heading', (): void => {
    // Ensures "## Code Rules" does not satisfy "## Code Rules" check via
    // `## Code Rules Of Engagement` (the boundary regex requires whitespace
    // or end-of-line after the section name, not a word char).
    const tweaked = FULL_AGENTS_FIXTURE.replace(
      /^## Code Rules$/m,
      '## CodeRulesAreFun',
    )
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, agents: tweaked }
    const issues = checkAgentsSectionCoverage(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.message).toContain('"## Code Rules"')
  })
})

describe('checkBotsHaveAdrs', (): void => {
  it('passes when dependabot is referenced and ADR-0009 matches', (): void => {
    expect(checkBotsHaveAdrs(HAPPY_INPUTS)).toEqual([])
  })

  it('skips silently when dependabot.yml is absent', (): void => {
    const inputs: DriftCheckInputs = { ...HAPPY_INPUTS, dependabot: null }
    expect(checkBotsHaveAdrs(inputs)).toEqual([])
  })

  it('flags a dependabot.yml without a matching ADR', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      adrBasenames: ['0001-pivot-to-data-transparency.md'],
    }
    const issues = checkBotsHaveAdrs(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('bots-have-adrs')
    expect(issues[0]?.message).toContain('dependabot')
  })

  it('flags an unfamiliar bot identity that has no matching ADR', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      dependabot:
        '# A future bot might land here.\n# author: renovate[bot]@users.noreply.github.com\n',
      adrBasenames: ['0009-dco-exemption-for-dependabot.md'],
    }
    const issues = checkBotsHaveAdrs(inputs)
    expect(issues.some((i): boolean => i.message.includes('renovate'))).toBe(
      true,
    )
  })

  it('passes when an unfamiliar bot has its own ADR (and Dependabot ADR is also present, since the file presence still requires it)', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      dependabot:
        '# author: renovate[bot]@users.noreply.github.com',
      adrBasenames: [
        '0009-dco-exemption-for-dependabot.md',
        '0042-dco-exemption-for-renovate.md',
      ],
    }
    expect(checkBotsHaveAdrs(inputs)).toEqual([])
  })

  it('always requires a Dependabot ADR when dependabot.yml is present, even when other bot emails are mentioned', (): void => {
    // Regression test for the Codex P2 finding: previously, the canonical
    // Dependabot identity was only added to `seen` when no other bot email
    // was matched. A stray comment like `renovate[bot]...` would suppress
    // the Dependabot-ADR requirement entirely → false negative.
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      dependabot: '# author: renovate[bot]@users.noreply.github.com',
      adrBasenames: ['0042-dco-exemption-for-renovate.md'],
    }
    const issues = checkBotsHaveAdrs(inputs)
    expect(issues.some((i): boolean => i.message.includes('dependabot'))).toBe(
      true,
    )
  })

  it('rejects an ADR that documents a bot REMOVAL — the exemption is no longer in force', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      adrBasenames: ['0099-removed-dependabot-exemption.md'],
    }
    const issues = checkBotsHaveAdrs(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.check).toBe('bots-have-adrs')
  })

  it('rejects an ADR that documents a bot DEPRECATION', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      adrBasenames: ['0099-deprecated-dependabot-policy.md'],
    }
    const issues = checkBotsHaveAdrs(inputs)
    expect(issues.length).toBe(1)
  })

  it('rejects an ADR that names the bot but lacks a positive policy keyword', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      adrBasenames: ['0099-thoughts-about-dependabot.md'],
    }
    const issues = checkBotsHaveAdrs(inputs)
    expect(issues.length).toBe(1)
  })

  it('infers the canonical Dependabot identity when the file lacks any bot-email comment (typical dependabot.yml)', (): void => {
    // The canonical .github/dependabot.yml does NOT carry the bot author
    // email — it only registers the GitHub-Dependabot integration. The
    // file-presence-as-signal fallback covers that path.
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      dependabot: 'version: 2\nupdates:\n  - package-ecosystem: npm\n',
      adrBasenames: [],
    }
    const issues = checkBotsHaveAdrs(inputs)
    expect(issues.length).toBe(1)
    expect(issues[0]?.message).toContain('dependabot')
  })

  it('infers the canonical Dependabot identity from an essentially-empty file too', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      dependabot: 'updates: []\n',
      adrBasenames: ['0009-dco-exemption-for-dependabot.md'],
    }
    expect(checkBotsHaveAdrs(inputs)).toEqual([])
  })
})

describe('runAllChecks', (): void => {
  it('returns an empty array on the happy path', (): void => {
    expect(runAllChecks(HAPPY_INPUTS)).toEqual([])
  })

  it('aggregates issues from multiple failing checks', (): void => {
    const inputs: DriftCheckInputs = {
      agents: null,
      claude: null,
      dependabot: '# author: dependabot[bot]@users.noreply.github.com',
      adrBasenames: [],
    }
    const issues = runAllChecks(inputs)
    expect(issues.length).toBeGreaterThanOrEqual(3)
    const checkNames = new Set(issues.map((i): string => i.check))
    expect(checkNames.has('agents-exists')).toBe(true)
    expect(checkNames.has('claude-defers-to-agents')).toBe(true)
    expect(checkNames.has('bots-have-adrs')).toBe(true)
  })

  it('aggregates section-coverage drift alongside other failures', (): void => {
    const inputs: DriftCheckInputs = {
      ...HAPPY_INPUTS,
      agents:
        'AGENTS.md is canonical. CLAUDE.md is a shim. (No section headers.)',
    }
    const issues = runAllChecks(inputs)
    const checkNames = new Set(issues.map((i): string => i.check))
    expect(checkNames.has('agents-section-coverage')).toBe(true)
  })
})
