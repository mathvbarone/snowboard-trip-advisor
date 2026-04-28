import type { ResortLiveSignal } from './liveSignal'
import type { MetricPath } from './metricFields'
import type { FieldSource } from './primitives'
import { EMPTY_DATASET_ZOD_MESSAGE, PublishedDataset } from './published'
import type { Resort } from './resort'

export type ValidationIssue =
  | { code: 'zod_parse_failed'; zod_issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }> }
  | { code: 'dataset_empty' }
  | { code: 'metric_field_missing_source'; resort_slug: string; metric_path: MetricPath; document: 'resort' | 'live_signal' }
  | { code: 'fx_provenance_invalid'; resort_slug: string; metric_path: MetricPath; reason: string }
  | { code: 'manifest_count_mismatch'; declared: number; actual: number }
  | { code: 'envelope_published_at_before_signal'; published_at: string; signal_observed_at: string; resort_slug: string }
  // Note: zod-side checks (https-only URL, slug regex, Money.currency literal, schema_version literal,
  // attribution_block presence, publish_state enum) all run as part of `PublishedDataset.parse` because
  // each is encoded in the Zod schemas. They surface as `zod_parse_failed` issues — except for
  // `resorts.min(1)`, which the schema tags with message 'dataset_empty' so the validator can emit
  // a typed `dataset_empty` issue (PR 3.1a). Callers that want to branch on the empty-dataset case
  // get a stable code instead of pattern-matching on Zod's path/message internals.
  // The 'fx_provenance_required' issue code is deferred to Epic 5 PR 5.x — Phase 1 has zero non-EUR
  // adapter sources to enforce against (per ai-clean-code-adherence audit + ADR-0003).

export type ValidationResult =
  | { ok: true; dataset: PublishedDataset }
  | { ok: false; issues: ReadonlyArray<ValidationIssue> }

export function validatePublishedDataset(input: unknown): ValidationResult {
  const parse = PublishedDataset.safeParse(input)
  if (!parse.success) {
    const issues: ValidationIssue[] = []
    // PR 3.1a: surface the resorts.min(1) failure as a typed `dataset_empty` issue so callers
    // can branch without matching on Zod path/message internals. The schema tags the rule with
    // message 'dataset_empty'; we detect by exact-message equality on a path that targets resorts.
    //
    // Emission ordering contract: when the dataset is empty, this function emits BOTH a
    // `dataset_empty` issue AND a `zod_parse_failed` issue, in that order. `dataset_empty` is
    // pushed FIRST so `issues[0].code === 'dataset_empty'` is reliable for the empty-dataset
    // case, but consumers SHOULD prefer `issues.some((i) => i.code === 'dataset_empty')` over
    // positional indexing to stay forward-compatible with future issue codes that may be
    // co-emitted alongside `zod_parse_failed` (e.g. additional typed surfacings of specific
    // Zod failures). The dual emission is intentional: callers that want the typed branch get
    // the stable code, while callers that want the raw Zod report still get `zod_parse_failed`
    // with the full `zod_issues` array for debugging.
    const isDatasetEmpty = parse.error.issues.some(
      (i): boolean => i.message === EMPTY_DATASET_ZOD_MESSAGE && i.path[0] === 'resorts',
    )
    if (isDatasetEmpty) {
      issues.push({ code: 'dataset_empty' })
    }
    issues.push({
      code: 'zod_parse_failed',
      zod_issues: parse.error.issues.map((i): { path: ReadonlyArray<string | number>; message: string } => ({
        path: i.path,
        message: i.message,
      })),
    })
    return { ok: false, issues }
  }

  const dataset = parse.data
  const issues: ValidationIssue[] = []

  // Manifest count check (cheap, fail-fast).
  if (dataset.manifest.resort_count !== dataset.resorts.length) {
    issues.push({
      code: 'manifest_count_mismatch',
      declared: dataset.manifest.resort_count,
      actual: dataset.resorts.length,
    })
  }

  // METRIC_FIELDS coverage: every populated metric path has a matching field_sources entry.
  for (const resort of dataset.resorts) {
    issues.push(...checkResortFieldSources(resort))
  }
  for (const live of dataset.live_signals) {
    issues.push(...checkLiveSignalFieldSources(live))
  }

  // FX math sanity: when a `fx` block is present (manually authored in Phase 1; adapter-supplied
  // in Epic 5+), confirm `rate * native_amount ≈ Money.amount` within tolerance. The
  // "non-manual + KNOWN_NON_EUR_SOURCES" enforcement branch is deferred to Epic 5 PR 5.x.
  for (const live of dataset.live_signals) {
    issues.push(...checkFxProvenance(live))
  }

  // Envelope ordering: every signal's observed_at must be ≤ published_at.
  // ISODateTimeString allows offset suffixes (Z, +02:00, etc.) per Zod's
  // .datetime({ offset: true }), and ISO strings with different offsets are NOT
  // chronologically sortable lexicographically (e.g. '2026-04-26T19:00:00+02:00' is
  // 17:00 UTC and string-compares > '2026-04-26T18:00:00Z' which is 18:00 UTC, even
  // though the signal is actually earlier than published_at). Compare numeric instants.
  const publishedAtMs = new Date(dataset.published_at).getTime()
  for (const live of dataset.live_signals) {
    if (new Date(live.observed_at).getTime() > publishedAtMs) {
      issues.push({
        code: 'envelope_published_at_before_signal',
        published_at: dataset.published_at,
        signal_observed_at: live.observed_at,
        resort_slug: live.resort_slug,
      })
    }
  }

  return issues.length === 0 ? { ok: true, dataset } : { ok: false, issues }
}

