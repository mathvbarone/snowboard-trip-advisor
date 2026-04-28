import * as RadixDialog from '@radix-ui/react-dialog'
import { useEffect, useRef, type JSX, type ReactNode } from 'react'

// Modal — wraps Radix Dialog (modal=true). Provides focus trap, body scroll
// lock, and Escape-dismiss for free; the wrapper adds:
//   - a fixed `<RadixDialog.Title>` from the `title` prop (every accessible
//     dialog requires an accessible name; spec §5.5 + axe-clean gate);
//   - a portal so the modal escapes the consumer's stacking context;
//   - the `data-modal` shape on the content node so the design-system CSS
//     can attach z-index/elevation tokens by attribute selector;
//   - explicit body scroll lock (`document.body.style.overflow = 'hidden'`)
//     while open — Radix's internal lock toggles `<html>` overflow via
//     react-remove-scroll, which jsdom does not surface; the spec §7.9
//     contract names `<body>` so we own that toggle here for parity in
//     both jsdom tests AND real browsers (the two locks compose without
//     conflict — they both set 'hidden');
//   - explicit focus-return on close. Radix only auto-restores focus when
//     the trigger is wrapped in `<Dialog.Trigger>`; consumers using a
//     controlled `open` prop without that wrapper need us to capture the
//     active element at open-time and restore it on close.
//
// The Description warning is silenced via `aria-describedby={undefined}` —
// the title is the accessible name; consumers wanting a longer description
// can pass it as part of `children` and link it themselves if needed.

export interface ModalProps {
  /** Controlled open flag. */
  open: boolean
  /** Called with the next open state on Escape / close requests. */
  onOpenChange: (open: boolean) => void
  /** Required accessible name. Rendered visibly inside the dialog as the
   *  first heading. */
  title: string
  /** Modal body — usually a `<form>` for the merge/replace + share-URL
   *  flows. */
  children: ReactNode
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: ModalProps): JSX.Element {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect((): (() => void) | undefined => {
    if (!open) {
      return undefined
    }
    // Capture the element that had focus when the modal opened so we can
    // restore focus to it after close. Capture on open-edge only.
    // `document.activeElement` is always an Element in jsdom + browsers
    // (defaults to <body> when nothing else is focused); narrow to
    // HTMLElement so `.focus()` is type-safe. SVG / non-HTML focusables
    // would skip restore — acceptable: the only call sites that open this
    // modal are <button> triggers per the spec §5.5 trigger-element
    // protocol.
    const active = document.activeElement
    previousFocusRef.current = active instanceof HTMLElement ? active : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return (): void => {
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
    }
  }, [open])

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="sta-modal__overlay" />
        <RadixDialog.Content
          className="sta-modal"
          data-modal="true"
          aria-describedby={undefined}
        >
          <RadixDialog.Title className="sta-modal__title">{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
