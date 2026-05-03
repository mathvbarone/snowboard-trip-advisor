import { DismissableLayer } from '@radix-ui/react-dismissable-layer'
import { FocusScope } from '@radix-ui/react-focus-scope'
import {
  cloneElement,
  useCallback,
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
  /** The trigger element. Cloned to inject `aria-haspopup`, `aria-expanded`, and click toggle. */
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

  function onTriggerClick(): void {
    if (open) {
      close()
      return
    }
    setOpen(true)
    setFocusedIndex(-1)
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (items.length === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = focusedIndex < 0 ? 0 : (focusedIndex + 1) % items.length
      focusItem(next)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next =
        focusedIndex < 0 ? items.length - 1 : (focusedIndex - 1 + items.length) % items.length
      focusItem(next)
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
  // The trigger ref is shared so the focus-return-to-trigger behavior on
  // dismiss works whether the consumer passed a `ref` or not.
  const enhancedTrigger = cloneElement(trigger, {
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': menuId,
    onClick: onTriggerClick,
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
          <FocusScope asChild loop>
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
