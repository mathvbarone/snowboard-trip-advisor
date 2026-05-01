// scripts/check-agent-discipline-sync.ts — pure drift checker for the
// agent-discipline rule base. Catches the failure modes the closed PR #54
// review surfaced: silent authority drift between AGENTS.md and CLAUDE.md,
// silent removal of load-bearing AGENTS.md sections, orphaned bot
// configurations without matching ADRs, and the rot pattern where a future
// PR shrinks AGENTS.md while leaving CLAUDE.md as a stale pseudo-canonical
// doc.
//
// Side-effect entry point lives in `./check-agent-discipline-sync.cli.ts`.
// Wired into `npm run qa` as the second step (after `lint`) so cheap drift
// detection fails fast before the slow test suite runs.

export interface DriftIssue {
  readonly check: string
  readonly message: string
}

export interface DriftCheckInputs {
  readonly agents: string | null
  readonly claude: string | null
  readonly dependabot: string | null
  readonly adrBasenames: readonly string[]
}

export type DriftCheck = (inputs: DriftCheckInputs) => readonly DriftIssue[]

const AGENTS_CANONICAL_PATTERNS: readonly RegExp[] = [
  /\bAGENTS\.md\b[^.]*\bcanonical\b/i,
  /\bcanonical\b[^.]*\bAGENTS\.md\b/i,
  /\bAGENTS\.md\b[^.]*\bauthoritative\b/i,
]

const CLAUDE_DEFERS_PATTERNS: readonly RegExp[] = [
  /\bAGENTS\.md\b[^.]*\bauthoritative\b/i,
  /\bAGENTS\.md\b[^.]*\bcanonical\b/i,
  /full rule book lives in.*AGENTS\.md/i,
]

// Defer-then-override defence: even when CLAUDE.md asserts AGENTS.md is
// canonical, a later sentence in the same file could undo it ("AGENTS.md is
// canonical BUT the rules below override it"). Catch any explicit assertion
// that CLAUDE.md / "this file" / "the rules below" overrides or supersedes
// AGENTS.md, OR that AGENTS.md is overridden by something. Restricted to
// override-specific verbs to avoid false positives on common English words.
const CLAUDE_OVERRIDE_PATTERNS: readonly RegExp[] = [
  /\b(?:CLAUDE\.md|this file|rules\s+(?:in this file|below|here))\b[^.]{0,200}\b(?:overrides?|supersedes?|takes? precedence)\b/i,
  /\b(?:overrides?|supersedes?|takes? precedence over)\b[^.]{0,200}\bAGENTS\.md\b/i,
]

const AGENTS_NAMES_CLAUDE_SHIM_PATTERNS: readonly RegExp[] = [
  /\bCLAUDE\.md\b[^.]*\bshim\b/i,
  /\bCLAUDE\.md\b[^.]*\bcompatibility\b/i,
]

const BOT_AUTHOR_REGEX =
  /\b([a-z0-9_.-]+\[bot\]@users\.noreply\.github\.com)\b/gi

// Section-coverage check: the closed PR #54 review's primary concern was
// silent removal of load-bearing AGENTS.md sections. The 4 authority-claim
// checks above don't catch that — a PR that flips "## Coverage Rules" out
// of AGENTS.md while leaving the canonical-claim phrasing intact would pass
// every other check. Listing each required H2 here makes section removal
// auditable: a PR that intentionally renames or consolidates a section
// must update this constant in the same change.
export const REQUIRED_AGENTS_SECTIONS: readonly string[] = [
  'Reading Order',
  'Setup',
  'Authority Model',
  'Enforcement Layers',
  'Subagent Review Discipline',
  'Project Intent',
  'Documentation Discipline',
  'PR Sizing Discipline',
  'Quality Gate',
  'TDD Workflow',
  'Code Rules',
  'Research Pipeline Rules',
  'DCO / Commit Sign-Off',
  'Coverage Rules',
  'Excluded From Coverage',
  'Workspace & Architecture Rules',
  'UI Code Rules',
  'Admin App Rules',
  'Integration Adapter Rules',
  'Visual-Diff Workflow',
  'Migration / Hotfix Branch Rules',
]

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ADR matching for `bots-have-adrs`. The original implementation matched
// any ADR containing the bot name AND a positive keyword like "dco" or
// "exemption" — but a hypothetical `0099-removed-dependabot.md` documenting
// a removal would also satisfy that and produce a false negative. Tighten
// by requiring at least one positive keyword AND zero negative keywords.
const POSITIVE_ADR_KEYWORDS: readonly string[] = [
  'dco',
  'exempt',
  'exemption',
  'policy',
  'integration',
]
const NEGATIVE_ADR_KEYWORDS: readonly string[] = [
  'removed',
  'removal',
  'deprecated',
  'deprecation',
  'sunset',
  'retired',
]

