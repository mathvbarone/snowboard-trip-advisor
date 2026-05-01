# ADR-0012: Defer analyst notes from Epic 4 to a post-Epic-4 follow-up PR

- **Status:** Accepted
- **Date:** 2026-05-01
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §3.9 (Analyst notes), §4 (note-on-analyst-notes footnote — admin-internal, persisted in `data/admin-workspace/<slug>.json`, never published), §8.4.1 (`/api/*` contract inventory rows 9 + 10)
- **Related ADRs:** [ADR-0011](./0011-defer-test-sync-ux-to-epic-5.md) — sister scoping decision for Test / Sync deferral

## Context

Parent spec §3.9 specifies per-resort, per-field Markdown analyst notes — internal commentary, never published. Backed by `/api/analyst-notes/:slug` GET / PUT (rows 9 + 10 in §8.4.1) and stored in `data/admin-workspace/<slug>.json` per the §4 footnote on the `Resort` doc.

Unlike Test / Sync (deferred per [ADR-0011](./0011-defer-test-sync-ux-to-epic-5.md)), analyst notes do not depend on real adapters. They are plain text + Markdown + a sanitizer. The "shallow UX against stubs" argument that justified deferring Test / Sync does not apply: a maintainer making decisions about which resorts to include / exclude wants to record reasoning today, not when adapters land.

But analyst notes introduce three new concerns to Epic 4 if shipped in scope:

1. **Markdown rendering safety.** Spec §3.9 mandates "no `dangerouslySetInnerHTML`; Markdown-to-AST parser + sanitizer." A new dependency lands (e.g., `remark` + `rehype-sanitize`, or a single library like `markdown-to-jsx` with disabled raw-HTML), an ADR for the sanitizer choice, possibly a CSP allowlist consideration if the sanitizer's output requires inline styles.
2. **Per-field UI.** Spec §3.9 says "per-resort, per-field" — every field on the Resort editor's durable + live panels gets a notes affordance. The UI surface area for adding, editing, and rendering notes is non-trivial (popover or inline section per field; keyboard affordance per parent §3.10's `mod+enter` save semantics; sanitized preview alongside the Markdown source).
3. **Workspace file format.** The admin workspace storage concept (`data/admin-workspace/<slug>.json`) is foundational for Epic 4 regardless — the Resort editor's durable PUT (endpoint 3) needs a draft layer before publish. Including analyst notes in that JSON shape from day one couples the workspace file format to the analyst-notes feature; deferring lets the workspace file ship Resort-only and grow a `notes` section later as a backwards-compatible addition.

Three options were on the table:

1. **Include analyst notes in Epic 4.** Faithful per parent §3.9 / §8.4.1 rows 9-10. Adds approximately one PR for the analyst-notes UI + one PR for the Markdown sanitizer (if not folded) + ADR-0013 for the sanitizer choice. Total Epic 4 PR count moves from ~8-10 to ~10-12.
2. **Defer analyst notes to a post-Epic-4 follow-up PR.** Epic 4 introduces the workspace storage layer (because Resort editor PUT needs it), and the workspace file format is Resort-only initially. Analyst notes layer on top in a small follow-up PR after Epic 4 closes — the same workspace JSON grows a `notes` field, the sanitizer dep + ADR-0013 land in that follow-up, the per-field UI is its own PR. The follow-up PR ships before Epic 5 begins.
3. **Defer analyst notes to Epic 5 or later.** Pure scope cut. No analyst notes until adapters are real. Loses Phase-1 utility (manual data entry without any commentary).

## Decision

