import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  FRESHNESS_TTL_DAYS,
  METRIC_FIELDS,
  PublishedDataset,
  WorkspaceFile,
} from '@snowboard-trip-advisor/schema'
import type { HealthQuery, HealthResponse } from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

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

    // Stale fields: any METRIC_FIELDS path in the combined sources whose
    // observed_at is older than FRESHNESS_TTL_DAYS.default days.
    // Mirrors the canonical pattern at packages/schema/src/loadResortDatasetFromObject.ts:113-118.
    const hasStaleField = METRIC_FIELDS.some((p): boolean => {
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
        // Other errors (JSON.parse failure on truncated content) → push undefined → fails safeParse → corrupt count.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          /* v8 ignore next -- ENOENT here means the file disappeared between readdir and readFile
             (TOCTOU transient race). Triggering it in a unit test would require injecting
             a filesystem deletion mid-loop, which is not portable across OS schedulers. */
          continue
        }
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
    const parsed = PublishedDataset.safeParse(JSON.parse(text) as unknown)
    return parsed.success ? parsed.data : null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    /* v8 ignore next -- non-ENOENT readFile errors (EACCES, etc.) are defensive rethrows;
       testing them would require injecting OS-level permission failures in unit tests. */
    throw err
  }
}
