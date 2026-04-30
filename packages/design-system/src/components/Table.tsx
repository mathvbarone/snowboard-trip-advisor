import type { JSX, ReactNode } from 'react'

import './Table.css'

// Minimal headless table primitive — used by the matrix view (PR 3.4) to
// render a comparison table where rows are metrics and columns are
// shortlisted resorts. Spec §5.1 deliberately drops the horizontal-scroll
// affordance: the table renders inline, sticky-header styling lands via
// CSS class only (no inline styles), and overflow is the parent layout's
// responsibility. Highlight is a passive `data-highlighted="true"`
// attribute on the column header / row header / mirrored data cells —
// no JS-driven styling, no aria changes.
//
// Row header is the leftmost cell in each `<tbody>` row (`<th scope="row">`);
// column headers carry `<th scope="col">`. Caption is rendered as a real
// `<caption>` with `sta-visually-hidden` so SR users hear the table label
// without disrupting visual layout.
//
// Cell-array length is intentionally NOT validated against the column
// count — the consumer (matrix view) owns that invariant; widening the
// contract here would require runtime branching for no gain.

export interface TableColumn {
  key: string
  label: ReactNode
  highlighted?: boolean
}

export interface TableRow {
  key: string
  header: ReactNode
  cells: ReadonlyArray<ReactNode>
  highlighted?: boolean
}

export interface TableProps {
  caption: string
  columns: ReadonlyArray<TableColumn>
  rows: ReadonlyArray<TableRow>
  'aria-describedby'?: string
}

export function Table({
  caption,
  columns,
  rows,
  'aria-describedby': ariaDescribedBy,
}: TableProps): JSX.Element {
  // Raw <table> is allowed in design-system (the apps/** ESLint ban does
  // not apply here); this is the canonical wrapper that apps/** consume.
  return (
    <table className="sta-table" aria-describedby={ariaDescribedBy}>
      <caption className="sta-visually-hidden">{caption}</caption>
      <thead>
        <tr>
          {/* Corner header — labels the row-header column (which carries
              metric names). Visually hidden so the table looks "headless"
              in the leftmost column while remaining axe-clean (empty <th>
              violates the empty-table-header rule). */}
          <th scope="col">
            <span className="sta-visually-hidden">Metric</span>
          </th>
          {columns.map((col): JSX.Element => (
            <th
              key={col.key}
              scope="col"
              data-highlighted={col.highlighted === true ? 'true' : undefined}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row): JSX.Element => (
          <tr key={row.key}>
            <th
              scope="row"
              data-highlighted={row.highlighted === true ? 'true' : undefined}
            >
              {row.header}
            </th>
            {row.cells.map((cell, idx): JSX.Element => {
              const colHighlighted = columns[idx]?.highlighted === true
              const rowHighlighted = row.highlighted === true
              const highlighted = colHighlighted || rowHighlighted
              return (
                <td
                  // Cells are positional; the column index is the only stable
                  // identity inside a row. Pairing it with the row key keeps
                  // the React key globally unique without inventing a synthetic
                  // id on the consumer side.
                  key={`${row.key}:${String(idx)}`}
                  data-highlighted={highlighted ? 'true' : undefined}
                >
                  {cell}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
