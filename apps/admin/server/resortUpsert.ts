import { join } from 'node:path'

import {
  ISODateTimeString,
  METRIC_FIELDS,
  WorkspaceFile,
  projectFieldStates,
  type MetricPath,
  type Resort,
  type ResortLiveSignal,
} from '@snowboard-trip-advisor/schema'
import type {
  ResortDetailResponse,
  ResortSlugParam,
  ResortUpsertBody,
} from '@snowboard-trip-advisor/schema/api'
import type { z } from 'zod'

import type { HandlerDeps } from './listResorts'
import {
  atomicWriteWorkspaceFile,
  readPublishedDocOrNull,
  readWorkspaceFileForSlug,
} from './workspace'

// PR 4.4c §7.12 — PUT /api/resorts/:slug end-to-end.
//
// Wire-layer rejects (empty body / unknown keys / non-MetricPath editor_modes)
// are enforced by ResortUpsertBody.parse() in dispatch.ts before the handler
// runs. Per AGENTS.md "no defensive code for impossible cases", the handler
// only protects invariants the request schema cannot express:
//
//   - cross-key invariant: editor_modes paths must be in resort.field_sources
//     (durable subset only). Sending `editor_modes: { snow_depth_cm: 'manual' }`
//     is wire-valid (snow_depth_cm is in METRIC_FIELDS) but post-merge fails
//     WorkspaceFile.parse — handler throws InvalidResortError per Codex
//     round-10 P2-14 fold.
//   - slug must exist in workspace OR published doc — else NotFoundError.
//   - target file already on disk MUST be parseable; corrupt state propagates
//     WorkspaceCorruptError (read-side) without overwriting (the read happens
//     before the write).

class NotFoundError extends Error {
  public readonly code = 'not-found' as const
  public constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

// Codex round-3 P1 fold (provenance pairing rejection). dispatch.ts maps
// `.code = 'invalid-request'` → 400 via STATUS_FOR_CODE and forwards `.details`
// per spec §4.10. Distinct from InvalidResortError (post-merge schema reject)
// because this is a wire-protocol violation: the client sent a value edit
// without the matching manual provenance entry.
class InvalidRequestError extends Error {
  public readonly code = 'invalid-request' as const
  public readonly details: ReadonlyArray<{ readonly path: ReadonlyArray<string>; readonly message: string }>

  public constructor(
    message: string,
    details: ReadonlyArray<{ readonly path: ReadonlyArray<string>; readonly message: string }>,
  ) {
    super(message)
    this.name = 'InvalidRequestError'
    this.details = details
  }
}

class InvalidResortError extends Error {
  public readonly code = 'invalid-resort' as const
  public readonly issues: ReadonlyArray<z.core.$ZodIssue>

  public constructor(issues: ReadonlyArray<z.core.$ZodIssue>) {
    super('resort validation failed')
    this.name = 'InvalidResortError'
    this.issues = issues
  }

