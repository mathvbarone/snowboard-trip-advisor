import type { FieldValue } from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

import { FORMATTERS, type FormatterKey } from '../format'
import { InfoGlyph } from '../icons/ui/info'
import { Tooltip } from '../primitives/Tooltip'

import { Pill } from './Pill'
import { SourceBadge } from './SourceBadge'

// FieldValueRenderer<T> — renders the three FieldValue<T> states. Designed
// for `<ResortCard>`'s metric rows (durable + live):
//
//  - `fresh`         → formatted value + SourceBadge + observed_at tooltip
//  - `stale`         → same + <Pill variant="stale"> + age-days tooltip
//  - `never_fetched` → missingLabel (default "—") + optional missingTooltip
//
// `formatter` is a typed-key string into the FORMATTERS map exported from
// `../format` — never a function prop. This keeps formatter implementations
// centralized in `format.ts` (PR 3.1c) and lets ResortCard / DetailDrawer
// call sites pick the right formatter without re-implementing it.

type FormatterValue<K extends FormatterKey> = Parameters<
  typeof FORMATTERS[K]
>[0]

export interface FieldValueRendererProps<K extends FormatterKey> {
  field: FieldValue<FormatterValue<K>>
  formatter: K
  /** Optional unit suffix appended to the formatted value (e.g. "km", "cm"). */
  unit?: string
  /** Placeholder rendered in the never_fetched state; defaults to "—". */
  missingLabel?: string
  /** Optional tooltip body for the never_fetched state. */
  missingTooltip?: string
}

const DEFAULT_MISSING_LABEL = '—'

export function FieldValueRenderer<K extends FormatterKey>({
  field,
  formatter,
  unit,
  missingLabel = DEFAULT_MISSING_LABEL,
  missingTooltip,
}: FieldValueRendererProps<K>): JSX.Element {
  if (field.state === 'never_fetched') {
    return renderMissing(missingLabel, missingTooltip)
  }
  // field is `fresh` or `stale`. Both have value/source/observed_at.
  const fmt = FORMATTERS[formatter] as (v: FormatterValue<K>) => string
  const text = fmt(field.value)
  const display = unit !== undefined ? `${text} ${unit}` : text
  return (
    <span className="sta-field-value" data-state={field.state}>
      <span className="sta-field-value__text">{display}</span>
      {field.state === 'stale' ? (
        <Pill variant="stale">{`${String(Math.round(field.age_days))}d ago`}</Pill>
      ) : null}
      <SourceBadge source={field.source} />
      <Tooltip content={tooltipBody(field)}>
        <button
          type="button"
          className="sta-field-value__info"
          aria-label={`Provenance: ${field.source}, ${field.observed_at}`}
        >
          <InfoGlyph size={12} />
        </button>
      </Tooltip>
    </span>
  )
}

function renderMissing(
  missingLabel: string,
  missingTooltip: string | undefined,
): JSX.Element {
  if (missingTooltip === undefined) {
    return (
      <span className="sta-field-value" data-state="never_fetched">
        <span className="sta-field-value__text">{missingLabel}</span>
      </span>
    )
  }
  return (
    <span className="sta-field-value" data-state="never_fetched">
      <Tooltip content={missingTooltip}>
        <button
          type="button"
          className="sta-field-value__missing"
          aria-label={`Missing data: ${missingTooltip}`}
        >
          {missingLabel}
        </button>
      </Tooltip>
    </span>
  )
}

function tooltipBody(
  field: { state: 'fresh' | 'stale'; observed_at: string; source: string }
    & ({ state: 'fresh' } | { state: 'stale'; age_days: number }),
): string {
  // `field` is the discriminated `fresh | stale` subset; the type narrowing
  // below mirrors the FieldValue<T> union shape.
  if (field.state === 'stale') {
    return `Observed ${field.observed_at} (${String(Math.round(field.age_days))} days ago)`
  }
  return `Observed ${field.observed_at}`
}
