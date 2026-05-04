import {
  Button,
  Card,
  EmptyStateLayout,
  Select,
  Skeleton,
  Table,
  type TableColumn,
  type TableRow,
} from '@snowboard-trip-advisor/design-system'
import { ISOCountryCode, ResortSlug } from '@snowboard-trip-advisor/schema'
import type {
  ListResortsQuery,
  ListResortsResponse,
  ResortSummary,
} from '@snowboard-trip-advisor/schema/api'
import { useMemo, useState, type JSX } from 'react'

import { useResortList } from '../state/useResortList'
import { setRoute, useURLState } from '../state/useURLState'

// Mirrors Dashboard.tsx structure: sub-components (skeleton, error panel,
// empty states, content table) feed the exported view, which branches on
// useResortList()'s { value, error } returns.
//
// Sort state is component-local (sort is a UX preference, not shareable
// state — plan §2.4 sketch). Filter state is in URL via setRoute /
// useURLState (the URL is the source of truth so a deep link reproduces
// the filter; a sibling component can also drive the filter via setRoute
// and this component will re-render via the useSyncExternalStore subscriber
// fan-out in useURLState).
//
// The country filter dropdown is derived from the loaded items' unique
// country set. For an empty workspace the Select shows only "All
// countries" — there's nothing to filter against until a resort exists.

// ---------------------------------------------------------------------------
// Constants — sort key set + display formatter
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'failed_field_count'
type SortDir = 'asc' | 'desc'

interface SortState {
  readonly key: SortKey
  readonly dir: SortDir
}

const DEFAULT_SORT: SortState = { key: 'name', dir: 'asc' }

