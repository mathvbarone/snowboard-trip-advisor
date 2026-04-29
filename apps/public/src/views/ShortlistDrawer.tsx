import {
  Button,
  CloseGlyph,
  Drawer,
  IconButton,
} from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

import { useDataset } from '../state/useDataset'
import { useMediaQuery } from '../state/useMediaQuery'
import { useShortlist } from '../state/useShortlist'
import { setURLState } from '../state/useURLState'

// Spec §7.9 — ShortlistDrawer.
//   - Controlled open state (PR 3.4 wires the trigger inside HeaderBar
//     once Shell is composed; PR 3.3 keeps the drawer self-contained
//     with `open` / `onOpenChange` props so tests can mount HeaderBar
//     locally and PR 3.4 has zero amendments to make).
//   - Renders the resort name (looked up from the dataset) for each slug
//     in `useShortlist().shortlist`. Empty state renders guidance copy.
//   - Per-row IconButton removes the slug.
//   - "Open Matrix" CTA is a real `<a>` so PR 3.4's view-toggle URL
//     contract (push-style transition) is unified — clicking pushes
//     `?view=matrix`. Below md the CTA is removed from the tree (NOT
//     `disabled` / `display:none` — the matrix view itself doesn't
//     render below md per §7.10, so a linked-but-broken control would
//     pollute the tab order).

export interface ShortlistDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ShortlistDrawer({
  open,
  onOpenChange,
}: ShortlistDrawerProps): JSX.Element {
  const { shortlist, remove } = useShortlist()
  const { views } = useDataset()
  // Match the same query the spec §6.2 / §7.10 contract uses: 900px = md.
  const isMd = useMediaQuery('(min-width: 900px)')

  const slugToView = new Map(views.map((v): [string, typeof v] => [v.slug, v]))

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Shortlist"
      position="right"
    >
      {shortlist.length === 0 ? (
        <p className="sta-shortlist-drawer__empty">
          No resorts shortlisted yet. Tap the star on a card to add it here.
        </p>
      ) : (
        <ul className="sta-shortlist-drawer__list">
          {shortlist.map((slug): JSX.Element => {
            const view = slugToView.get(slug)
            const name = view !== undefined ? view.name.en : slug
            return (
              <li key={slug} className="sta-shortlist-drawer__row">
                <span className="sta-shortlist-drawer__name">{name}</span>
                <IconButton
                  aria-label={`Remove ${name} from shortlist`}
                  onClick={(): void => {
                    remove(slug)
                  }}
                >
                  <CloseGlyph size={16} />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
      {isMd ? (
        <Button
          variant="secondary"
          onClick={(): void => {
            setURLState({ view: 'matrix' })
            onOpenChange(false)
          }}
        >
          Open Matrix
        </Button>
      ) : null}
    </Drawer>
  )
}
