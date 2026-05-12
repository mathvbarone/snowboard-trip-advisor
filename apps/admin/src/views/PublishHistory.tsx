// PublishHistory — Tier 4 list view for the admin app's publish archive.
// Reads useListPublishes (PR 4.5c) and renders rows + pagination. The page
// index is sourced from URL state (?route=publishes&page=N), mirroring how
// ResortsTable reads country / hasFailures from the URL — so a deep link is
// a shareable, refresh-stable view of a specific history page.
//
// Root element is <section aria-label="Publish history"> (NOT <main>): Shell
// already wraps children in <main>{children}</main> at views/Shell.tsx;
// nesting another <main> would surface two landmark roles to ATs.
//
// Layout: loading → role="status" + aria-live="polite"; error → role="alert";
// empty (offset 0) → cold-start CTA pointing at the header Publish button;
// empty (offset > 0) → "Back to first page" reset (deep links / stale tabs
// that survive a backfill that shrinks total can land here); populated →
// `<ul>` of entries + a `<nav aria-label="Publish history pagination">`
// holding Previous/Next.

import { Button } from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

import { useListPublishes } from '../state/useListPublishes'
import { setRoute, useURLState } from '../state/useURLState'

const PAGE_SIZE = 20

export function PublishHistory(): JSX.Element {
  const route = useURLState()
  // Graceful degrade if mounted outside the publishes route (App.tsx narrows
  // at the mount site; this fallback covers refactor accidents). Pattern
  // matches ResortsTable's `route.route === 'resorts' ? route.country : undefined`.
  const page = route.route === 'publishes' ? (route.page ?? 0) : 0
  const offset = page * PAGE_SIZE
  const { value, error } = useListPublishes({ page: { offset, limit: PAGE_SIZE } })

  if (error !== null) {
    return (
      <section aria-label="Publish history">
        <h1>Publish history</h1>
        <p role="alert">Could not load publish history: {error.message}</p>
      </section>
    )
  }
  if (value === null) {
    return (
      <section aria-label="Publish history">
        <h1>Publish history</h1>
        <p role="status" aria-live="polite">Loading…</p>
      </section>
    )
  }
  if (value.items.length === 0) {
    if (offset === 0) {
      return (
        <section aria-label="Publish history">
          <h1>Publish history</h1>
          <p>No publishes yet. Use the Publish button in the header to publish for the first time.</p>
        </section>
      )
    }
    return (
      <section aria-label="Publish history">
        <h1>Publish history</h1>
        <p>No publishes on this page.</p>
        <Button onClick={(): void => { setRoute({ route: 'publishes' }) }}>
          Back to first page
        </Button>
      </section>
    )
  }

  return (
    <section aria-label="Publish history">
      <h1>Publish history</h1>
      <ul className="publish-history">
        {value.items.map((item): JSX.Element => (
          <li key={item.version_id}>
            <span>{item.version_id}</span>
            <time dateTime={item.published_at}>{item.published_at}</time>
            <span>{item.resort_count} {item.resort_count === 1 ? 'resort' : 'resorts'}</span>
            <span>by {item.published_by}</span>
          </li>
        ))}
      </ul>
      <nav aria-label="Publish history pagination">
        <Button
          variant="ghost"
          disabled={page === 0}
          onClick={(): void => { setRoute({ route: 'publishes', page: page - 1 }) }}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          disabled={offset + PAGE_SIZE >= value.page.total}
          onClick={(): void => { setRoute({ route: 'publishes', page: page + 1 }) }}
        >
          Next
        </Button>
      </nav>
    </section>
  )
}
