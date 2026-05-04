import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  FRESHNESS_TTL_DAYS,
  PublishedDataset,
  WorkspaceFile,
} from '@snowboard-trip-advisor/schema'
import type { Resort, ResortLiveSignal } from '@snowboard-trip-advisor/schema'
import type {
  ListResortsQuery,
  ListResortsResponse,
  ResortSummary,
} from '@snowboard-trip-advisor/schema/api'

export interface HandlerDeps {
  readonly workspaceRoot: string
}

export interface ListResortsInput {
  readonly query: ListResortsQuery
}

// Note: health.ts also keeps a file-local DURABLE_METRIC_FIELDS const for its
// missing-provenance counter. listResorts doesn't compute missing-provenance
// (per spec §7.9 the per-resort summary carries stale_field_count + failed_field_count
// only), so the durable-paths const isn't needed here. Plan §3 NOT-building: the shared
// read helpers + constants extract in PR 4.4a (third caller), not pre-emptively.

// Enumerate the live field_sources paths that are actually populated for a given
// live_signal. Mirrors health.ts:32-41 (and validatePublishedDataset.ts:141-175):
// live field_sources are only required when the corresponding value is populated.
// A null live_signal → no live paths populated. Used here for stale-field
// counting — a stale field_sources entry whose live value is absent is
// 'never_fetched', NOT stale (loadResortDatasetFromObject.ts:liveField semantics).
function populatedLivePaths(live: ResortLiveSignal | null): readonly string[] {
  if (live === null) { return [] }
  const paths: string[] = []
  if (live.snow_depth_cm !== undefined) { paths.push('snow_depth_cm') }
  if (live.lifts_open?.count !== undefined) { paths.push('lifts_open.count') }
  if (live.lifts_open?.total !== undefined) { paths.push('lifts_open.total') }
  if (live.lift_pass_day !== undefined) { paths.push('lift_pass_day') }
  if (live.lodging_sample?.median_eur !== undefined) { paths.push('lodging_sample.median_eur') }
  return paths
}

export async function listResortsHandler(
  input: ListResortsInput,
  deps: HandlerDeps,
): Promise<ListResortsResponse> {
  const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')

  const workspaceFiles = await readWorkspaceFilesOrEmpty(workspaceDir)
  const publishedDoc = await readPublishedDocOrNull(publishedPath)

  const now = Date.now()
  const summariesBySlug = new Map<string, ResortSummary>()

  // Workspace branch first — workspace takes precedence per spec §4.1.1.
  for (const { name, raw } of workspaceFiles) {
    const parseResult = WorkspaceFile.safeParse(raw)
    if (!parseResult.success) {
      // eslint-disable-next-line no-console -- spec §10.3.1: stderr corrupt-file logging
      console.error(
        `[admin/listResorts] corrupt workspace file ${name}: ${parseResult.error.issues.map((i): string => i.message).join('; ')}`,
      )
      continue
    }
    const wf = parseResult.data
    summariesBySlug.set(wf.slug, {
      slug: wf.slug,
      name: wf.resort.name,
      country: wf.resort.country,
      // Workspace branch: last_updated === wf.modified_at (when the analyst last edited).
      last_updated: wf.modified_at,
      stale_field_count: countStaleFields(wf.resort, wf.live_signal, now),
      // Phase 1: no upstream adapters per spec §10.5 — failures are always 0.
      // Epic 5 follow-up will populate this from adapter run state.
      failed_field_count: 0,
      // Workspace branch: publish_state === wf.resort.publish_state (workspace precedence).
      publish_state: wf.resort.publish_state,
    })
  }

  // Published branch — only resorts NOT already covered by the workspace.
  if (publishedDoc) {
    const liveSignalBySlug = new Map<string, ResortLiveSignal>(
      publishedDoc.live_signals.map((ls): [string, ResortLiveSignal] => [ls.resort_slug, ls]),
    )
    for (const r of publishedDoc.resorts) {
      if (summariesBySlug.has(r.slug)) { continue }  // workspace precedence — skip duplicates.
      const liveSignal = liveSignalBySlug.get(r.slug) ?? null
      summariesBySlug.set(r.slug, {
        slug: r.slug,
        name: r.name,
        country: r.country,
        // Published branch: last_updated === publishedDoc.published_at (when the dataset shipped).
        last_updated: publishedDoc.published_at,
        stale_field_count: countStaleFields(r, liveSignal, now),
        failed_field_count: 0,
        // Published branch: publish_state === r.publish_state (from the published Resort).
        publish_state: r.publish_state,
      })
    }
  }

  // Apply filter then page. Iteration order over Map preserves insertion order
  // (workspace first, then published) — deterministic for tests + UI.
  const all = Array.from(summariesBySlug.values())
  const filtered = applyFilter(all, input.query.filter)
  // Defaults: when query.page is undefined we fall back here. When it's
  // present, Zod's .default(0) / .default(50) on the schema fields ensures
  // offset / limit are populated, so the ?? right-hand operand is unreached
  // at runtime — kept for the page-absent branch only.
  const offset = input.query.page?.offset ?? 0
  const limit = input.query.page?.limit ?? 50
  const items = filtered.slice(offset, offset + limit)

  return {
    items,
    page: { offset, limit, total: filtered.length },
  }
}