// Match Dashboard.tsx's formatLastPublished — local Intl.DateTimeFormat is
// the inline equivalent (the design-system format.ts has no date helper).
function formatLastUpdated(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResortsTableSkeleton(): JSX.Element {
  // 6 line-shaped placeholders stand in for visible rows; matches Dashboard's
  // count-balanced skeleton pattern so the loading-to-content transition does
  // not cause layout shift. Each <Skeleton variant="line"> carries
  // role="status" + aria-busy="true" via the design-system primitive.
  return (
    <section aria-label="Loading resorts">
      <Skeleton variant="line" />
      <Skeleton variant="line" />
      <Skeleton variant="line" />
      <Skeleton variant="line" />
      <Skeleton variant="line" />
      <Skeleton variant="line" />
    </section>
  )
}

function ErrorPanel({ error }: { readonly error: Error }): JSX.Element {
  return (
    <section aria-label="Resorts list error" role="alert">
      <Card>
        <p>Failed to load resorts: {error.message}</p>
      </Card>
    </section>
  )
}

function ColdStartEmptyState(): JSX.Element {
  return (
    <section aria-label="No resorts to display">
      <Card>
        <EmptyStateLayout
          heading="No resorts to display"
          body={
            'To add resorts in Phase 1, see the manual-creation instructions in ' +
            'docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md §10.9 ' +
            '(author data/admin-workspace/<slug>.json by hand).'
          }
        />
      </Card>
    </section>
  )
}

function FilteredEmptyState(): JSX.Element {
  return (
    <section aria-label="No resorts match the filter">
      <Card>
        <EmptyStateLayout
          heading="No resorts match the filter"
          body="Try clearing the country filter to see the full resort list."
        />
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Content sub-component — country filter + sortable Table
// ---------------------------------------------------------------------------

interface ResortsTableContentProps {
  readonly value: ListResortsResponse
  readonly country: ISOCountryCode | undefined
}

function ResortsTableContent({ value, country }: ResortsTableContentProps): JSX.Element {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

  // Derive country options from the loaded items' unique country codes.
  // Always prepend "All countries" (value: '') so the user can clear the
  // filter without typing anything. Sorted alphabetically for a stable UX.
  const countryOptions = useMemo((): ReadonlyArray<{ value: string; label: string }> => {
    const unique = Array.from(new Set(value.items.map((it): string => it.country))).sort()
    return [{ value: '', label: 'All countries' }, ...unique.map((c): { value: string; label: string } => ({ value: c, label: c }))]
  }, [value.items])

  // Apply local sort. Filter is applied server-side via the query, so the
  // items array is already filtered by the time it arrives.
  const sortedItems = useMemo((): ReadonlyArray<ResortSummary> => {
    const items = [...value.items]
    if (sort.key === 'name') {
      items.sort((a, b): number => a.name.en.localeCompare(b.name.en))
    } else {
      items.sort((a, b): number => a.failed_field_count - b.failed_field_count)
    }
    if (sort.dir === 'desc') {
      items.reverse()
    }
    return items
  }, [value.items, sort])

  function toggleSort(key: SortKey): void {
    setSort((prev): SortState => {
      if (prev.key !== key) {
        return { key, dir: 'asc' }
      }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  function sortIndicator(key: SortKey): string {
    if (sort.key !== key) {
      return ''
    }
    return sort.dir === 'asc' ? ' ↑' : ' ↓'
  }

  const columns: ReadonlyArray<TableColumn> = [
    {
      key: 'name',
      label: (
        <Button variant="ghost" onClick={(): void => { toggleSort('name') }}>
          {`Name${sortIndicator('name')}`}
        </Button>
      ),
    },
    { key: 'country', label: 'Country' },
    { key: 'last_updated', label: 'Last updated' },
    { key: 'stale_field_count', label: 'Stale fields' },
    {
      key: 'failed_field_count',
      label: (
        <Button variant="ghost" onClick={(): void => { toggleSort('failed_field_count') }}>
          {`Failed fields${sortIndicator('failed_field_count')}`}
        </Button>
      ),
    },
    { key: 'publish_state', label: 'Publish state' },
  ]

  const rows: ReadonlyArray<TableRow> = sortedItems.map((item): TableRow => ({
    key: item.slug,
    // header is the row-header cell (rendered as <th scope="row"> by the
    // Table primitive); cells[] are the row-data <td>s in column order. The
    // Name column doesn't appear in cells[] because it's the row-header —
    // the column ordering is: Name(rowheader) | Country | Last updated |
    // Stale fields | Failed fields | Publish state.
    header: item.name.en,
    cells: [
      item.country,
      formatLastUpdated(item.last_updated),
      String(item.stale_field_count),
      String(item.failed_field_count),
      item.publish_state,
    ],
  }))

  function onCountryChange(next: string): void {
    if (next === '') {
      // Clearing the filter: emit the resorts route without country.
      // PR 4.3 does not surface a hasFailures toggle UI, so the route
      // emitted here is intentionally country-only — PR 4.4+ extends this
      // when the failure-only filter chip lands.
      setRoute({ route: 'resorts' })
      return
    }
    // ISOCountryCode.parse validates + brands the option value. The Select
    // is constrained to country codes drawn from already-branded resort
    // items, so .parse will succeed; the brand-cast ESLint rule (BRAND_CAST)
    // forbids `as ISOCountryCode`, so .parse is the only path.
    setRoute({ route: 'resorts', country: ISOCountryCode.parse(next) })
  }

  return (
    <section aria-label="Resorts">
      <Select
        label="Country"
        value={country ?? ''}
        options={countryOptions}
        onChange={onCountryChange}
      />
      <Table
        caption="Resorts list"
        rowHeaderLabel="Resort"
        columns={columns}
        rows={rows}
        onRowSelect={(rowKey): void => {
          // row.key is the resort.slug — already a branded ResortSlug at the
          // ListResortsResponse.parse boundary upstream. The Table primitive
          // exposes it as a plain string, so re-validate via .parse to
          // restore the brand. ResortSlug.parse never throws here because
          // the regex matches by construction; the brand-cast ESLint rule
          // (BRAND_CAST) forbids `as ResortSlug`, so .parse is the only path.
          setRoute({ route: 'editor', slug: ResortSlug.parse(rowKey) })
        }}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// ResortsTable (exported — App.tsx wires the 'resorts' branch in PR 4.3 §2.5)
// ---------------------------------------------------------------------------

export function ResortsTable(): JSX.Element {
  // App.tsx (PR 4.3 §2.5) only mounts ResortsTable on the 'resorts' branch;
  // off-route mounts default to "no filter" rather than 404 so the view is
  // still safe to render against the dashboard / editor URL shapes during
  // the navigation transition. Phase-1 navigation does not animate, so this
  // window is a single render — but the defensive default keeps the view
  // honest if PR 4.5+ wires it in unexpected places.
  const route = useURLState()
  const country = route.route === 'resorts' ? route.country : undefined

  // Conditional spread satisfies exactOptionalPropertyTypes — the Zod schema
  // declares `filter` and its nested `country` as optional, so an explicit
  // `undefined` is a type error. PR 4.3 only surfaces the country filter;
  // hasFailures has no UI control yet (PR 4.4+ adds the failure-only chip).
  const query: ListResortsQuery = {
    ...(country !== undefined ? { filter: { country } } : {}),
    page: { offset: 0, limit: 50 },
  }

  const { value, error } = useResortList(query)

  if (error !== null) {
    return <ErrorPanel error={error} />
  }
  if (value === null) {
    return <ResortsTableSkeleton />
  }
  if (value.items.length === 0) {
    if (country !== undefined) {
      return <FilteredEmptyState />
    }
    return <ColdStartEmptyState />
  }
  return <ResortsTableContent value={value} country={country} />
}
