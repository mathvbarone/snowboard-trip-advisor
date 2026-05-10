import {
  ISODateTimeString,
  type FieldState,
  type MetricPath,
} from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

import { FieldRow } from './FieldRow'

// PR 4.4b §7.11 spec deviation: spec lists separate DurablePanel + LivePanel;
// plan collapses to parametrized <MetricPanel kind=…> for file-budget reasons.
// Coverage equivalent — both kinds are exercised through ResortEditor.test.tsx
// mounting both tabs (no separate MetricPanel.test.tsx).
//
// The DURABLE_PATHS / LIVE_PATHS partition is the same one packages/schema's
// projectFieldStates uses (resortView.ts:85-88). Re-listed locally here rather
// than re-exported from schema so the editor view's path-grouping is reviewable
// in isolation; if these ever diverge from projectFieldStates the FieldRow's
// missing-path branch surfaces immediately in the integration test.

const DURABLE_PATHS: ReadonlyArray<MetricPath> = [
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
]

const LIVE_PATHS: ReadonlyArray<MetricPath> = [
  'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
  'lift_pass_day', 'lodging_sample.median_eur',
]

// Defends against the partialRecord typing on ResortDetailResponse.field_states
// (the handler returns a TOTAL 12-key map at runtime, but the wire contract
// types it as partial). When a path is missing, render the row as a failed
// state with `reason: 'no field_sources entry'` — same string the canonical
// projectFieldStates emits for the missing-source case (resortView.ts:120).
function defaultFailedState(): FieldState {
  return {
    state: 'failed',
    reason: 'no field_sources entry',
    observed_at: ISODateTimeString.parse(new Date(0).toISOString()),
  }
}

export interface MetricPanelProps {
  readonly kind: 'durable' | 'live'
  readonly field_states: Partial<Record<MetricPath, FieldState>>
}

export function MetricPanel({ kind, field_states }: MetricPanelProps): JSX.Element {
  const paths = kind === 'durable' ? DURABLE_PATHS : LIVE_PATHS
  const label = kind === 'durable' ? 'Durable metrics' : 'Live metrics'
  return (
    <div role="region" aria-label={label} className="sta-metric-panel" data-kind={kind}>
      {paths.map((path): JSX.Element => {
        const state = field_states[path] ?? defaultFailedState()
        return <FieldRow key={path} path={path} state={state} />
      })}
    </div>
  )
}