**Defer analyst notes from Epic 4 to a post-Epic-4 follow-up PR.** Epic 4 ships the admin workspace storage layer (foundational for the Resort editor's durable PUT), and the workspace file format is Resort-only initially. The follow-up PR after Epic 4 closes adds the `notes` field to the workspace JSON, lands the Markdown sanitizer dependency + ADR-0013 for the sanitizer choice, and ships the per-field UI + endpoints 9 + 10. The follow-up lands before Epic 5 begins.

Concretely:

1. **Epic 4 omits endpoints 9 + 10** from the `packages/schema/api/*.ts` Zod surface and from `apps/admin/server/*.ts` handler registration. The corresponding rows in §8.4.1 are documented as a post-Epic-4 follow-up in the Epic 4 spec.
2. **Epic 4 ships the admin workspace storage layer.** `data/admin-workspace/<slug>.json` lands with a Resort-only initial schema (durable + live workspace state). The file format is **forward-compatible**: a future `notes` field added at the top level does not break existing files. Schema validation in Epic 4 uses Zod's `.passthrough()` or equivalent to permit forward compatibility, OR the schema is explicitly written as `Resort & Partial<{ notes: AnalystNotes }>` so the missing `notes` field does not fail parse.
3. **The follow-up PR (post-Epic-4)** adds: the `AnalystNotes` Zod schema (per-field-key string-keyed Markdown source), the workspace file format extension to include `notes`, endpoints 9 + 10 in `packages/schema/api/`, handler implementations in `apps/admin/server/`, the sanitizer dependency (deferred to that PR), ADR-0013 for the sanitizer choice, and the per-field UI affordance on the Resort editor.
4. **The post-Epic-4 follow-up's PR sizing target:** ≤8 files, ≤300 LOC excluding the test files. If the sanitizer choice + the per-field UI together exceed those caps, split into two stacked PRs (sanitizer-and-API-first, UI-second).

## Consequences

**Positive:**

- Epic 4's PR count drops from ~10-12 to ~8-10. Tighter scope.
- The sanitizer dependency + ADR-0013 land in a focused PR where the maintainer can evaluate the sanitizer choice in isolation, not buried under Resort-editor work.
- The workspace file format ships Resort-only first. Forward-compatible-via-design (`.passthrough()` or `Partial<{ notes }>`) means the analyst-notes follow-up doesn't require a `schema_version` bump for the workspace file (which is internal-only and not under the published-dataset versioning).
- Per-field UI has full Phase-1 design freedom in the follow-up PR — no constraint from "we already shipped half of it in Epic 4".

**Negative:**

- Admin app is **not feature-complete** at Epic 4 close. The gap (no analyst notes) is documented in the Epic 4 post-milestone handoff alongside the Test / Sync deferral from ADR-0011.
- Future agents reading parent §3.9 / §8.4.1 in isolation could expect analyst notes to exist in `apps/admin` after Epic 4. Mitigated by:
  - This ADR's existence and its cross-reference from the Epic 4 spec.
  - The Epic 4 spec's `Out of Scope` section explicitly listing analyst notes + endpoints 9-10 as a post-Epic-4 follow-up.
  - The post-Epic-4 follow-up PR is small enough to land within days of Epic 4 close — short window of incompleteness.
- A maintainer using the admin app between Epic 4 close and the follow-up PR cannot record per-field reasoning. Workaround for the brief window: the workspace file is checked into a separate git branch under the maintainer's control (loopback-only Phase 1, single maintainer); free-form per-field commentary can live in commit messages on that branch.

**Lift conditions:**

- Epic 4 closes (post-Epic-4 doc-prune + handoff land on `main`).
- The post-Epic-4 follow-up PR opens with: schema additions (workspace file `notes` field + endpoints 9/10), sanitizer dep + ADR-0013 for sanitizer choice, per-field UI on Resort editor.
- The follow-up PR's subagent review verifies: workspace file format is backwards-compatible with Epic 4 files (existing files without `notes` continue to parse); the sanitizer's allowlist is sufficient to render the Phase-1 maintainer's expected Markdown without escape hazards; the per-field UI does not regress the Resort editor's keyboard / focus order.

## Negative space

- **Not deferred:** the admin workspace storage layer (`data/admin-workspace/<slug>.json` for Resort + live data — Epic 4 foundational); the AUTO ↔ MANUAL ModeToggle, the StatusPill, the durable + live panels (Epic 4 — see ADR-0011 negative space); endpoint 6 (publish workflow — Epic 4); endpoints 1, 2, 3, 7, 8 (resort list / detail / upsert / publish history / health — Epic 4).
- **Not specified here:** the exact sanitizer choice, the per-field UI shape (popover vs inline expandable section), the keyboard affordance for save-and-close. All designed in the follow-up PR's spec / ADR-0013.
- **Not affected by this deferral:** the parent spec's per-field `field_sources[*].attribution_block` Markdown rendering — that is part of the **published** Resort doc and is rendered by the **public** app (Epic 3), not the admin app. The public app's Markdown handling for attribution blocks is already shipped in Epic 3; this ADR addresses only the admin-internal analyst-notes Markdown.