function adrMatchesBot(adrName: string, botName: string): boolean {
  const lower = adrName.toLowerCase()
  if (!lower.includes(botName.toLowerCase())) {
    return false
  }
  const hasPositive = POSITIVE_ADR_KEYWORDS.some((kw): boolean =>
    lower.includes(kw),
  )
  if (!hasPositive) {
    return false
  }
  const hasNegative = NEGATIVE_ADR_KEYWORDS.some((kw): boolean =>
    lower.includes(kw),
  )
  return !hasNegative
}

export const checkAgentsExists: DriftCheck = (inputs): readonly DriftIssue[] => {
  if (inputs.agents === null) {
    return [
      {
        check: 'agents-exists',
        message: 'AGENTS.md is missing from the repository root.',
      },
    ]
  }
  return []
}

export const checkAgentsAssertsCanonical: DriftCheck = (
  inputs,
): readonly DriftIssue[] => {
  if (inputs.agents === null) {
    return []
  }
  for (const pattern of AGENTS_CANONICAL_PATTERNS) {
    if (pattern.test(inputs.agents)) {
      return []
    }
  }
  return [
    {
      check: 'agents-asserts-canonical',
      message:
        "AGENTS.md does not assert itself as canonical/authoritative (no 'canonical' or 'authoritative' phrase paired with 'AGENTS.md' found). If you flipped AGENTS.md to defer to another file, restore the canonical claim or update this checker.",
    },
  ]
}

export const checkClaudeDefersToAgents: DriftCheck = (
  inputs,
): readonly DriftIssue[] => {
  if (inputs.claude === null) {
    return [
      {
        check: 'claude-defers-to-agents',
        message: 'CLAUDE.md is missing from the repository root.',
      },
    ]
  }
  let defers = false
  for (const pattern of CLAUDE_DEFERS_PATTERNS) {
    if (pattern.test(inputs.claude)) {
      defers = true
      break
    }
  }
  if (!defers) {
    return [
      {
        check: 'claude-defers-to-agents',
        message:
          'CLAUDE.md does not defer to AGENTS.md (no phrase like "AGENTS.md is the authoritative" or "full rule book lives in AGENTS.md" found). CLAUDE.md is a Claude-specific compatibility shim — it MUST point back to AGENTS.md as canonical.',
      },
    ]
  }
  // Defer-then-override defence: even after the deference assertion,
  // catch any explicit override claim that would undo it.
  for (const pattern of CLAUDE_OVERRIDE_PATTERNS) {
    if (pattern.test(inputs.claude)) {
      return [
        {
          check: 'claude-defers-to-agents',
          message:
            'CLAUDE.md asserts AGENTS.md is authoritative AND simultaneously claims CLAUDE.md (or the rules below) override or supersede AGENTS.md. The shim discipline is undone by the override claim — pick one. If the override is intentional, AGENTS.md must also be updated to delegate to CLAUDE.md, and the authority direction in this checker must be reconsidered.',
        },
      ]
    }
  }
  return []
}

export const checkAgentsAcknowledgesClaudeShim: DriftCheck = (
  inputs,
): readonly DriftIssue[] => {
  if (inputs.agents === null) {
    return []
  }
  for (const pattern of AGENTS_NAMES_CLAUDE_SHIM_PATTERNS) {
    if (pattern.test(inputs.agents)) {
      return []
    }
  }
  return [
    {
      check: 'agents-acknowledges-claude-shim',
      message:
        'AGENTS.md does not name CLAUDE.md as a compatibility shim. The authority cycle works only when both files agree on each other\'s role; without this acknowledgement, a future agent could read AGENTS.md, miss CLAUDE.md\'s existence, and produce a Claude session that bypasses the shim.',
    },
  ]
}