// ---------------------------------------------------------------------------
// Per-resort stale-field count
// ---------------------------------------------------------------------------
//
// Distinct from health.ts's aggregate `staleCount` (which counts *resorts*
// with at least one stale field). Here each ResortSummary carries the
// COUNT of stale FIELDS for that one resort.
//
// Only populated live paths are subject to clock-based staleness — durable
// resort attributes (slopes_km, season.*, etc.) return state: 'fresh'
// unconditionally per loadResortDatasetFromObject.ts:83-99. A stale
// field_sources entry whose live value is absent (state: 'never_fetched')
// is NOT counted — gated by populatedLivePaths.
function countStaleFields(
  resort: Resort,
  live: ResortLiveSignal | null,
  now: number,
): number {
  const liveSources = live?.field_sources ?? {}
  const combinedSources = { ...resort.field_sources, ...liveSources }
  let count = 0
  for (const path of populatedLivePaths(live)) {
    const fs = combinedSources[path]
    if (fs === undefined) { continue }
    const ageDays = (now - new Date(fs.observed_at).getTime()) / (24 * 60 * 60 * 1000)
    if (ageDays > FRESHNESS_TTL_DAYS.default) { count++ }
  }
  return count
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------
//
// - filter.country: keep only resorts whose country === filter.country.
// - filter.hasFailures === true: keep only failed_field_count > 0.
// - filter.hasFailures === false: keep only failed_field_count === 0.
// - filter.hasFailures === undefined: no filter on failures.
// (In Phase 1 failed_field_count is always 0, so hasFailures: true returns
// empty — that's correct semantics; matches the Phase-1 adapter-less topology.)
function applyFilter(
  items: ReadonlyArray<ResortSummary>,
  filter: ListResortsQuery['filter'],
): ReadonlyArray<ResortSummary> {
  if (filter === undefined) { return items }
  return items.filter((s): boolean => {
    if (filter.country !== undefined && s.country !== filter.country) { return false }
    if (filter.hasFailures === true && s.failed_field_count === 0) { return false }
    /* v8 ignore next -- hasFailures: false drops items with failures > 0; in Phase 1
       failed_field_count is always 0 (no upstream adapters per spec §10.5) so this
       branch is structurally unreachable until Epic 5 lands real failure tracking.
       Kept here for Phase-2 correctness — the semantics (filter out failed items
       when hasFailures: false) are part of the wire contract. */
    if (filter.hasFailures === false && s.failed_field_count > 0) { return false }
    return true
  })
}

// ---------------------------------------------------------------------------
// Read helpers — duplicated from health.ts intentionally (plan §3 / NOT-building).
// PR 4.4a (resortDetail + workspace.ts read helpers) is the third caller — that's
// when we extract. Do NOT extract pre-emptively in PR 4.3.
// ---------------------------------------------------------------------------

async function readWorkspaceFilesOrEmpty(
  dir: string,
): Promise<ReadonlyArray<{ name: string; raw: unknown }>> {
  try {
    const entries = await readdir(dir)
    const jsonFiles = entries.filter((e): boolean => e.endsWith('.json'))
    const out: Array<{ name: string; raw: unknown }> = []
    for (const name of jsonFiles) {
      try {
        const text = await readFile(join(dir, name), 'utf-8')
        out.push({ name, raw: JSON.parse(text) as unknown })
      } catch (err) {
        /* v8 ignore next 3 -- ENOENT inside the per-file readFile catch means the file
           disappeared between readdir and readFile (TOCTOU transient race). Triggering it
           in a unit test would require injecting an fs deletion mid-loop. */
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          continue
        }
        // All other errors (JSON.parse failures on truncated/invalid content,
        // EACCES, EIO, etc.) are treated as "corrupt by design" — pushed as
        // raw: undefined → fails WorkspaceFile.safeParse → counted as corrupt.
        out.push({ name, raw: undefined })
      }
    }
    return out
  } catch (err) {
    /* v8 ignore next 3 -- non-ENOENT readdir errors (EACCES, etc.) are defensive rethrows;
       testing them would require injecting OS-level permission failures in unit tests. The
       inverted predicate (vs health.ts's `=== 'ENOENT' return; throw`) is intentional: it
       lets a single positional `v8 ignore next 3` cover both the predicate's false-branch
       and the rethrow, keeping the file at 100% branch coverage. PR 4.4a's extraction can
       reconcile the two styles into one canonical helper. */
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
    return []
  }
}

async function readPublishedDocOrNull(path: string): Promise<PublishedDataset | null> {
  try {
    const text = await readFile(path, 'utf-8')
    const data = JSON.parse(text) as unknown  // may throw SyntaxError on malformed JSON
    const parsed = PublishedDataset.safeParse(data)
    return parsed.success ? parsed.data : null
  } catch (err) {
    // ENOENT (absent file) and SyntaxError (malformed JSON) are both treated as absent
    // per spec §10.9 — degrade gracefully. Any other error (EACCES, EIO, etc.) is a
    // defensive rethrow.
    const isEnoent = (err as NodeJS.ErrnoException).code === 'ENOENT'
    const isSyntaxError = err instanceof SyntaxError
    /* v8 ignore next 3 -- non-ENOENT, non-SyntaxError errors (EACCES, etc.) are defensive
       rethrows; testing them would require injecting OS-level permission failures. */
    if (!isEnoent && !isSyntaxError) {
      throw err
    }
    return null
  }
}
