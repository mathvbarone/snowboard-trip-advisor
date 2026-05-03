import { DismissableLayer } from '@radix-ui/react-dismissable-layer'
import { FocusScope } from '@radix-ui/react-focus-scope'
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react'

// Keyboard-navigable dropdown menu (Epic 4 §5.1). Used by the admin
// `<HeaderBar>` for the user-identity placeholder + Sources / Integrations /
// History links. Distinct from `<Popover>` (menu items vs. arbitrary content).
//
// Why a single `DismissableLayer` wrapping both the trigger and the menu
// rather than rendering `<Popover>` next to the trigger: dropdown
// interaction semantics require a SECOND click on the trigger to close the
// open menu. With the menu rendered as a standalone `DismissableLayer`
// (the Popover shape), the second trigger click would fire `onPointerDownOutside`
// AND the trigger's onClick — racy. Wrapping both in one layer makes the
// trigger "inside" the layer, so its clicks are ordinary toggles. The
// shared building blocks (`FocusScope` + `DismissableLayer`) match Modal's
// pattern exactly; only the composition shape differs.

export interface DropdownMenuItem {
  label: string
  onSelect: () => void
}

export interface DropdownMenuProps {
  /** The trigger element. Cloned to inject `aria-haspopup`, `aria-expanded`,
   *  click toggle, and a ref so DropdownMenu can return focus to it on close.
   *  The `ref` slot is in the typed shape because React 19's `cloneElement`
   *  requires it there, but DropdownMenu **owns** the ref — any consumer-
   *  supplied ref on the trigger is silently overwritten. If you need a ref
   *  to the trigger element, render the button yourself outside DropdownMenu. */
  trigger: ReactElement<{
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void
    'aria-haspopup'?: 'menu'
    'aria-expanded'?: boolean
    'aria-controls'?: string
    ref?: (el: HTMLButtonElement | null) => void
  }>
  /** Required accessible name for the menu. */
  label: string
  /** Menu items in display order. */
  items: ReadonlyArray<DropdownMenuItem>
}

export function DropdownMenu({ trigger, label, items }: DropdownMenuProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = `dropdown-menu-${useId()}`

  const close = useCallback((): void => {
    setOpen(false)
    setFocusedIndex(-1)
  }, [])

  function focusItem(index: number): void {
    setFocusedIndex(index)
    itemRefs.current[index]?.focus()
  }

  // WAI-ARIA APG menubutton pattern: opening the menu places focus on the
  // first menu item so keyboard users who activate the trigger via Enter /
  // Space can activate a command without an extra arrow press. With roving
  // tabindex (only the focused item has tabIndex=0), FocusScope's default
  // first-tabbable auto-focus can't land here on its own — we drive it.
  useEffect((): void => {
    if (!open || items.length === 0) {
      return
    }
    setFocusedIndex(0)
    itemRefs.current[0]?.focus()
  }, [open, items.length])

  function onTriggerClick(): void {
    if (open) {
      close()
      return
    }
    setOpen(true)
    setFocusedIndex(-1)
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Tab closes the menu and advances focus to the next page control
    // (WAI-ARIA APG menubutton pattern). We do NOT preventDefault — the
    // browser's default Tab behavior handles the focus move; close() just
    // tears down the menu DOM after.
    if (event.key === 'Tab') {
      close()
      return
    }
    if (items.length === 0) {
      return
    }
    // The auto-focus useEffect sets focusedIndex to 0 the moment the menu
    // opens with at least one item, so by the time a keydown event reaches
    // the menu div, focusedIndex is >= 0. No defensive arm needed for the
    // initial -1 case — that state never coincides with a user keystroke.
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusItem((focusedIndex + 1) % items.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusItem((focusedIndex - 1 + items.length) % items.length)
    }
  }

  function activate(index: number): void {
    const item = items[index]
    /* v8 ignore next 3 -- unreachable: activate is only invoked with indices
       drawn from items.map / focusedIndex, both of which are bounded by items.length. */
    if (item === undefined) {
      return
    }
    item.onSelect()
    close()
    triggerRef.current?.focus()
  }

  // Clone the trigger to inject menu-control attributes + click handler.
  // The composed click handler calls the consumer's onClick first (so any
  // analytics, side effects, or guards stay attached), then toggles the
  // menu — unless the consumer called `event.preventDefault()`, in which
  // case the toggle is skipped. The trigger ref is captured here for the
  // focus-return-to-trigger behavior on dismiss; per the trigger prop
  // doc, DropdownMenu owns this ref slot.
  const consumerOnClick = trigger.props.onClick
  const enhancedTrigger = cloneElement(trigger, {
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': menuId,
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      consumerOnClick?.(event)
      if (event.defaultPrevented) {
        return
      }
      onTriggerClick()
    },
    ref: (el: HTMLButtonElement | null): void => {
      triggerRef.current = el
    },
  })

  return (
    <DismissableLayer
      asChild
      onEscapeKeyDown={(): void => {
        if (!open) {
          return
        }
        close()
        triggerRef.current?.focus()
      }}
      onPointerDownOutside={(): void => {
        close()
      }}
    >
      <div className="sta-dropdown-menu">
        {enhancedTrigger}
        {open ? (
          // FocusScope without `loop` / `trapped`: auto-focus the first item
          // on open (so keyboard users land in the menu), but Tab can still
          // escape to surrounding page controls per the WAI-ARIA APG dropdown
          // menu pattern. Tab also fires our onMenuKeyDown handler which
          // closes the menu — a more conventional UX than letting the menu
          // hang open after focus moves away.
          <FocusScope asChild>
            <div
              role="menu"
              id={menuId}
              aria-label={label}
              className="sta-dropdown-menu__menu"
              onKeyDown={onMenuKeyDown}
            >
              {items.map((item, index): JSX.Element => (
                <button
                  key={item.label}
                  ref={(el): void => {
                    itemRefs.current[index] = el
                  }}
                  type="button"
                  role="menuitem"
                  className="sta-dropdown-menu__item"
                  tabIndex={index === focusedIndex ? 0 : -1}
                  onClick={(): void => {
                    activate(index)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </FocusScope>
        ) : null}
      </div>
    </DismissableLayer>
  )
}