export const checkAgentsSectionCoverage: DriftCheck = (
  inputs,
): readonly DriftIssue[] => {
  const agents = inputs.agents
  if (agents === null) {
    return []
  }
  const missing = REQUIRED_AGENTS_SECTIONS.filter((section): boolean => {
    // Match `## SectionName` at the start of any line, allowing the heading
    // to carry a parenthetical qualifier (e.g. "## Admin App Rules (lands
    // with Epic 4)"). The trailing ` `, end-of-line, or non-word char
    // boundary keeps "## UI Code Rules" from accidentally matching some
    // hypothetical "## UI Code Rules Of Engagement" section.
    const pattern = new RegExp(
      String.raw`^## ${escapeRegex(section)}(?:\s|$)`,
      'm',
    )
    return !pattern.test(agents)
  })
  if (missing.length === 0) {
    return []
  }
  return [
    {
      check: 'agents-section-coverage',
      message: `AGENTS.md is missing required H2 section(s): ${missing
        .map((s): string => `"## ${s}"`)
        .join(
          ', ',
        )}. The closed PR #54 review surfaced silent section deletion as a top-level failure mode — that is exactly what this check exists to prevent. If you intentionally renamed or consolidated a section, update REQUIRED_AGENTS_SECTIONS in scripts/check-agent-discipline-sync.ts in the same PR so the change is auditable.`,
    },
  ]
}

export const checkBotsHaveAdrs: DriftCheck = (
  inputs,
): readonly DriftIssue[] => {
  if (inputs.dependabot === null) {
    return []
  }
  // `.match(/g)` returns `RegExpMatchArray | null` where elements are typed
  // as `string` (not `string | undefined`); for...of iteration over the
  // narrowed array sidesteps the noUncheckedIndexedAccess `| undefined`
  // branch that Array.matchAll would force.
  const matches = inputs.dependabot.match(BOT_AUTHOR_REGEX) ?? []
  const seen = new Set<string>()
  for (const email of matches) {
    seen.add(email.toLowerCase())
  }
  // The presence of `.github/dependabot.yml` is itself the signal that
  // GitHub Dependabot is configured for this repo — the file content
  // doesn't typically carry the bot's author email. If no other bot
  // email was matched, fall back to the canonical Dependabot identity.
  if (seen.size === 0) {
    seen.add('dependabot[bot]@users.noreply.github.com')
  }
  const issues: DriftIssue[] = []
  for (const bot of seen) {
    // bot is guaranteed to contain '[bot]' (BOT_AUTHOR_REGEX matches it,
    // or the canonical fallback above includes it), so indexOf returns >= 0
    // and slice() yields the bot-name prefix as a plain string.
    const botName = bot.slice(0, bot.indexOf('[bot]'))
    const hasAdr = inputs.adrBasenames.some((name): boolean =>
      adrMatchesBot(name, botName),
    )
    if (!hasAdr) {
      issues.push({
        check: 'bots-have-adrs',
        message: `Bot author "${bot}" referenced in dependabot.yml has no matching ADR in docs/adr/. Per ADR-0009 precedent, every bot author exempted from project gates needs its own ADR. The match requires the ADR filename to contain the bot name AND at least one positive keyword (dco / exempt / exemption / policy / integration) AND no negative keyword (removed / deprecated / sunset / retired) — a deletion-documenting ADR does not satisfy the requirement.`,
      })
    }
  }
  return issues
}

export const allChecks: readonly DriftCheck[] = [
  checkAgentsExists,
  checkAgentsAssertsCanonical,
  checkClaudeDefersToAgents,
  checkAgentsAcknowledgesClaudeShim,
  checkAgentsSectionCoverage,
  checkBotsHaveAdrs,
]

export function runAllChecks(
  inputs: DriftCheckInputs,
): readonly DriftIssue[] {
  const issues: DriftIssue[] = []
  for (const check of allChecks) {
    for (const issue of check(inputs)) {
      issues.push(issue)
    }
  }
  return issues
}
