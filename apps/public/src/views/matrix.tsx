import {
  EmptyStateLayout,
  Table,
  type TableColumn,
  type TableRow,
} from '@snowboard-trip-advisor/design-system'
import { METRIC_FIELDS, type ResortView } from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

import { useDataset } from '../state/useDataset'
import { useMediaQuery } from '../state/useMediaQuery'
import { useShortlist } from '../state/useShortlist'
import { useURLState } from '../state/useURLState'

import styles from './matrix.module.css'
import { METRIC_LABELS, METRIC_RENDERERS } from './matrixRenderers'

// MatrixView — comparison-table view across the URL-shared shortlist.
//
// Three rendering paths:
//   1. Viewport <md (matchMedia matches '(max-width: 899.98px)'):
//      redirect EmptyState message — matrix at narrow widths is unreadable
//      (spec §3.3 calls out the <md redirect distinct from the <lg drawer
//      downgrade rule that lives in matrix.module.css).
//   2. Empty shortlist: "Add resorts to compare" EmptyState. The user has
//      no in-route control to populate it; star buttons live on cards.
//   3. Populated: a Table with one column per shortlisted resort and one
//      row per METRIC_FIELDS entry. Unknown slugs (URL-rot) are silently
//      dropped. `&highlight=<METRIC_FIELDS_entry>` flags the matching row
//      via Table's `data-highlighted` attribute.
//
// Per-cell rendering lives in matrixRenderers.ts (sibling module so the
// never_fetched branches stay testable without coverage exclusions —
// the published seed dataset populates every metric).

const MD_REDIRECT_QUERY = '(max-width: 899.98px)'

export default function MatrixView(): JSX.Element {
  const isNarrow = useMediaQuery(MD_REDIRECT_QUERY)
  const url = useURLState()
  const { shortlist } = useShortlist()
  const { views } = useDataset()

  if (isNarrow) {
    return (
      <section data-region="matrix-redirect">
        <EmptyStateLayout
          heading="Wider screen needed"
          body="Matrix view requires a wider screen — try cards view or rotate your device."
        />
      </section>
    )
  }

  if (shortlist.length === 0) {
    return (
      <section data-region="matrix-empty">
        <EmptyStateLayout
          heading="Add resorts to compare"
          body="Star resorts in cards view to populate the matrix."
        />
      </section>
    )
  }

  // Project shortlist slugs → ResortView, dropping URL-rot (slugs absent
  // from the dataset). Order is preserved from the URL.
  const bySlug = new Map<string, ResortView>(
    views.map((v): readonly [string, ResortView] => [v.slug, v]),
  )
  const resolved: ResortView[] = []
  for (const slug of shortlist) {
    const view = bySlug.get(slug)
    if (view !== undefined) {
      resolved.push(view)
    }
  }

  const columns: ReadonlyArray<TableColumn> = resolved.map(
    (view): TableColumn => ({ key: view.slug, label: view.name.en }),
  )

  const rows: ReadonlyArray<TableRow> = METRIC_FIELDS.map(
    (path): TableRow => ({
      key: path,
      header: METRIC_LABELS[path],
      cells: resolved.map((view): string => METRIC_RENDERERS[path](view)),
      highlighted: url.highlight === path,
    }),
  )

  return (
    <section
      className={styles.matrix}
      data-region="matrix-table"
      // Spec §3.3 drawer-on-matrix downgrade: matrix.module.css scopes its
      // single-column flow to `.matrix[data-detail-open]` under @media
      // (max-width: 1279.98px). The attribute is set HERE (not on App.tsx)
      // so the CSS-module hashed class and the attribute live on the same
      // node — App.tsx's lazy-import lines stay frozen per spec §5.5.
      data-detail-open={url.detail !== undefined ? '' : undefined}
    >
      <Table caption="Resort comparison matrix" columns={columns} rows={rows} />
    </section>
  )
}
