import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from 'react'



// Tabs primitive (Epic 4 §5.1). Compound component shape mirrors the existing
// `<ToggleButtonGroup>` keyboard model — Left/Right wrap, Home/End jump —
// adapted to the WAI-ARIA tabs pattern (role="tablist" / "tab" / "tabpanel"
// + aria-selected / aria-controls / aria-labelledby). State (active tab) is
// lifted to the consumer via `value` / `onValueChange` to match the rest of
// the design system's controlled-component convention.
//
// Why Context: the compound shape (Tabs → TabList → Tab; Tabs → TabPanel)
// puts Tab and TabPanel at different depths under Tabs, and they need to
// share the active value, the per-tab id mapping, and the focus-management
// callback. Prop-drilling that asymmetry is awkward; component-local Context
// is the canonical React idiom and does not introduce module-level state.

interface TabRegistration {
  value: string
  tabId: string
  panelId: string
}

interface TabsContextShape {
  value: string
  label: string
  onValueChange: (next: string) => void
  registerTab: (entry: TabRegistration) => void
  getIds: (value: string) => { tabId: string; panelId: string }
  setTabRef: (value: string, el: HTMLButtonElement | null) => void
  focusTabAtOffset: (currentValue: string, offset: number) => void
  focusFirstTab: () => void
  focusLastTab: () => void
}

const TabsContext = createContext<TabsContextShape | null>(null)

export interface TabsProps {
  value: string
  onValueChange: (next: string) => void
  label: string
  children: ReactNode
}

export function Tabs({ value, onValueChange, label, children }: TabsProps): JSX.Element {
  const orderRef = useRef<Array<TabRegistration>>([])
  const refsRef = useRef<Map<string, HTMLButtonElement>>(new Map())

  const registerTab = useCallback((entry: TabRegistration): void => {
    const list = orderRef.current
    if (!list.some((e): boolean => e.value === entry.value)) {
      list.push(entry)
    }
  }, [])

  const getIds = useCallback(
    (tabValue: string): { tabId: string; panelId: string } => {
      const found = orderRef.current.find((e): boolean => e.value === tabValue)
      /* v8 ignore next 3 -- unreachable: TabPanel calls getIds only after
         ctx.value === value matches, implying the corresponding Tab registered. */
      if (found === undefined) {
        throw new Error(`Tabs: no registration for value=${tabValue}`)
      }
      return { tabId: found.tabId, panelId: found.panelId }
    },
    [],
  )

  const setTabRef = useCallback((tabValue: string, el: HTMLButtonElement | null): void => {
    if (el === null) {
      refsRef.current.delete(tabValue)
    } else {
      refsRef.current.set(tabValue, el)
    }
  }, [])

  const focusTabAtOffset = useCallback((currentValue: string, offset: number): void => {
    const order = orderRef.current
    /* v8 ignore next 3 -- unreachable: focusTabAtOffset is only called from
       Tab.onKeyDown, so at least one Tab is registered and order is non-empty. */
    if (order.length === 0) {
      return
    }
    const idx = order.findIndex((e): boolean => e.value === currentValue)
    /* v8 ignore next 3 -- unreachable: currentValue is the calling Tab's own
       `value` prop, registered during the same render via registerTab(). */
    if (idx === -1) {
      return
    }
    const nextIdx = (idx + offset + order.length) % order.length
    const target = order[nextIdx]
    /* v8 ignore next 3 -- unreachable: nextIdx is bounded into [0, order.length)
       by the modulo above; order[nextIdx] is always defined. */
    if (target === undefined) {
      return
    }
    refsRef.current.get(target.value)?.focus()
  }, [])

  const focusFirstTab = useCallback((): void => {
    const first = orderRef.current[0]
    /* v8 ignore next 3 -- unreachable: focusFirstTab is only called from
       Tab.onKeyDown, and Tab rendering implies at least one registered tab. */
    if (first === undefined) {
      return
    }
    refsRef.current.get(first.value)?.focus()
  }, [])

  const focusLastTab = useCallback((): void => {
    const last = orderRef.current[orderRef.current.length - 1]
    /* v8 ignore next 3 -- unreachable: focusLastTab is only called from
       Tab.onKeyDown, and Tab rendering implies at least one registered tab. */
    if (last === undefined) {
      return
    }
    refsRef.current.get(last.value)?.focus()
  }, [])

  return (
    <TabsContext.Provider
      value={{
        value,
        label,
        onValueChange,
        registerTab,
        getIds,
        setTabRef,
        focusTabAtOffset,
        focusFirstTab,
        focusLastTab,
      }}
    >
      <div className="sta-tabs">{children}</div>
    </TabsContext.Provider>
  )
}

export interface TabListProps {
  children: ReactNode
}

export function TabList({ children }: TabListProps): JSX.Element | null {
  const ctx = useContext(TabsContext)
  if (ctx === null) {
    return null
  }
  return (
    <div role="tablist" aria-label={ctx.label} className="sta-tabs__list">
      {children}
    </div>
  )
}

export interface TabProps {
  value: string
  children: ReactNode
}

export function Tab({ value, children }: TabProps): JSX.Element | null {
  const ctx = useContext(TabsContext)
  const generatedId = useId()
  const tabId = `tab-${generatedId}`
  const panelId = `tabpanel-${generatedId}`

  if (ctx === null) {
    return null
  }

  ctx.registerTab({ value, tabId, panelId })

  const selected = ctx.value === value

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      ctx?.focusTabAtOffset(value, 1)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      ctx?.focusTabAtOffset(value, -1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      ctx?.focusFirstTab()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      ctx?.focusLastTab()
    }
  }

  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      ref={(el): void => {
        ctx.setTabRef(value, el)
      }}
      onClick={(): void => {
        ctx.onValueChange(value)
      }}
      onKeyDown={onKeyDown}
      className="sta-tabs__tab"
    >
      {children}
    </button>
  )
}

export interface TabPanelProps {
  value: string
  children: ReactNode
}

export function TabPanel({ value, children }: TabPanelProps): JSX.Element | null {
  const ctx = useContext(TabsContext)
  if (ctx === null) {
    return null
  }
  if (ctx.value !== value) {
    return null
  }
  const ids = ctx.getIds(value)
  return (
    <div
      role="tabpanel"
      id={ids.panelId}
      aria-labelledby={ids.tabId}
      className="sta-tabs__panel"
    >
      {children}
    </div>
  )
}
