import type { MetricPath } from '@snowboard-trip-advisor/schema'

import { useResortDetail } from './useResortDetail'
import { useURLState } from './useURLState'
import { useWorkspaceState } from './useWorkspaceState'

// PR 4.4d Task 4 — useModeToggle. Thin wrapper over useWorkspaceState that
// derives slug + validPaths internally and inverts current mode on toggle.
//
// Per Decision D7: slug derived from useURLState() — call sites pass no
// arg. Per Codex round-1 P2-1: validPaths = Object.keys(resort.field_sources)
// (durable subset) so toggling a live-only path silently no-ops instead of
// PUT-rejecting from the WorkspaceFile cross-key invariant. Per Codex
// round-3 P1-1: modeFor falls back to canonical projection's
// `field_states[path].state === 'manual'` when the draft has no override
// — without this, every reload-after-save renders MANUAL paths as AUTO and
// the Tier 3 → 4 gate fails. Per Codex round-23 P2-32: field_states is
// `partialRecord` so use optional-chain (`?.state`) under
// `noUncheckedIndexedAccess`.

export interface UseModeToggleHandle {
  readonly toggleMode: (path: MetricPath) => void
  readonly modeFor: (path: MetricPath) => 'manual' | 'auto'
}

export function useModeToggle(): UseModeToggleHandle {
  const route = useURLState()
  if (route.route !== 'editor') {
    throw new Error('useModeToggle called outside the editor route')
  }
  const detail = useResortDetail(route.slug)
  const validPaths: ReadonlySet<MetricPath> = new Set(
    Object.keys(detail.resort.field_sources) as ReadonlyArray<MetricPath>,
  )

  const { draft, setMode } = useWorkspaceState()

  function canonicalModeFor(path: MetricPath): 'manual' | 'auto' {
    return detail.field_states[path]?.state === 'manual' ? 'manual' : 'auto'
  }

  function modeFor(path: MetricPath): 'manual' | 'auto' {
    return draft.editor_modes[path] ?? canonicalModeFor(path)
  }

  function toggleMode(path: MetricPath): void {
    if (!validPaths.has(path)) { return }
    const current = modeFor(path)
    setMode(path, current === 'manual' ? 'auto' : 'manual')
  }

  return { toggleMode, modeFor }
}