  // dispatch.ts (PR 4.4a-2 round-4 P2 fold) reads `.details` from thrown
  // errors and forwards it through the error envelope per spec §4.10.
  public get details(): ReadonlyArray<z.core.$ZodIssue> {
    return this.issues
  }
}

export interface ResortUpsertInput {
  readonly params: ResortSlugParam
  readonly body: ResortUpsertBody
}

export async function resortUpsertHandler(
  input: ResortUpsertInput,
  deps: HandlerDeps,
): Promise<ResortDetailResponse> {
  const { slug } = input.params
  const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')
  const targetPath = join(workspaceDir, `${slug}.json`)

  // Read base state — workspace takes precedence per spec §4.1.1; fall through
  // to the published doc on cold-start; throw NotFoundError if neither carries
  // the slug. WorkspaceCorruptError from readWorkspaceFileForSlug propagates
  // unchanged BEFORE the write — the corrupt file on disk is not touched.
  const [existing, publishedDoc] = await Promise.all([
    readWorkspaceFileForSlug(workspaceDir, slug),
    readPublishedDocOrNull(publishedPath),
  ])

  let baseResort: Resort
  let baseLive: ResortLiveSignal | null
  let baseModes: Partial<Record<string, 'manual' | 'auto'>>
  if (existing !== null) {
    baseResort = existing.resort
    baseLive = existing.live_signal
    baseModes = existing.editor_modes
  } else {
    const fromPublished = publishedDoc?.resorts.find((r): boolean => r.slug === slug)
    if (fromPublished === undefined) {
      throw new NotFoundError(
        `resort "${slug}" not found in workspace or published doc`,
      )
    }
    baseResort = fromPublished
    baseLive = publishedDoc?.live_signals.find((ls): boolean => ls.resort_slug === slug) ?? null
    baseModes = {}
  }

  // Apply merge per spec §4.3:
  //   - resort: shallow top-level merge, deep field_sources merge per-path
  //   - live_signal: shallow merge OR explicit-null clear OR cold-start hydrate
  //   - editor_modes: shallow per-key override
  const mergedResort = mergeResort(baseResort, input.body.resort)
  const mergedLive = mergeLiveSignal(baseLive, input.body.live_signal, slug)
  const mergedModes = { ...baseModes, ...(input.body.editor_modes ?? {}) }

  const candidate: unknown = {
    schema_version: 1,
    slug,
    resort: mergedResort,
    live_signal: mergedLive,
    modified_at: ISODateTimeString.parse(new Date().toISOString()),
    editor_modes: mergedModes,
  }
  const parsed = WorkspaceFile.safeParse(candidate)
  if (!parsed.success) {
    throw new InvalidResortError(parsed.error.issues)
  }

  // Codex round-3 P1 + round-4 P2 fold: provenance pairing — defense-in-depth
  // for the wire schema's optional field_sources. See assertProvenancePairing.
  assertProvenancePairing(
    { resort: baseResort, live: baseLive },
    { resort: parsed.data.resort, live: parsed.data.live_signal },
    input.body,
  )

  await atomicWriteWorkspaceFile(targetPath, JSON.stringify(parsed.data, null, 2))

  // Codex round-2 P2 fold: mirror the resortDetail GET handler's draft check.
  // When the resort is a draft (workspace file exists but slug NOT in
  // published doc) the GET handler returns `live_signal: null` per spec §4.2.1.
  // The PUT response MUST hide live_signal the same way — otherwise PR 4.4d's
  // `prepopulateResortDetail` would cache a response carrying live values
  // that a fresh GET would hide, and the editor would briefly show
  // inconsistent draft data until the next manual cache invalidation. The
  // on-disk workspace file still carries the live_signal as-is (per the
  // suggestion: "without necessarily deleting the on-disk live data") — only
  // the projected response strips it.
  const isDraft = publishedDoc === null
    || !publishedDoc.resorts.some((r): boolean => r.slug === slug)
  const responseLive: ResortLiveSignal | null = isDraft ? null : parsed.data.live_signal

  return {
    resort: parsed.data.resort,
    live_signal: responseLive,
    field_states: projectFieldStates(
      parsed.data.resort,
      responseLive,
      parsed.data.editor_modes,
      new Date(),
    ),
  }
}

function mergeResort(base: Resort, patch: ResortUpsertBody['resort']): unknown {
  if (patch === undefined) {
    return base
  }
  // Spreading `undefined` is a no-op in object spreads, so when patch.field_sources
  // is omitted the merged field_sources is just `{...base.field_sources}` —
  // semantically equal to base.field_sources. No conditional needed.
  return {
    ...base,
    ...patch,
    field_sources: { ...base.field_sources, ...patch.field_sources },
  }
}

function mergeLiveSignal(
  base: ResortLiveSignal | null,
  patch: ResortUpsertBody['live_signal'],
  slug: string,
): unknown {
  if (patch === undefined) {
    return base
  }
  if (patch === null) {
    return null
  }
  if (base === null) {
    // Codex round-1 P2 fold: ResortUpsertBody strips schema_version + resort_slug
    // for forging prevention (the URL is the authoritative slug source). The
    // handler is the trusted authority for these identity fields, so it must
    // hydrate them on cold-start before WorkspaceFile.safeParse runs — without
    // this seed even a complete client patch (observed_at + fetched_at + value
    // fields + field_sources) can never satisfy ResortLiveSignal because the
    // identity fields are unreachable through the wire schema. Default
    // field_sources to {} so a patch without provenance still produces a
    // shape-valid candidate (subsequent value-field validation rejects on its
    // own merits).
    return {
      schema_version: 1,
      resort_slug: slug,
      field_sources: {},
      ...patch,
    }
  }
  return {
    ...base,
    ...patch,
    field_sources: { ...base.field_sources, ...patch.field_sources },
  }
}

// Codex round-3 P1 + round-4 P2 fold — provenance pairing.
// The wire schema's ResortUpsertBody types `resort.field_sources` and
// `live_signal.field_sources` as OPTIONAL (a value patch can ship without
// provenance). On the server side, that's a misattribution risk in two flavors:
//   (a) base has upstream provenance (e.g., resort-feed); patch changes value
//       without field_sources — workspace would claim the manual edit was
//       sourced from the upstream adapter.
//   (b) base ALREADY has manual provenance from a prior PUT; patch changes
//       value without field_sources — workspace would silently keep the
//       OLD observed_at / upstream_hash / attribution for the new value,
//       claiming a manual edit at a different timestamp than reality.
// Per Decision D12 the SPA pairs every value edit with a fresh manual
// FieldSource. The server enforces the pairing as defense-in-depth: when a
// metric-path value changes to a defined state, the PATCH must supply a
// fresh field_sources entry for that path. Checking only the merged source
// (Codex round-3 first attempt) misses case (b); checking patch presence
// catches both. Value REMOVAL (afterValue undefined) is exempt — there's
// no value left to misattribute. ManualOnlyFieldSource at the wire layer
// guarantees any patch-supplied entry has source='manual', so patch
// presence implies manual source automatically.
const DURABLE_PATHS: ReadonlySet<MetricPath> = new Set<MetricPath>([
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
])

function readMetricValue(
  resort: Resort,
  live: ResortLiveSignal | null,
  path: MetricPath,
): unknown {
  switch (path) {
    case 'altitude_m.min': return resort.altitude_m.min
    case 'altitude_m.max': return resort.altitude_m.max
    case 'slopes_km': return resort.slopes_km
    case 'lift_count': return resort.lift_count
    case 'skiable_terrain_ha': return resort.skiable_terrain_ha
    case 'season.start_month': return resort.season.start_month
    case 'season.end_month': return resort.season.end_month
    case 'snow_depth_cm': return live?.snow_depth_cm
    case 'lifts_open.count': return live?.lifts_open?.count
    case 'lifts_open.total': return live?.lifts_open?.total
    case 'lift_pass_day': return live?.lift_pass_day
    case 'lodging_sample.median_eur': return live?.lodging_sample?.median_eur
  }
}

function patchSuppliedFieldSourceFor(patch: ResortUpsertBody, path: MetricPath): boolean {
  if (DURABLE_PATHS.has(path)) {
    return patch.resort?.field_sources?.[path] !== undefined
  }
  return patch.live_signal?.field_sources?.[path] !== undefined
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  // Money / lifts_open / season are small structural values; JSON.stringify
  // is sufficient (key insertion order is consistent because both sides come
  // from Zod-parsed objects with identical schema-defined ordering).
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

function assertProvenancePairing(
  base: { readonly resort: Resort; readonly live: ResortLiveSignal | null },
  merged: { readonly resort: Resort; readonly live: ResortLiveSignal | null },
  patch: ResortUpsertBody,
): void {
  for (const path of METRIC_FIELDS) {
    const beforeValue = readMetricValue(base.resort, base.live, path)
    const afterValue = readMetricValue(merged.resort, merged.live, path)
    // Removed values (undefined post-merge) carry no misattribution risk —
    // there's no claim to make about provenance for an absent value.
    if (afterValue === undefined) {
      continue
    }
    const valueChanged = !valuesEqual(beforeValue, afterValue)
    const patchSupplied = patchSuppliedFieldSourceFor(patch, path)

    // Direction 1 (Codex round-3 P1 + round-4 P2): value changed without a
    // patch-supplied field_sources entry — server would otherwise carry the
    // base entry forward (claim upstream provenance for an analyst edit, OR
    // claim the prior PUT's observed_at / upstream_hash for the new value).
    if (valueChanged && !patchSupplied) {
      throw new InvalidRequestError(
        `value at metric path "${path}" changed but the patch did not supply a fresh manual field_sources entry — the merged file would carry stale provenance (observed_at / upstream_hash) for the new value`,
        [{
          path: ['field_sources', path],
          message: `fresh manual field_sources entry required in the same PUT body when value at "${path}" changes`,
        }],
      )
    }

    // Direction 2 (Codex round-6 P1): patch supplied a field_sources entry
    // WITHOUT changing the corresponding value — would falsely re-attribute
    // an unchanged value to a manual entry the analyst didn't actually type.
    // Phase 1 has no "provenance-only correction" workflow; the SPA pairs
    // value+source per Decision D12, so any provenance-only patch is a
    // wire-protocol violation. (If a future correction-flow PR ever needs
    // it, lift this gate behind an explicit feature flag.)
    if (!valueChanged && patchSupplied) {
      throw new InvalidRequestError(
        `patch supplied a field_sources entry at metric path "${path}" without changing the corresponding value — would falsely re-attribute the existing value to a manual entry the analyst didn't type`,
        [{
          path: ['field_sources', path],
          message: `field_sources entry at "${path}" requires a paired value change in the same PUT body (provenance-only patches are not a Phase-1 workflow per Decision D12)`,
        }],
      )
    }
  }
}
