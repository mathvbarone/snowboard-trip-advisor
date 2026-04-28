import { loadResortDatasetFromObject, type LoadResult } from '@snowboard-trip-advisor/schema'

import { DatasetFetchError } from './errors'

// Browser-side fetch + validate + project pipeline (spec §4.2). The path
// '/data/current.v1.json' is served by datasetPlugin in dev (PR 3.1b) and
// by the Epic 6 nginx config in prod (per spec §10.2 contract). The
// returned promise resolves to either { ok: true, views } or { ok: false,
// issues } — the validator-failure path uses the same LoadResult union
// the schema package exports.
//
// Three failure axes thrown as DatasetFetchError:
//   - Network failure (TypeError from fetch)        → kind: 'fetch'
//   - HTTP non-2xx                                  → kind: 'fetch', status
//   - Body present but not valid JSON               → kind: 'parse', status
//
// Validation failures are NOT thrown — they return as { ok: false, issues }
// so useDataset can wrap them in a DatasetValidationError once it has
// instance-of-able typing.

export async function fetchDataset(now: Date = new Date()): Promise<LoadResult> {
  let res: Response
  try {
    res = await fetch('/data/current.v1.json', {
      cache: 'no-cache',
      referrerPolicy: 'no-referrer',
    })
  } catch (cause) {
    throw new DatasetFetchError('Network error', 'fetch', undefined, { cause })
  }
  if (!res.ok) {
    throw new DatasetFetchError(`HTTP ${String(res.status)}`, 'fetch', res.status)
  }
  let raw: unknown
  try {
    raw = await res.json()
  } catch (cause) {
    throw new DatasetFetchError('Malformed JSON', 'parse', res.status, { cause })
  }
  return loadResortDatasetFromObject(raw, { now })
}
