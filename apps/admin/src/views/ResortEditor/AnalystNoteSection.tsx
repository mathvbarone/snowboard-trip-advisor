import { Button, Textarea } from '@snowboard-trip-advisor/design-system'
import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import { renderAnalystNoteMarkdown } from '@snowboard-trip-advisor/schema/markdown'
import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import { flushAllForSlug } from '../../state/flushAll'
import { useAnalystNoteDraft } from '../../state/useAnalystNoteDraft'

// PR N.c4 — AnalystNoteSection (spec §6.2 / §6.3 / §6.6).
//
// LOAD-BEARING lazy boundary (spec §6.6 / §10.4): this module is the ONLY
// place `@snowboard-trip-advisor/schema/markdown` (the ~150 KB `unified`
// renderer chain) is imported across apps/admin/src. FieldRow reaches this
// component exclusively through `React.lazy(() => import('./AnalystNoteSection'))`
// so the renderer chunk is fetched on the first "Notes" expand and never by
// Dashboard / ResortsTable / PublishDialog / PublishHistory. Adding a static
// import of the renderer anywhere reachable from FieldRow (or re-exporting it
// through a barrel that FieldRow pulls) defeats the split — do not.
//
// `export default` (not a named export) so `React.lazy` consumes it directly
// without a `.then(m => ({ default: m.X }))` shim.
//
// Two stacked panes:
//   - Source pane: DS Textarea (monospace, Tab→2 spaces). Edits flow through
//     useAnalystNoteDraft's 500ms debounced autosave.
//   - Preview pane: client-side `renderAnalystNoteMarkdown(draft)` injected via
//     dangerouslySetInnerHTML (spec §6.2 amendment — the renderer's sanitizer
//     allowlist IS the security boundary; this is the only view permitted to
//     consume its string output this way). Debounced ~150ms so the preview
//     tracks typing without rendering on every keystroke.
//
// Keyboard (spec §6.3): mod+enter → flushAllForSlug(slug) (immediate save of
// every dirty path for the slug, matching Shell's onModEnter); Escape →
// collapse (pending edits are already in-flight / about to flush — no explicit
// discard); mod+backspace → delete.

const PREVIEW_DEBOUNCE_MS = 150

export interface AnalystNoteSectionProps {
  readonly slug: ResortSlug
  readonly path: string
  // FieldRow owns the expanded/collapsed state; Escape asks it to collapse.
  // Optional so the component is renderable in isolation (unit tests).
  readonly onCollapse?: () => void
}

export default function AnalystNoteSection({
  slug,
  path,
  onCollapse,
}: AnalystNoteSectionProps): JSX.Element {
  // Codex P2 fold (spec §6.2): the save-status indicator now lives at
  // FieldRow level, adjacent to the 📝 affordance (always mounted), so a
  // flush that fails AFTER this collapsible section unmounts is still
  // visible. It is NOT rendered here anymore — a single indicator (one
  // source of truth) per spec §6.2. `status` is intentionally not read.
  const { draft, setDraft, flushNow, deleteNote } = useAnalystNoteDraft(
    slug,
    path,
  )

  // Client-side preview, debounced ~150ms behind the live draft so the
  // renderer chain doesn't run on every keystroke. Seeded from the current
  // draft so an existing note renders immediately on first mount.
  const [previewSource, setPreviewSource] = useState(draft)
  useEffect((): (() => void) => {
    const timer = setTimeout((): void => {
      setPreviewSource(draft)
    }, PREVIEW_DEBOUNCE_MS)
    return (): void => {
      clearTimeout(timer)
    }
  }, [draft])

  const sourceRef = useRef<HTMLTextAreaElement>(null)

  const onSourceKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 'Enter') {
      e.preventDefault()
      void flushAllForSlug(slug)
      return
    }
    if (mod && e.key === 'Backspace') {
      e.preventDefault()
      void deleteNote()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      // Pending edits are already debounced / in-flight — collapsing does
      // not discard them (spec §6.3). Flush now so a fast Escape doesn't
      // drop a sub-500ms edit, then ask the parent to collapse.
      void flushNow()
      onCollapse?.()
    }
  }

  return (
    <div className="sta-analyst-note">
      <div className="sta-analyst-note__toolbar">
        <Button
          variant="ghost"
          aria-label="Delete note"
          onClick={(): void => {
            void deleteNote()
          }}
        >
          🗑
        </Button>
      </div>
      <Textarea
        ref={sourceRef}
        aria-label="note source"
        value={draft}
        onChange={setDraft}
        onKeyDown={onSourceKeyDown}
      />
      <p className="sta-analyst-note__preview-label">sanitized preview</p>
      <div
        aria-label="sanitized preview of the note above"
        className="sta-analyst-note__preview"
        // Spec §6.2 amendment: renderAnalystNoteMarkdown is the security
        // boundary (sanitizer allowlist in packages/schema). This is the
        // ONLY view permitted to consume its sanitized string output via
        // dangerouslySetInnerHTML — client/server render parity.
        dangerouslySetInnerHTML={{
          __html: renderAnalystNoteMarkdown(previewSource),
        }}
      />
    </div>
  )
}
