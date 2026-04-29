import { Button, Modal } from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

import { useDataset } from '../state/useDataset'
import { useShortlist } from '../state/useShortlist'

// Spec §3.5 + plan step 5.6 contract:
//   - Reads `pendingCollision` from `useShortlist()`. The dialog is
//     fully self-driven — App.tsx mounts it once and the hook gates
//     visibility.
//   - `<form onSubmit>` wraps the action group so pressing Enter inside
//     the dialog submits the default action (Merge — preserves the
//     most user intent and is reversible by Replace + Keep mine).
//   - Three buttons:
//       Merge   → useShortlist().merge() (URL ∪ stored, URL order first)
//       Replace → useShortlist().acceptUrl() (URL stays as-is)
//       Keep mine → useShortlist().keepStored() (stored → URL)
//   - Preview list shows the merged shortlist (URL first, stored extras
//     after) with each row rendering the dataset's resort display name
//     (slug fallback for unknown entries — mirrors ShortlistDrawer).
//
// The Modal primitive provides focus trap, body scroll lock, Escape
// dismiss (Escape maps to Replace = keep what's in the URL = the user's
// share-link intent).
//
// `useDataset()` is suspendful; App.tsx mounts MergeReplaceDialog inside
// the same `<Suspense fallback={<DatasetLoading />}>` that wraps
// AppContent, so the suspension is captured by the existing boundary.

export default function MergeReplaceDialog(): JSX.Element | null {
  const { pendingCollision, acceptUrl, keepStored, merge } = useShortlist()
  const { views } = useDataset()

  if (pendingCollision === null) {
    return null
  }

  const { urlSlugs, storedSlugs } = pendingCollision
  const urlSet = new Set<string>(urlSlugs)
  const mergedPreview = [
    ...urlSlugs,
    ...storedSlugs.filter((slug): boolean => !urlSet.has(slug)),
  ]
  const slugToName = new Map<string, string>(
    views.map((v): [string, string] => [v.slug, v.name.en]),
  )

  return (
    <Modal
      open
      onOpenChange={(open): void => {
        // Escape / outside-click → Modal calls onOpenChange(false). Map
        // that to Replace (URL wins — the share-link's intent).
        if (!open) {
          acceptUrl()
        }
      }}
      title="Shortlist conflict"
    >
      <form
        className="sta-merge-replace-dialog"
        onSubmit={(event): void => {
          event.preventDefault()
          merge()
        }}
      >
        <p>
          The link you opened has a different shortlist than your saved one.
          Pick how to combine them:
        </p>
        <ul className="sta-merge-replace-dialog__preview" data-testid="merge-preview">
          {mergedPreview.map((slug): JSX.Element => (
            <li key={slug}>{slugToName.get(slug) ?? slug}</li>
          ))}
        </ul>
        <div className="sta-merge-replace-dialog__actions">
          {/* Merge is type="submit" so Enter inside the form submits it.
              Clicking the button also fires the form's onSubmit handler
              after the click handler — so merge() runs twice per click.
              That is safe because useShortlist's merge() reads the LIVE
              module-scoped bootstrapCollision (not the closure-captured
              snapshot), so the second call early-returns after the first
              call clears it. Symmetry with Replace / Keep mine motivates
              keeping onClick={merge} here even though onSubmit alone
              would suffice for the Enter path. */}
          <Button type="submit" variant="primary" onClick={merge}>
            Merge
          </Button>
          <Button variant="secondary" onClick={acceptUrl}>
            Replace
          </Button>
          <Button variant="ghost" onClick={keepStored}>
            Keep mine
          </Button>
        </div>
      </form>
    </Modal>
  )
}
