// scripts/check-agent-discipline-sync.ts — pure drift checker for the
// agent-discipline rule base. Catches the failure modes the closed PR #54
// review surfaced: silent authority drift between AGENTS.md and CLAUDE.md,
// orphaned bot configurations without matching ADRs, and the rot pattern
// where a future PR shrinks AGENTS.md while leaving CLAUDE.md as a stale
// pseudo-canonical doc.
//
// Side-effect entry point lives in `./check-agent-discipline-sync.cli.ts`.
// Wired into `npm run qa` via the root `package.json` `check:agent-discipline-sync`
// script (not a separate `qa` step today; the CLI is invoked alongside).

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

const AGENTS_NAMES_CLAUDE_SHIM_PATTERNS: readonly RegExp[] = [
  /\bCLAUDE\.md\b[^.]*\bshim\b/i,
  /\bCLAUDE\.md\b[^.]*\bcompatibility\b/i,
]

const BOT_AUTHOR_REGEX =
  /\b([a-z0-9_.-]+\[bot\]@users\.noreply\.github\.com)\b/gi

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
  for (const pattern of CLAUDE_DEFERS_PATTERNS) {
    if (pattern.test(inputs.claude)) {
      return []
    }
  }
  return [
    {
      check: 'claude-defers-to-agents',
      message:
        'CLAUDE.md does not defer to AGENTS.md (no phrase like "AGENTS.md is the authoritative" or "full rule book lives in AGENTS.md" found). CLAUDE.md is a Claude-specific compatibility shim — it MUST point back to AGENTS.md as canonical.',
    },
  ]
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

export const checkBotsHaveAdrs: DriftCheck = (
  inputs,
): readonly DriftIssue[] => {
  if (inputs.dependabot === null) {
    return []
  }
  const matches = inputs.dependabot.matchAll(BOT_AUTHOR_REGEX)
  const seen = new Set<string>()
  for (const match of matches) {
    // Capture group 1 is required by BOT_AUTHOR_REGEX; the bracket-access
    // narrowing here is `string | undefined` only because of
    // `noUncheckedIndexedAccess` — the regex guarantees a value when
    // matchAll yields a match.
    const email = match[1] as string
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
    // `bot` always contains `[bot]` (set construction above guarantees it).
    const botName = bot.split('[bot]')[0] as string
    const adrPattern = new RegExp(
      String.raw`\b(?:dco|dependency|exemption|exempt).*${botName}|${botName}.*(?:dco|dependency|exemption|exempt)`,
      'i',
    )
    const hasAdr = inputs.adrBasenames.some((name): boolean =>
      adrPattern.test(name),
    )
    if (!hasAdr) {
      issues.push({
        check: 'bots-have-adrs',
        message: `Bot author "${bot}" referenced in dependabot.yml has no matching ADR in docs/adr/. Per ADR-0009 precedent, every bot author exempted from project gates needs its own ADR. Add one or remove the bot.`,
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
