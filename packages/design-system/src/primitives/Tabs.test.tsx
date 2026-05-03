import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { useState } from 'react'
import type { JSX } from 'react'
import { describe, expect, it } from 'vitest'

import { Tab, TabList, TabPanel, Tabs } from './Tabs'

function Harness({ initial = 'one' }: { initial?: string }): JSX.Element {
  const [value, setValue] = useState<string>(initial)
  return (
    <Tabs value={value} onValueChange={setValue} label="Editor sections">
      <TabList>
        <Tab value="one">One</Tab>
        <Tab value="two">Two</Tab>
        <Tab value="three">Three</Tab>
      </TabList>
      <TabPanel value="one">Panel one</TabPanel>
      <TabPanel value="two">Panel two</TabPanel>
      <TabPanel value="three">Panel three</TabPanel>
    </Tabs>
  )
}

describe('Tabs', (): void => {
  it('renders ARIA tablist + tab + tabpanel roles with the label', (): void => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Editor sections' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel one')
  })

  it('marks the selected tab with aria-selected="true" and others with "false"', (): void => {
    render(<Harness initial="two" />)
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('aria-selected', 'false')
  })

  it('renders only the active tabpanel', (): void => {
    render(<Harness initial="three" />)
    const panels = screen.getAllByRole('tabpanel')
    expect(panels).toHaveLength(1)
    expect(panels[0]).toHaveTextContent('Panel three')
  })

  it('clicking a tab activates it', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel two')
  })

  it('Right arrow moves focus to the next tab and wraps at the end', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    one.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
  })

  it('Left arrow moves focus to the previous tab and wraps at the start', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    one.focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
  })

  it('Home / End jump focus to the first / last tab', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness initial="two" />)
    const two = screen.getByRole('tab', { name: 'Two' })
    two.focus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
  })

  it('non-arrow keys do not affect focus (regression: only specific keys are handled)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    one.focus()
    await user.keyboard('a')
    expect(one).toHaveFocus()
  })

  it('encodes ID-unsafe characters in value when composing aria-controls / aria-labelledby (regression: HTML id whitespace ban)', (): void => {
    function HarnessWithUnsafeValue(): JSX.Element {
      const [value, setValue] = useState<string>('snow conditions')
      return (
        <Tabs value={value} onValueChange={setValue} label="Editor">
          <TabList>
            <Tab value="snow conditions">Snow</Tab>
            <Tab value="snow-conditions">Snow Hyphen</Tab>
          </TabList>
          <TabPanel value="snow conditions">whitespace panel</TabPanel>
          <TabPanel value="snow-conditions">hyphen panel</TabPanel>
        </Tabs>
      )
    }
    render(<HarnessWithUnsafeValue />)
    const tab = screen.getByRole('tab', { name: 'Snow' })
    const panel = screen.getByRole('tabpanel')
    // ID must not contain whitespace per HTML5 id rules.
    expect(tab.id).not.toMatch(/\s/)
    expect(panel.id).not.toMatch(/\s/)
    // Tab and TabPanel use the SAME encoding so the linkage holds.
    expect(tab.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
    // Two tabs with values "snow conditions" and "snow-conditions" must not
    // collide (encodeURIComponent preserves distinctness).
    const sister = screen.getByRole('tab', { name: 'Snow Hyphen' })
    expect(sister.id).not.toBe(tab.id)
  })

  it('panels are linked to their tabs via aria-controls / aria-labelledby', (): void => {
    render(<Harness />)
    const tab = screen.getByRole('tab', { name: 'One' })
    const panel = screen.getByRole('tabpanel')
    const tabId = tab.id
    const panelId = panel.id
    expect(tab.getAttribute('aria-controls')).toBe(panelId)
    expect(panel.getAttribute('aria-labelledby')).toBe(tabId)
  })

  it('TabPanel rendered without a Tabs ancestor renders nothing (defensive)', (): void => {
    const { container } = render(<TabPanel value="orphan">orphan</TabPanel>)
    expect(container.textContent).toBe('')
  })

  it('Tab rendered without a Tabs ancestor still renders something inert (defensive)', (): void => {
    // Mirrors TabPanel's defensive arm: no provider → no crash.
    render(<Tab value="orphan">orphan</Tab>)
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('TabList rendered without a Tabs ancestor renders nothing (defensive)', (): void => {
    const { container } = render(<TabList><span>x</span></TabList>)
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('is axe-clean', async (): Promise<void> => {
    const { container } = render(<Harness />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
