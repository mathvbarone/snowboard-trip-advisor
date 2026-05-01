// scripts/check-dist-dataset.ts — sanity-checks the published-dataset envelope
// of `dist/data/current.v1.json`. Verifies the file exists at the
// nginx-contracted path (spec §10.2) and parses with the five top-level
// keys the runtime expects.
//
// This is a smoke check, NOT full schema validation. Full Zod validation
// already runs at publish time (`validatePublishedDataset`) — re-running it
// here would drag the whole `packages/schema` graph into a script-only path.
// The five keys + their primitive types are enough to catch the deploy
// failures this gate exists to prevent: missing file, unrelated JSON
// pasted into the slot, Vite-side schema drift on the envelope itself.
//
// Side-effect entry point lives in `./check-dist-dataset.cli.ts`.

export type EnvelopeCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

const REQUIRED_KEYS = [
  'schema_version',
  'published_at',
  'resorts',
  'live_signals',
  'manifest',
] as const

export function validateDatasetEnvelope(value: unknown): EnvelopeCheckResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'envelope is not an object' }
  }
  const record = value as Record<string, unknown>
  for (const key of REQUIRED_KEYS) {
    if (!(key in record)) {
      return { ok: false, reason: `envelope missing required key: ${key}` }
    }
  }
  if (record['schema_version'] !== 1) {
    return {
      ok: false,
      reason: `envelope schema_version is not 1 (got ${String(record['schema_version'])})`,
    }
  }
  if (typeof record['published_at'] !== 'string') {
    return { ok: false, reason: 'envelope published_at is not a string' }
  }
  if (!Array.isArray(record['resorts'])) {
    return { ok: false, reason: 'envelope resorts is not an array' }
  }
  if (!Array.isArray(record['live_signals'])) {
    return { ok: false, reason: 'envelope live_signals is not an array' }
  }
  const manifest = record['manifest']
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest)
  ) {
    return { ok: false, reason: 'envelope manifest is not an object' }
  }
  return { ok: true }
}
