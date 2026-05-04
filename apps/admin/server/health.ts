import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  FRESHNESS_TTL_DAYS,
  METRIC_FIELDS,
  PublishedDataset,
  WorkspaceFile,
} from '@snowboard-trip-advisor/schema'
import type { ResortLiveSignal } from '@snowboard-trip-advisor/schema'
import type { HealthQuery, HealthResponse } from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

// File-local: paths subject to clock-based staleness per
// packages/schema/src/loadResortDatasetFromObject.ts:83-99 (durableField vs liveField).
// Durable resort attributes (slopes_km, season.*, altitude_m.*, lift_count,
// skiable_terrain_ha) are explicitly never-stale-by-clock — editorial review
// is the Phase-2 stale-detection signal for those, not observed_at age.
// TODO(PR 4.3 / Tier 3): when listResorts.ts (PR 4.3) and resortDetail.ts
// (PR 4.4a) need the same subset, extract this to packages/schema/src/metricFields.ts
// alongside METRIC_FIELDS as the canonical source. Until then, file-local per
// ai-clean-code §3 (duplicate freely until burned twice).
const LIVE_METRIC_FIELDS = [
  'snow_depth_cm',
  'lifts_open.count',
  'lifts_open.total',
  'lift_pass_day',
  'lodging_sample.median_eur',
] as const

export interface HealthInput {
  readonly query: HealthQuery
}

