import { Button, Modal, useToast } from '@snowboard-trip-advisor/design-system'
import { useCallback, useEffect, type JSX } from 'react'

import { useHealth } from '../state/useHealth'
import { usePublish } from '../state/usePublish'

// PublishDialog wraps the DS Modal primitive (Decision F1; Radix-backed →
// focus trap + body scroll lock + Escape dismissal + portal + focus return
// for free). Reads `useHealth()` directly per Decision F2 (no useHealth
// extension); each open is a fresh mount that re-runs the health fetch
// (Shell mounts conditionally per Decision G1). Spec §4.3.1 defines the 4
// blocking conditions and the verbatim tooltip copy below.

const TOOLTIP_BY_BLOCKER = {
  failed_fields: 'fix failures or switch fields to MANUAL before publishing.',
  missing_provenance:
    "every metric field needs a matching `field_sources` entry; check the editor's StatusPill column for missing-provenance markers.",
  corrupt_workspace:
    '1 workspace file is corrupt. Inspect `data/admin-workspace/` and either repair or `rm` the file before publishing. See server logs for the failing slug + Zod issue list.',
  empty: 'no resorts staged for publish. Add resorts in the editor before publishing.',
} as const
type Blocker = keyof typeof TOOLTIP_BY_BLOCKER

const BLOCKER_TOOLTIP_ID = 'publish-dialog-blocker'

export interface PublishDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function PublishDialog({ open, onOpenChange }: PublishDialogProps): JSX.Element {
  const health = useHealth()
  const publish = usePublish()
  const toast = useToast()

  useEffect((): void => {
    if (publish.status === 'success') {
      // Toast contract #4 (PR 4.5b round-6 fold): close BEFORE Toast emits
      // so the polite live region isn't aria-hidden by Radix's hideOthers().
      // React batches these three updates into one commit; the next commit
      // unmounts the Modal and ToastProvider's persistent polite region
      // picks up the new message. The discriminated UsePublishResult union
      // narrows publish.response to PublishResponse here — no fallback needed.
      toast.show({
        variant: 'success',
        message: `Published version ${publish.response.version_id}`,
      })
      publish.reset()
      onOpenChange(false)
    } else if (publish.status === 'error') {
      // Error variant uses the visible Toast's role="alert" (assertive); the
      // dialog stays mounted so the user sees the failure context. publish.error
      // is narrowed to Error here.
      toast.show({
        variant: 'error',
        message: `Publish failed: ${publish.error.message}`,
      })
      publish.reset()
    }
  }, [publish, onOpenChange, toast])

  // Round-28 fold of the plan-PR loop: rewritten from a nested-ternary +
  // non-null-assertion (both banned by AGENTS.md Code Rules) into a guarded
  // `if (healthValue !== null)` block — TypeScript narrows inside the
  // branch so no `!` is needed; no ternaries.
  const healthValue = health.value
  const healthUnknown = healthValue === null
  let blocker: Blocker | null = null
  if (healthValue !== null) {
    if (healthValue.resorts_with_failed_fields > 0) {
      blocker = 'failed_fields'
    } else if (healthValue.resorts_with_missing_provenance > 0) {
      blocker = 'missing_provenance'
    } else if (healthValue.resorts_with_corrupt_workspace > 0) {
      blocker = 'corrupt_workspace'
    } else if (healthValue.resorts_total === 0) {
      blocker = 'empty'
    }
  }

  const submitting = publish.status === 'submitting'
  const disabled = healthUnknown || blocker !== null || submitting

  // Round-32 fold: ignore close requests while a publish is in-flight.
  // Otherwise Escape/backdrop unmounts the dialog → the success/error
  // useEffect inside this component is gone → publish completes silently
  // (the POST still writes the archive, but the user has no indication).
  const handleOpenChange = useCallback(
    (next: boolean): void => {
      if (!next && submitting) {
        return
      }
      onOpenChange(next)
    },
    [submitting, onOpenChange],
  )

  // Shared between the with-blocker and no-blocker Confirm buttons so the
  // onClick body is only counted once for coverage. The button is disabled
  // when a blocker is active, so the handler only ever fires from the
  // clean-health branch.
  const onConfirm = useCallback((): void => {
    void publish.submit()
  }, [publish])
  // Hoisted out of the JSX so the `submitting ? 'Publishing…' : 'Confirm'`
  // ternary is evaluated once. Inside the with-blocker branch the button is
  // disabled (so the submitting-true sub-branch would be unreachable
  // there); a single hoisted ternary gives both branches the same label
  // without duplicating an unreachable conditional.
  const confirmLabel = submitting ? 'Publishing…' : 'Confirm'

  // Round-20 fold: link the descriptive `<p>` to Confirm via aria-describedby
  // WHENEVER the dialog is disabled for a reason the user should hear — i.e.,
  // health loading/error AND the four blockers. Without the loading/error
  // case, AT users got no explanation while health was loading.
  const hasBlockerCopy = healthUnknown || blocker !== null
  const blockerCopy = ((): string | null => {
    if (healthUnknown) {
      if (health.error === null) {
        return 'Loading pre-publish checks…'
      }
      return `Could not load health: ${health.error.message}`
    }
    if (blocker !== null) {
      return TOOLTIP_BY_BLOCKER[blocker]
    }
    return null
  })()

  return (
    <Modal open={open} onOpenChange={handleOpenChange} title="Publish">
      {healthUnknown && blockerCopy !== null && (
        <p id={BLOCKER_TOOLTIP_ID} role="status">
          {blockerCopy}
        </p>
      )}
      {!healthUnknown && blockerCopy !== null && (
        <p id={BLOCKER_TOOLTIP_ID}>{blockerCopy}</p>
      )}
      <div className="publish-dialog__actions">
        <Button
          onClick={(): void => {
            handleOpenChange(false)
          }}
          disabled={submitting}
          variant="ghost"
        >
          Cancel
        </Button>
        {/* exactOptionalPropertyTypes prohibits passing `undefined` for an
            optional prop, so render two branches instead of one with a
            conditional value. The shared onClick handler keeps the no-
            blocker branch (where the button is interactive) the only
            handler-execution path coverage needs to exercise. */}
        {hasBlockerCopy ? (
          <Button
            onClick={onConfirm}
            disabled={disabled}
            aria-describedby={BLOCKER_TOOLTIP_ID}
          >
            {confirmLabel}
          </Button>
        ) : (
          <Button onClick={onConfirm} disabled={disabled}>
            {confirmLabel}
          </Button>
        )}
      </div>
    </Modal>
  )
}