function checkResortFieldSources(resort: Resort): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // Durable METRIC_FIELDS paths (the Resort document carries no live paths)
  const durablePaths: ReadonlyArray<MetricPath> = [
    'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
    'skiable_terrain_ha', 'season.start_month', 'season.end_month',
  ]
  for (const path of durablePaths) {
    if (!(path in resort.field_sources)) {
      issues.push({
        code: 'metric_field_missing_source',
        resort_slug: resort.slug,
        metric_path: path,
        document: 'resort',
      })
    }
  }
  return issues
}

function checkLiveSignalFieldSources(live: ResortLiveSignal): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // One explicit block per live-signal MetricPath (matches metricFields.ts live entries).
  // Each block names its path so a future agent can grep for the exact issue site without
  // chasing through a generic loop. Verified against packages/schema/src/metricFields.ts:
  // the 5 live paths are snow_depth_cm, lifts_open.count, lifts_open.total, lift_pass_day,
  // lodging_sample.median_eur.
  if (live.snow_depth_cm !== undefined && !('snow_depth_cm' in live.field_sources)) {
    issues.push({
      code: 'metric_field_missing_source',
      resort_slug: live.resort_slug,
      metric_path: 'snow_depth_cm',
      document: 'live_signal',
    })
  }
  if (live.lifts_open?.count !== undefined && !('lifts_open.count' in live.field_sources)) {
    issues.push({
      code: 'metric_field_missing_source',
      resort_slug: live.resort_slug,
      metric_path: 'lifts_open.count',
      document: 'live_signal',
    })
  }
  if (live.lifts_open?.total !== undefined && !('lifts_open.total' in live.field_sources)) {
    issues.push({
      code: 'metric_field_missing_source',
      resort_slug: live.resort_slug,
      metric_path: 'lifts_open.total',
      document: 'live_signal',
    })
  }
  if (live.lift_pass_day !== undefined && !('lift_pass_day' in live.field_sources)) {
    issues.push({
      code: 'metric_field_missing_source',
      resort_slug: live.resort_slug,
      metric_path: 'lift_pass_day',
      document: 'live_signal',
    })
  }
  if (live.lodging_sample?.median_eur !== undefined && !('lodging_sample.median_eur' in live.field_sources)) {
    issues.push({
      code: 'metric_field_missing_source',
      resort_slug: live.resort_slug,
      metric_path: 'lodging_sample.median_eur',
      document: 'live_signal',
    })
  }
  return issues
}

function checkFxProvenance(live: ResortLiveSignal): ValidationIssue[] {
  // Phase 1 FX block: math-sanity only on manually-authored `fx` provenance.
  // Per ai-clean-code-adherence audit + ADR-0003, the "non-manual + KNOWN_NON_EUR_SOURCES"
  // enforcement branch is deferred to Epic 5 PR 5.x where the first non-EUR adapter lands.
  // Phase 1 has zero non-EUR sources to enforce against; the table that would gate the
  // enforcement does not yet exist. The validator only confirms that any `fx` block already
  // present in the fixture has self-consistent math (rate * native ≈ amount within tolerance).
  const issues: ValidationIssue[] = []
  const moneyPaths: ReadonlyArray<MetricPath> = ['lift_pass_day', 'lodging_sample.median_eur']
  for (const path of moneyPaths) {
    const fs: FieldSource | undefined = live.field_sources[path]
    if (fs === undefined) {
      continue // METRIC_FIELDS-coverage rule above handles missing-source case
    }
    if (fs.fx !== undefined) {
      const moneyValue =
        path === 'lift_pass_day'
          ? live.lift_pass_day?.amount
          : live.lodging_sample?.median_eur.amount
      if (moneyValue !== undefined) {
        const expected = fs.fx.rate * fs.fx.native_amount
        if (Math.abs(expected - moneyValue) > 1.0) {
          issues.push({
            code: 'fx_provenance_invalid',
            resort_slug: live.resort_slug,
            metric_path: path,
            reason: `FX math: rate=${String(fs.fx.rate)} × native=${String(fs.fx.native_amount)} = ${expected.toFixed(2)} EUR, but Money.amount=${String(moneyValue)} EUR (Δ > 1.0)`,
          })
        }
      }
    }
  }
  return issues
}

