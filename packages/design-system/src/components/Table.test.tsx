import { render, screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { Table, type TableProps } from './Table'

const COLUMNS: TableProps['columns'] = [
  { key: 'kotelnica', label: 'Kotelnica' },
  { key: 'spindleruv', label: 'Špindlerův' },
]

const ROWS: TableProps['rows'] = [
  { key: 'altitude_m', header: 'Altitude (m)', cells: ['770–920', '715–1,310'] },
  { key: 'snow_depth_cm', header: 'Snow depth (cm)', cells: ['80', '65'] },
]

describe('Table', (): void => {
  it('renders a real <table> element with the design-system class', (): void => {
    const { container } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table).toHaveClass('sta-table')
  })

  it('renders the caption (visually-hidden via the design-system utility class)', (): void => {
    render(<Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />)
    const caption = screen.getByText('Resort comparison')
    expect(caption.tagName.toLowerCase()).toBe('caption')
    expect(caption).toHaveClass('sta-visually-hidden')
  })

  it('renders one <th scope="col"> per data column (plus a visually-hidden corner cell)', (): void => {
    const { container } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    const allColHeaders = container.querySelectorAll('thead th[scope="col"]')
    // Corner cell + 2 data columns. Corner carries visually-hidden text so
    // axe's empty-table-header rule doesn't fire (consumers see no visible
    // label in the leftmost column).
    expect(allColHeaders).toHaveLength(3)
    const corner = allColHeaders[0]
    expect(corner).not.toBeNull()
    expect(corner?.querySelector('.sta-visually-hidden')).not.toBeNull()

    const dataHeaders = Array.from(allColHeaders).slice(1)
    expect(dataHeaders[0]).toHaveTextContent('Kotelnica')
    expect(dataHeaders[1]).toHaveTextContent('Špindlerův')
  })

  it('uses the default "Row" label on the visually-hidden corner cell', (): void => {
    const { container } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    const corner = container.querySelector('thead th[scope="col"]')
    expect(corner?.querySelector('.sta-visually-hidden')).toHaveTextContent('Row')
  })

  it('overrides the corner-cell label when rowHeaderLabel is supplied', (): void => {
    const { container } = render(
      <Table
        caption="Resort comparison"
        columns={COLUMNS}
        rows={ROWS}
        rowHeaderLabel="Metric"
      />,
    )
    const corner = container.querySelector('thead th[scope="col"]')
    expect(corner?.querySelector('.sta-visually-hidden')).toHaveTextContent('Metric')
  })

  it('renders one <th scope="row"> per row (leftmost cell)', (): void => {
    render(<Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />)
    const rowHeaders = screen.getAllByRole('rowheader')
    expect(rowHeaders).toHaveLength(2)
    expect(rowHeaders[0]).toHaveAttribute('scope', 'row')
    expect(rowHeaders[0]).toHaveTextContent('Altitude (m)')
    expect(rowHeaders[1]).toHaveTextContent('Snow depth (cm)')
  })

  it('renders <td> for each data cell in each row', (): void => {
    const { container } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    const cells = container.querySelectorAll('tbody td')
    expect(cells).toHaveLength(4)
    expect(cells[0]).toHaveTextContent('770–920')
    expect(cells[1]).toHaveTextContent('715–1,310')
    expect(cells[2]).toHaveTextContent('80')
    expect(cells[3]).toHaveTextContent('65')
  })

  it('toggles data-highlighted on the column header when columns[i].highlighted flips', (): void => {
    const { container, rerender } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    // Skip the corner cell at index 0 — only data columns carry highlight.
    const initialDataHeaders = Array.from(
      container.querySelectorAll('thead th[scope="col"]'),
    ).slice(1)
    expect(initialDataHeaders[0]).not.toHaveAttribute('data-highlighted')

    rerender(
      <Table
        caption="Resort comparison"
        columns={[
          { key: 'kotelnica', label: 'Kotelnica', highlighted: true },
          { key: 'spindleruv', label: 'Špindlerův' },
        ]}
        rows={ROWS}
      />,
    )
    const dataHeaders = Array.from(
      container.querySelectorAll('thead th[scope="col"]'),
    ).slice(1)
    expect(dataHeaders[0]).toHaveAttribute('data-highlighted', 'true')
    expect(dataHeaders[1]).not.toHaveAttribute('data-highlighted')
  })

  it('mirrors a column highlight onto every <td> in that column', (): void => {
    const { container } = render(
      <Table
        caption="Resort comparison"
        columns={[
          { key: 'kotelnica', label: 'Kotelnica', highlighted: true },
          { key: 'spindleruv', label: 'Špindlerův' },
        ]}
        rows={ROWS}
      />,
    )
    const rows = container.querySelectorAll('tbody tr')
    for (const row of rows) {
      const cells = within(row as HTMLElement).getAllByRole('cell')
      expect(cells[0]).toHaveAttribute('data-highlighted', 'true')
      expect(cells[1]).not.toHaveAttribute('data-highlighted')
    }
  })

  it('toggles data-highlighted on the row header when rows[i].highlighted flips', (): void => {
    const { container, rerender } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    const initialRowHeaders = container.querySelectorAll('tbody th[scope="row"]')
    expect(initialRowHeaders[0]).not.toHaveAttribute('data-highlighted')

    rerender(
      <Table
        caption="Resort comparison"
        columns={COLUMNS}
        rows={[
          { key: 'altitude_m', header: 'Altitude (m)', cells: ['770–920', '715–1,310'] },
          {
            key: 'snow_depth_cm',
            header: 'Snow depth (cm)',
            cells: ['80', '65'],
            highlighted: true,
          },
        ]}
      />,
    )
    const rowHeaders = container.querySelectorAll('tbody th[scope="row"]')
    expect(rowHeaders[0]).not.toHaveAttribute('data-highlighted')
    expect(rowHeaders[1]).toHaveAttribute('data-highlighted', 'true')
  })

  it('mirrors a row highlight onto every <td> in that row', (): void => {
    const { container } = render(
      <Table
        caption="Resort comparison"
        columns={COLUMNS}
        rows={[
          {
            key: 'altitude_m',
            header: 'Altitude (m)',
            cells: ['770–920', '715–1,310'],
            highlighted: true,
          },
          { key: 'snow_depth_cm', header: 'Snow depth (cm)', cells: ['80', '65'] },
        ]}
      />,
    )
    const rows = container.querySelectorAll('tbody tr')
    const firstRowCells = within(rows[0] as HTMLElement).getAllByRole('cell')
    for (const cell of firstRowCells) {
      expect(cell).toHaveAttribute('data-highlighted', 'true')
    }
    const secondRowCells = within(rows[1] as HTMLElement).getAllByRole('cell')
    for (const cell of secondRowCells) {
      expect(cell).not.toHaveAttribute('data-highlighted')
    }
  })

  it('does NOT render any horizontal-scroll wrapper / affordance (spec §5.1)', (): void => {
    const { container } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    // The table itself must be the root element rendered by the component;
    // no overflow / scroll wrapper around it.
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('table')
    expect(container.querySelector('[data-overflow]')).toBeNull()
    expect(container.querySelector('.sta-table-scroll')).toBeNull()
  })

  it('forwards aria-describedby onto the <table> element', (): void => {
    const { container } = render(
      <>
        <p id="desc">Comparison data</p>
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          aria-describedby="desc"
        />
      </>,
    )
    expect(container.querySelector('table')).toHaveAttribute('aria-describedby', 'desc')
  })

  it('is axe-clean without highlight', async (): Promise<void> => {
    const { container } = render(
      <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean with both column and row highlight active', async (): Promise<void> => {
    const { container } = render(
      <Table
        caption="Resort comparison"
        columns={[
          { key: 'kotelnica', label: 'Kotelnica', highlighted: true },
          { key: 'spindleruv', label: 'Špindlerův' },
        ]}
        rows={[
          {
            key: 'altitude_m',
            header: 'Altitude (m)',
            cells: ['770–920', '715–1,310'],
            highlighted: true,
          },
          { key: 'snow_depth_cm', header: 'Snow depth (cm)', cells: ['80', '65'] },
        ]}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