export async function healthHandler(
  input: HealthInput,
  deps: HandlerDeps,
): Promise<HealthResponse> {
  void input // No query params on /api/health.
  const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')

  const workspaceFiles = await readWorkspaceFilesOrEmpty(workspaceDir)
  const publishedDoc = await readPublishedDocOrNull(publishedPath)

  let corruptCount = 0
  let staleCount = 0
  const failedCount = 0 // Always 0 in Phase 1 — no adapters per spec §10.5. Epic 5 follow-up.
  let missingProvenanceCount = 0
  const workspaceSlugs = new Set<string>()
  const now = Date.now()

  for (const { name, raw } of workspaceFiles) {
    const parseResult = WorkspaceFile.safeParse(raw)
    if (!parseResult.success) {
      corruptCount++
      // eslint-disable-next-line no-console -- spec §10.3.1: stderr corrupt-file logging
      console.error(
        `[admin/health] corrupt workspace file ${name}: ${parseResult.error.issues.map((i): string => i.message).join('; ')}`,
      )
      continue
    }
    const wf = parseResult.data
    workspaceSlugs.add(wf.slug)

    // Combined field_sources: resort (durable paths) + live_signal (live paths).
    // METRIC_FIELDS spans both groups; provenance for a path may live in either.
    const liveSources = wf.live_signal?.field_sources ?? {}
    const combinedSources = { ...wf.resort.field_sources, ...liveSources }

    // Missing provenance: any METRIC_FIELDS path absent from the combined sources.
    const hasMissingProvenance = METRIC_FIELDS.some(
      (p): boolean => !(p in combinedSources),
    )
    if (hasMissingProvenance) {
      missingProvenanceCount++
    }

    // Stale fields: only LIVE_METRIC_FIELDS paths are subject to clock-based staleness.
    // Durable resort attributes (slopes_km, season.*, etc.) return state: 'fresh'
    // unconditionally per loadResortDatasetFromObject.ts:83-99 — editorial review
    // is the Phase-2 stale-detection signal for those, not observed_at age.
    const hasStaleField = LIVE_METRIC_FIELDS.some((p): boolean => {
      const fs = combinedSources[p]
      if (fs === undefined) {
        return false
      }
      const ageDays = (now - new Date(fs.observed_at).getTime()) / (24 * 60 * 60 * 1000)
      return ageDays > FRESHNESS_TTL_DAYS.default
    })
    if (hasStaleField) {
      staleCount++
    }
  }

  // P1 fix (Codex fold): include published-only resorts in per-field aggregates.
  // Option C: look up live_signals by resort slug so we can mirror the workspace
  // loop's combined-field_sources approach exactly — same logic, same semantics.
  if (publishedDoc) {
    // Build a slug → live_signal index from the published doc for O(1) lookup.
    const liveSignalBySlug = new Map<string, ResortLiveSignal>(
      publishedDoc.live_signals.map((ls): [string, ResortLiveSignal] => [ls.resort_slug, ls]),
    )

    for (const r of publishedDoc.resorts) {
      // Workspace takes precedence — already counted above.
      if (workspaceSlugs.has(r.slug)) { continue }

      // Mirror the workspace loop: combine resort.field_sources (durable paths)
      // with the matching live_signal.field_sources (live paths) if present.
      const liveSources = liveSignalBySlug.get(r.slug)?.field_sources ?? {}
      const combinedSources = { ...r.field_sources, ...liveSources }

      // Missing provenance: any METRIC_FIELDS path absent from combined sources.
      const hasMissingProvenance = METRIC_FIELDS.some(
        (p): boolean => !(p in combinedSources),
      )
      if (hasMissingProvenance) {
        missingProvenanceCount++
      }

      // Stale fields: only LIVE_METRIC_FIELDS paths are subject to clock-based staleness.
      // Durable resort attributes (slopes_km, season.*, etc.) return state: 'fresh'
      // unconditionally per loadResortDatasetFromObject.ts:83-99 — editorial review
      // is the Phase-2 stale-detection signal for those, not observed_at age.
      const hasStaleField = LIVE_METRIC_FIELDS.some((p): boolean => {
        const fs = combinedSources[p]
        if (fs === undefined) {
          return false
        }
        const ageDays = (now - new Date(fs.observed_at).getTime()) / (24 * 60 * 60 * 1000)
        return ageDays > FRESHNESS_TTL_DAYS.default
      })
      if (hasStaleField) {
        staleCount++
      }
    }
  }

  const publishedOnlyCount = publishedDoc
    ? publishedDoc.resorts.filter((r): boolean => !workspaceSlugs.has(r.slug)).length
    : 0
  const total = workspaceSlugs.size + publishedOnlyCount

  const lastPublishedAt = publishedDoc?.published_at ?? null
  /* v8 ignore start -- stat() failure on a file we just successfully readFile()'d is a
     transient race (file deleted between read and stat). Impossible to trigger reliably
     in a unit test without mocking the fs module. */
  const archiveSizeBytes = publishedDoc
    ? await stat(publishedPath).then((s): number => s.size).catch((): number => 0)
    : 0
  /* v8 ignore end */

  return {
    resorts_total: total,
    resorts_with_stale_fields: staleCount,
    resorts_with_failed_fields: failedCount,
    resorts_with_missing_provenance: missingProvenanceCount,
    resorts_with_corrupt_workspace: corruptCount,
    pending_integration_errors: 0,
    last_published_at: lastPublishedAt,
    archive_size_bytes: archiveSizeBytes,
  }
}

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
        // ENOENT = file disappeared between readdir and readFile (TOCTOU transient race) — drop silently.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          /* v8 ignore next -- ENOENT here means the file disappeared between readdir and readFile
             (TOCTOU transient race). Triggering it in a unit test would require injecting
             a filesystem deletion mid-loop, which is not portable across OS schedulers. */
          continue
        }
        // All other errors (JSON.parse failures on truncated/invalid content,
        // EACCES, EIO, etc.) are treated as "corrupt by design" — pushed as
        // raw: undefined → fails WorkspaceFile.safeParse → corruptCount++.
        // This is intentional: any file we cannot read or parse is operationally
        // equivalent to a corrupt workspace file from the analyst's perspective.
        out.push({ name, raw: undefined })
      }
    }
    return out
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    /* v8 ignore next -- non-ENOENT readdir errors (EACCES, etc.) are defensive rethrows;
       testing them would require injecting OS-level permission failures in unit tests. */
    throw err
  }
}

async function readPublishedDocOrNull(path: string): Promise<PublishedDataset | null> {
  try {
    const text = await readFile(path, 'utf-8')
    const data = JSON.parse(text) as unknown  // may throw SyntaxError on malformed JSON
    const parsed = PublishedDataset.safeParse(data)
    return parsed.success ? parsed.data : null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    // P2 fix (Codex fold): malformed JSON (SyntaxError from JSON.parse) is
    // operationally equivalent to the file being absent per spec §10.9 — degrade
    // gracefully: last_published_at: null, archive_size_bytes: 0.
    if (err instanceof SyntaxError) {
      return null
    }
    /* v8 ignore next -- non-ENOENT, non-SyntaxError errors (EACCES, etc.) are defensive
       rethrows; testing them would require injecting OS-level permission failures. */
    throw err
  }
}
