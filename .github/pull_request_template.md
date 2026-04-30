## Summary

<!-- 1–3 bullets describing what changed and why -->

## Spec / ADR reference

<!--
  Cite the section this PR implements, e.g.:
    - Spec §9 Epic 1 PR 1.2
    - ADR-0002 §4.1
  If no spec reference applies, explain why (e.g., "urgent hotfix").
-->

## Test plan

<!-- Markdown checklist of TODOs verified locally -->

- [ ]
- [ ]

## Quality gate

- [ ] `npm run qa` passes locally (lint → typecheck → coverage → tokens:check → test:hooks → test:agent-discipline-sync → check:agent-discipline-sync → test:integration)
- [ ] All commits signed off with DCO (`git commit -s`)
- [ ] Coverage remains at 100% (lines / branches / functions / statements)
- [ ] No `/* istanbul ignore */` comments introduced
- [ ] No `--no-verify` used at any point

## Scope discipline

- [ ] `README.md` drift assessed per AGENTS.md Documentation Discipline
- [ ] Applicable Post-Pivot Rules (AGENTS.md) followed for this PR's paths
- [ ] If this PR touches a CODEOWNERS-protected path, maintainer review is requested (CODEOWNERS is advisory in Phase 1)
- [ ] If this is a schema PR: `schema_version` is bumped when the change is breaking
- [ ] If this PR touches a Subagent Review Discipline trigger path (AGENTS.md), a subagent review has been run and findings addressed before requesting maintainer review

## Screenshots / artifacts

<!-- For UI changes, attach screenshots at 360 / 900 / 1280 viewports -->

<!-- https://chatgpt.com/codex -->
