import {
  Button,
  Input,
  Modal,
} from '@snowboard-trip-advisor/design-system'
import { useEffect, useState, type JSX } from 'react'

// Spec §3.5 + plan step 5.7 contract:
//   - Modal-based "share this link" dialog.
//   - Happy path (modern browser): clicking "Copy link" calls
//     `navigator.clipboard.writeText` with the full window.location.href;
//     a transient success message confirms.
//   - Fallback (legacy / non-https / SR mode): when
//     `navigator.clipboard` is undefined, render a readonly Input control
//     pre-filled with the URL so the user can manually select + copy.
//   - Error path: a writeText rejection (permission denied / blocked
//     gesture) surfaces an inline message rather than throwing.

type CopyState = 'idle' | 'copied' | 'error'

export interface ShareUrlDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ShareUrlDialog({
  open,
  onOpenChange,
}: ShareUrlDialogProps): JSX.Element {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  // App.tsx mounts ShareUrlDialog unconditionally; only Radix's inner
  // Content unmounts on close. Reset copyState on every open transition
  // so "Copied!" / "Couldn't copy" messages from a previous session do
  // not leak into the next one. Effect runs on every open change but the
  // setter is a no-op when copyState is already 'idle', so there is no
  // measurable cost on the close-then-open cycle.
  useEffect((): void => {
    if (open) {
      setCopyState('idle')
    }
  }, [open])
  // Read window.location.href on every render — the URL changes when the
  // user toggles a star or sort, and the share link should reflect the
  // current state.
  const url = window.location.href
  const clipboardAvailable =
    typeof navigator.clipboard !== 'undefined' &&
    typeof navigator.clipboard.writeText === 'function'

  function handleCopy(): void {
    void navigator.clipboard
      .writeText(url)
      .then((): void => {
        setCopyState('copied')
      })
      .catch((): void => {
        setCopyState('error')
      })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Share your shortlist">
      <div className="sta-share-url-dialog">
        <p className="sta-share-url-dialog__url">{url}</p>
        {clipboardAvailable ? (
          <>
            <Button onClick={handleCopy}>Copy link</Button>
            {copyState === 'copied' ? (
              <p className="sta-share-url-dialog__feedback" role="status">
                Copied!
              </p>
            ) : null}
            {copyState === 'error' ? (
              <p className="sta-share-url-dialog__feedback" role="alert">
                Couldn't copy — please copy manually.
              </p>
            ) : null}
          </>
        ) : (
          <Input
            label="Share URL"
            value={url}
            onChange={(): void => {
              // Read-only — the value is reset to the URL on every render.
            }}
          />
        )}
      </div>
    </Modal>
  )
}
