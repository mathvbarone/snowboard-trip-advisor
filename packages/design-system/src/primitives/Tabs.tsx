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
// share the active value, the deterministic id prefix, and the focus-management
// callbacks. Prop-drilling that asymmetry is awkward; component-local Context
// is the canonical React idiom and does not introduce module-level state.
//
// IDs are derived deterministically from a Tabs-level `useId()` prefix +
// the consumer-supplied `value` so Tab and TabPanel agree without a
// registration step. Tab order is read from the callback-ref Map's insertion
// order at event time (`Map` preserves insertion order); the callback refs
// run at commit time, so by the time the user presses an arrow key every
// mounted Tab has populated the Map. This keeps the render path pure
// (no side effects during render — concurrent / StrictMode safe).

interface TabsContextShape {
  value: string
  label: string
  idPrefix: string
  onValueChange: (next: string) => void
  setTabRef: (value: string, el: HTMLButtonElement | null) => void
  focusTabAtOffset: (currentValue: string, offset: number) => void
  focusFirstTab: () => void
  focusLastTab: () => void
}

const TabsContext = createContext<TabsContextShape | null>(null)

// Both Tab and TabPanel derive their ARIA ids from idPrefix + value. The
// raw value can carry consumer-controlled characters (spaces, punctuation)
// that aren't valid in HTML id / aria-controls IDREFs; encodeURIComponent
// produces a deterministic, IDREF-safe transformation that both Tab and
// TabPanel agree on. Encoding is bijective per character class, so distinct
// values produce distinct ids — no collision risk.
function makeTabId(prefix: string, value: string): string {
  return `${prefix}-tab-${encodeURIComponent(value)}`
}

function makePanelId(prefix: string, value: string): string {
  return `${prefix}-panel-${encodeURIComponent(value)}`
}

export interface TabsProps {
  value: string
  onValueChange: (next: string) => void
  label: string
  children: ReactNode
}

export function Tabs({ value, onValueChange, label, children }: TabsProps): JSX.Element {
  const idPrefix = useId()
  const refsRef = useRef<Map<string, HTMLButtonElement>>(new Map())

  const setTabRef = useCallback((tabValue: string, el: HTMLButtonElement | null): void => {
    if (el === null) {
      refsRef.current.delete(tabValue)
    } else {
      refsRef.current.set(tabValue, el)
    }
  }, [])

  const focusTabAtOffset = useCallback((currentValue: string, offset: number): void => {
    const keys = Array.from(refsRef.current.keys())
    const idx = keys.indexOf(currentValue)
    /* v8 ignore next 3 -- unreachable: focusTabAtOffset is called from
       Tab.onKeyDown, so currentValue is a registered tab and idx >= 0. */
    if (idx === -1) {
      return
    }
    const nextKey = keys[(idx + offset + keys.length) % keys.length]
    /* v8 ignore next 3 -- unreachable: nextKey index is bounded into [0, keys.length)
       by the modulo above, and keys is non-empty when idx !== -1. */
    if (nextKey === undefined) {
      return
    }
    refsRef.current.get(nextKey)?.focus()
  }, [])

  const focusFirstTab = useCallback((): void => {
    const first = refsRef.current.keys().next()
    /* v8 ignore next 3 -- unreachable: focusFirstTab is called from a registered
       Tab's onKeyDown, so the refs Map has at least one entry. */
    if (first.done === true) {
      return
    }
    refsRef.current.get(first.value)?.focus()
  }, [])

  const focusLastTab = useCallback((): void => {
    const keys = Array.from(refsRef.current.keys())
    const last = keys[keys.length - 1]
    /* v8 ignore next 3 -- unreachable: focusLastTab is called from a registered
       Tab's onKeyDown, so the refs Map has at least one entry. */
    if (last === undefined) {
      return
    }
    refsRef.current.get(last)?.focus()
  }, [])

  return (
    <TabsContext.Provider
      value={{
        value,
        label,
        idPrefix,
        onValueChange,
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
  if (ctx === null) {
    return null
  }

  const tabId = makeTabId(ctx.idPrefix, value)
  const panelId = makePanelId(ctx.idPrefix, value)
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
  const tabId = makeTabId(ctx.idPrefix, value)
  const panelId = makePanelId(ctx.idPrefix, value)
  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      className="sta-tabs__panel"
    >
      {children}
    </div>
  )
}
