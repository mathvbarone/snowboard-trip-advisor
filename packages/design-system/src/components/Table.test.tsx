import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

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

  // ─── onRowSelect: clickable-row affordance (PR 4.3, post-Codex-P1 fix) ──
  // Whole-row click navigation is what the ResortsTable view (Task 2.4)
  // depends on. After Codex round-3 P1, the contract is:
  //   - <tr> keeps native row semantics (no role override) — `role="button"`
  //     on a <tr> conflicts with assistive-tech row/table navigation.
  //   - The row-header content is wrapped in a <button> that is the
  //     keyboard activation target (Tab → Enter/Space).
  //   - <tr onClick> is the mouse convenience: click anywhere on the row
  //     triggers the same handler.
  //   - data-clickable="true" on the <tr> drives cursor:pointer styling.

  describe('onRowSelect (clickable rows)', (): void => {
    it('does NOT add data-clickable or wrap row.header in a button when onRowSelect is undefined', (): void => {
      const { container } = render(
        <Table caption="Resort comparison" columns={COLUMNS} rows={ROWS} />,
      )
      const bodyRows = container.querySelectorAll('tbody tr')
      expect(bodyRows).toHaveLength(2)
      for (const row of bodyRows) {
        expect(row).not.toHaveAttribute('data-clickable')
      }
      // Row-header is rendered as plain text, not wrapped in a <button>.
      expect(container.querySelectorAll('tbody th[scope="row"] button')).toHaveLength(0)
    })

    it('keeps native row semantics (no role override, no tabindex on <tr>) when onRowSelect is provided', (): void => {
      const { container } = render(
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          onRowSelect={(): void => undefined}
        />,
      )
      const bodyRows = container.querySelectorAll('tbody tr')
      expect(bodyRows).toHaveLength(2)
      for (const row of bodyRows) {
        // Codex round-3 P1: <tr role="button"> conflicts with table semantics.
        // Pin the absence of any role override + tabindex on <tr>.
        expect(row).not.toHaveAttribute('role')
        expect(row).not.toHaveAttribute('tabindex')
        // data-clickable drives cursor:pointer styling, kept.
        expect(row).toHaveAttribute('data-clickable', 'true')
      }
    })

    it('renders the row-header content inside a <button> (keyboard activation target) when onRowSelect is provided', (): void => {
      const { container } = render(
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          onRowSelect={(): void => undefined}
        />,
      )
      // Each tbody row's <th scope="row"> wraps its content in a button.
      const rowButtons = container.querySelectorAll('tbody th[scope="row"] button.sta-table__row-button')
      expect(rowButtons).toHaveLength(2)
      // The button preserves the original row-header text (the rowheader
      // role lookup still finds it because the text is still inside the <th>).
      const rowHeaders = screen.getAllByRole('rowheader')
      expect(rowHeaders[0]).toHaveTextContent('Altitude (m)')
      expect(rowHeaders[1]).toHaveTextContent('Snow depth (cm)')
    })

    it('calls onRowSelect with row.key when the row-header button is clicked (keyboard-equivalent path)', async (): Promise<void> => {
      const onRowSelect = vi.fn()
      const user = userEvent.setup()
      const { container } = render(
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          onRowSelect={onRowSelect}
        />,
      )
      const firstButton = container.querySelector('tbody th[scope="row"] button.sta-table__row-button')
      expect(firstButton).not.toBeNull()
      await user.click(firstButton as HTMLElement)
      // The button's stopPropagation prevents the <tr onClick> from also
      // firing onRowSelect — exactly one call.
      expect(onRowSelect).toHaveBeenCalledTimes(1)
      expect(onRowSelect).toHaveBeenCalledWith('altitude_m')
    })

    it('calls onRowSelect with row.key when the row body is clicked (mouse convenience)', async (): Promise<void> => {
      const onRowSelect = vi.fn()
      const user = userEvent.setup()
      const { container } = render(
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          onRowSelect={onRowSelect}
        />,
      )
      // Click on a non-row-header cell (the data <td>) so the click hits
      // the <tr onClick> handler, not the row-header button.
      const firstDataCell = container.querySelectorAll('tbody td')[0] as HTMLElement
      await user.click(firstDataCell)
      expect(onRowSelect).toHaveBeenCalledTimes(1)
      expect(onRowSelect).toHaveBeenCalledWith('altitude_m')
    })

    it('row-header button activates via Enter (native button behaviour, no custom keydown handler)', async (): Promise<void> => {
      const onRowSelect = vi.fn()
      const user = userEvent.setup()
      const { container } = render(
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          onRowSelect={onRowSelect}
        />,
      )
      const secondButton = container.querySelectorAll('tbody th[scope="row"] button.sta-table__row-button')[1] as HTMLElement
      secondButton.focus()
      await user.keyboard('{Enter}')
      expect(onRowSelect).toHaveBeenCalledTimes(1)
      expect(onRowSelect).toHaveBeenCalledWith('snow_depth_cm')
    })

    it('row-header button activates via Space (native button behaviour, preventDefault is built-in)', async (): Promise<void> => {
      const onRowSelect = vi.fn()
      const user = userEvent.setup()
      const { container } = render(
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          onRowSelect={onRowSelect}
        />,
      )
      const firstButton = container.querySelectorAll('tbody th[scope="row"] button.sta-table__row-button')[0] as HTMLElement
      firstButton.focus()
      await user.keyboard(' ')
      expect(onRowSelect).toHaveBeenCalledTimes(1)
      expect(onRowSelect).toHaveBeenCalledWith('altitude_m')
    })

    it('is axe-clean with onRowSelect (clickable rows, button-in-cell pattern)', async (): Promise<void> => {
      const { container } = render(
        <Table
          caption="Resort comparison"
          columns={COLUMNS}
          rows={ROWS}
          onRowSelect={(): void => undefined}
        />,
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
