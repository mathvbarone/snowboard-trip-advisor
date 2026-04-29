import { METRIC_FIELDS, type MetricPath } from '@snowboard-trip-advisor/schema'
import { z } from 'zod'

// URL state is the source of truth for shareable user state per spec §2.1
// + §3.1. Defaults are omitted on serialize; unknown keys are ignored;
// invalid values are dropped silently and the URL is rewritten to its
// valid subset on the same render commit.
//
// View values are restricted to 'cards' | 'matrix' — 'detail' is an
// overlay key (&detail=<slug>), not a view (parent §2.1 deviation per
// spec §1.1).

// Exported so adjacent consumers (e.g. useShortlist's localStorage hydration)
// validate against the same shape. Keeping a single source of truth for the
// slug shape prevents stored values from being promoted into the URL with
// characters URLSearchParams would reinterpret as a separator.
export const SLUG_REGEX = /^[a-z0-9-]{1,64}$/
const COUNTRY_REGEX = /^[A-Z]{2}$/

export const VIEW_VALUES = ['cards', 'matrix'] as const
export const SORT_VALUES = ['name', 'price_asc', 'price_desc', 'snow_depth_desc'] as const

export type ViewValue = typeof VIEW_VALUES[number]
export type SortValue = typeof SORT_VALUES[number]

export type URLState = {
  view: ViewValue
  sort: SortValue
  country: ReadonlyArray<string>
  shortlist: ReadonlyArray<string>
  detail?: string
  highlight?: MetricPath
}

const SHORTLIST_MAX = 6                                    // head-truncation; spec §3.1

// Serialize order matches the parent-spec §2.1 reading order so URL diffs
// in PRs stay readable.
const SERIALIZE_ORDER: ReadonlyArray<keyof URLState> = [
  'view', 'sort', 'country', 'shortlist', 'detail', 'highlight',
]

// PUSH_KEYS drives history-transition selection in setURLState (spec §3.7).
// view + detail are PUSH (back-button can close the drawer / return to
// previous view); the rest are REPLACE (sort/filter changes do not pollute
// the back stack).
export const PUSH_KEYS: ReadonlyArray<keyof URLState> = ['view', 'detail']

// Zod schemas used by parseURL for value-by-value validation. Failures
// are dropped silently; tests assert each branch.
const ViewSchema = z.enum(VIEW_VALUES)
const SortSchema = z.enum(SORT_VALUES)
const SlugSchema = z.string().regex(SLUG_REGEX)
const CountrySchema = z.string().regex(COUNTRY_REGEX)
const HighlightSchema = z.enum(METRIC_FIELDS as readonly [MetricPath, ...MetricPath[]])

export const URLStateSchema = z.object({
  view: ViewSchema.default('cards'),
  sort: SortSchema.default('name'),
  country: z.array(CountrySchema).default([]),
  shortlist: z.array(SlugSchema).default([]),
  detail: SlugSchema.optional(),
  highlight: HighlightSchema.optional(),
})

type DebugFailure = { key: keyof URLState; value: string }

function logFailure(failure: DebugFailure): void {
  // Dev-only failure log via window.__sta_debug.urlParseFailures (spec §3.2).
  // Zero prod runtime cost; no `console` rule violation.
  if (!import.meta.env.DEV) {
    return
  }
  const debug = (window.__sta_debug ??= {})
  const list = debug.urlParseFailures ?? []
  debug.urlParseFailures = [...list, failure]
}

declare global {
  interface Window {
    __sta_debug?: { urlParseFailures?: ReadonlyArray<unknown> }
  }
}

export function parseURL(search: string): URLState {
  const params = new URLSearchParams(search)

  const rawView = params.get('view')
  const view = rawView !== null
    ? ViewSchema.safeParse(rawView).data ?? logAndDefault('view', rawView, 'cards')
    : 'cards'

  const rawSort = params.get('sort')
  const sort = rawSort !== null
    ? SortSchema.safeParse(rawSort).data ?? logAndDefault('sort', rawSort, 'name')
    : 'name'

  const country = parseCsv(params.get('country'), 'country', CountrySchema)

  const rawShortlist = parseCsv(params.get('shortlist'), 'shortlist', SlugSchema)
  const shortlist = rawShortlist.slice(0, SHORTLIST_MAX)

  const rawDetail = params.get('detail')
  const detail = rawDetail !== null ? validateOrLog('detail', rawDetail, SlugSchema) : undefined

  const rawHighlight = params.get('highlight')
  const highlight = rawHighlight !== null
    ? validateOrLog('highlight', rawHighlight, HighlightSchema)
    : undefined

  const state: URLState = { view, sort, country, shortlist }
  if (detail !== undefined) {
    state.detail = detail
  }
  if (highlight !== undefined) {
    state.highlight = highlight
  }
  return state
}

function logAndDefault<T>(key: keyof URLState, value: string, fallback: T): T {
  logFailure({ key, value })
  return fallback
}

function validateOrLog<T>(
  key: keyof URLState,
  value: string,
  schema: z.ZodType<T>,
): T | undefined {
  const result = schema.safeParse(value)
  if (result.success) {
    return result.data
  }
  logFailure({ key, value })
  return undefined
}

function parseCsv<T>(
  raw: string | null,
  key: keyof URLState,
  schema: z.ZodType<T>,
): T[] {
  if (raw === null) {
    return []
  }
  const out: T[] = []
  for (const part of raw.split(',')) {
    const result = schema.safeParse(part)
    if (result.success) {
      out.push(result.data)
    } else {
      logFailure({ key, value: part })
    }
  }
  return out
}

export function serializeURL(state: URLState): string {
  const out: string[] = []
  for (const key of SERIALIZE_ORDER) {
    const piece = serializePiece(key, state)
    if (piece !== undefined) {
      out.push(piece)
    }
  }
  return out.join('&')
}

function serializePiece(key: keyof URLState, state: URLState): string | undefined {
  if (key === 'view') {
    return state.view !== 'cards' ? `view=${state.view}` : undefined
  }
  if (key === 'sort') {
    return state.sort !== 'name' ? `sort=${state.sort}` : undefined
  }
  if (key === 'country') {
    return state.country.length > 0 ? `country=${state.country.join(',')}` : undefined
  }
  if (key === 'shortlist') {
    const truncated = state.shortlist.slice(0, SHORTLIST_MAX)
    return truncated.length > 0 ? `shortlist=${truncated.join(',')}` : undefined
  }
  if (key === 'detail') {
    return state.detail !== undefined ? `detail=${state.detail}` : undefined
  }
  // key === 'highlight'
  return state.highlight !== undefined ? `highlight=${state.highlight}` : undefined
}
