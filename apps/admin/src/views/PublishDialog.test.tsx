import { ToastProvider } from '@snowboard-trip-advisor/design-system'
import {
  HealthResponse,
  PublishResponse,
} from '@snowboard-trip-advisor/schema/api'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState, type JSX } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../mocks/server'
import { __resetForTests as resetHealth } from '../state/useHealth'
import { __resetForTests as resetListPublishes } from '../state/useListPublishes'
import { __resetForTests as resetPublish } from '../state/usePublish'

import { PublishDialog } from './PublishDialog'

// PR 4.5c §4.5c-6 — covers: 4 blocking states (spec §4.3.1 verbatim
// tooltip copy), confirm-enabled-on-clean-health, loading + error
// surfaces during health fetch, success/error Toast emission +
// publish.reset() + close-on-success, aria-describedby wiring, and the
// submitting-blocks-close round-32 fold. Modal primitive contract (focus
// trap, Esc, backdrop, scroll lock, focus return) is covered by Modal
// tests at packages/design-system/src/primitives/Modal.test.tsx.

beforeEach((): void => {
  resetHealth()
  resetListPublishes()
  resetPublish()
})
afterEach((): void => {
  resetHealth()
  resetListPublishes()
  resetPublish()
  server.resetHandlers()
  vi.restoreAllMocks()
})

const CLEAN_HEALTH: HealthResponse = HealthResponse.parse({
  resorts_total: 2,
  resorts_with_stale_fields: 0,
  resorts_with_failed_fields: 0,
  resorts_with_missing_provenance: 0,
  resorts_with_corrupt_workspace: 0,
  pending_integration_errors: 0,
  last_published_at: null,
  archive_size_bytes: 0,
})

function healthWith(overrides: Partial<HealthResponse>): HealthResponse {
  return HealthResponse.parse({ ...CLEAN_HEALTH, ...overrides })
}

const PUBLISH_RESPONSE: PublishResponse = PublishResponse.parse({
  version_id: '1-2026-05-12T08-30-15-247Z',
  archive_path: 'data/published/history/1-2026-05-12T08-30-15-247Z.json',
  published_at: '2026-05-12T08:30:15.247Z',
  resort_count: 2,
})

function Harness(): JSX.Element {
  const [open, setOpen] = useState<boolean>(true)
  return (
    <ToastProvider>
      {open && <PublishDialog open={open} onOpenChange={setOpen} />}
    </ToastProvider>
  )
}

describe('PublishDialog (PR 4.5c)', (): void => {
  it.each([
    [
      'resorts_with_failed_fields',
      { resorts_with_failed_fields: 1 },
      'fix failures or switch fields to MANUAL before publishing.',
    ],
    [
      'resorts_with_missing_provenance',
      { resorts_with_missing_provenance: 1 },
      "every metric field needs a matching `field_sources` entry; check the editor's StatusPill column for missing-provenance markers.",
    ],
    [
      'resorts_with_corrupt_workspace',
      { resorts_with_corrupt_workspace: 1 },
      '1 workspace file is corrupt. Inspect `data/admin-workspace/` and either repair or `rm` the file before publishing. See server logs for the failing slug + Zod issue list.',
    ],
    [
      'resorts_total',
      { resorts_total: 0 },
      'no resorts staged for publish. Add resorts in the editor before publishing.',
    ],
  ])(
    'disables Confirm + shows spec §4.3.1 tooltip when %s blocker active',
    async (_field, healthOverrides, expectedTooltip): Promise<void> => {
      server.use(
        http.get('/api/health', (): Response =>
          HttpResponse.json(healthWith(healthOverrides)),
        ),
      )
      render(<Harness />)
      const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
      await waitFor((): void => {
        expect(confirmButton).toBeDisabled()
      })
      const blocker = document.getElementById('publish-dialog-blocker')
      expect(blocker?.textContent).toBe(expectedTooltip)
      expect(confirmButton).toHaveAttribute('aria-describedby', 'publish-dialog-blocker')
    },
  )

  it('Confirm enabled on clean health; click submits + closes + emits success Toast', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(CLEAN_HEALTH)),
      http.post('/api/resorts/__all__/publish', (): Response =>
        HttpResponse.json(PUBLISH_RESPONSE),
      ),
    )
    const user = userEvent.setup()
    render(<Harness />)
    const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
    await waitFor((): void => {
      expect(confirmButton).not.toBeDisabled()
    })
    expect(confirmButton).not.toHaveAttribute('aria-describedby')

    await user.click(confirmButton)

    // Dialog unmounts on success; visible Toast emits.
    await waitFor((): void => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    await waitFor((): void => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /Published version 1-2026-05-12T08-30-15-247Z/,
      )
    })
  })

  it('Confirm DISABLED while health.value is loading; shows "Loading pre-publish checks…"', async (): Promise<void> => {
    // Hold the handler's resolve in an object property; a bare let-binding
    // is narrowed by TS to "always null" at the if-check below since the
    // reassignment lives inside the async-handler closure that TS can't
    // prove will run before the comparison.
    const gate: { resolve: (() => void) | null } = { resolve: null }
    server.use(
      http.get('/api/health', async (): Promise<Response> => {
        await new Promise<void>((resolve): void => {
          gate.resolve = resolve
        })
        return HttpResponse.json(CLEAN_HEALTH)
      }),
    )
    render(<Harness />)
    const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
    expect(confirmButton).toBeDisabled()
    const blocker = document.getElementById('publish-dialog-blocker')
    expect(blocker?.textContent).toBe('Loading pre-publish checks…')
    expect(blocker).toHaveAttribute('role', 'status')
    expect(confirmButton).toHaveAttribute('aria-describedby', 'publish-dialog-blocker')

    if (gate.resolve !== null) {
      gate.resolve()
    }
    await waitFor((): void => {
      expect(confirmButton).not.toBeDisabled()
    })
  })

  it('Confirm DISABLED when health fetch errors; shows error message', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'health-down' } },
          { status: 500 },
        ),
      ),
    )
    render(<Harness />)
    const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
    await waitFor((): void => {
      const blocker = document.getElementById('publish-dialog-blocker')
      expect(blocker?.textContent).toMatch(/Could not load health: health-down/)
    })
    expect(confirmButton).toBeDisabled()
    expect(confirmButton).toHaveAttribute('aria-describedby', 'publish-dialog-blocker')
  })

  it('on error: emits error Toast EXACTLY ONCE and keeps the dialog open', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(CLEAN_HEALTH)),
      http.post('/api/resorts/__all__/publish', (): Response =>
        HttpResponse.json(
          { error: { code: 'publish-validation-failed', message: 'dataset_empty' } },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    render(<Harness />)
    const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
    await waitFor((): void => {
      expect(confirmButton).not.toBeDisabled()
    })

    await user.click(confirmButton)

    const errorToast = await screen.findByRole('alert')
    expect(errorToast).toHaveTextContent(/Publish failed: dataset_empty/)
    // Dialog stays open on error so the user sees the recovery affordance.
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Wait an extra tick to confirm only one error toast was emitted.
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 30)
    })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('handleOpenChange swallows close requests while submitting (round-32 fold)', async (): Promise<void> => {
    const gate: { resolve: (() => void) | null } = { resolve: null }
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(CLEAN_HEALTH)),
      http.post('/api/resorts/__all__/publish', async (): Promise<Response> => {
        await new Promise<void>((resolve): void => {
          gate.resolve = resolve
        })
        return HttpResponse.json(PUBLISH_RESPONSE)
      }),
    )
    const user = userEvent.setup()
    render(<Harness />)
    const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
    await waitFor((): void => {
      expect(confirmButton).not.toBeDisabled()
    })

    await user.click(confirmButton)
    // Dialog is mid-submit. Pressing Escape must NOT close it.
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    if (gate.resolve !== null) {
      gate.resolve()
    }
    await waitFor((): void => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('Cancel button closes the dialog when not submitting', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(CLEAN_HEALTH)),
    )
    const user = userEvent.setup()
    render(<Harness />)
    const cancelButton = await screen.findByRole('button', { name: /Cancel/ })
    await user.click(cancelButton)
    await waitFor((): void => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('Confirm button text becomes "Publishing…" while submit is in flight', async (): Promise<void> => {
    const gate: { resolve: (() => void) | null } = { resolve: null }
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(CLEAN_HEALTH)),
      http.post('/api/resorts/__all__/publish', async (): Promise<Response> => {
        await new Promise<void>((resolve): void => {
          gate.resolve = resolve
        })
        return HttpResponse.json(PUBLISH_RESPONSE)
      }),
    )
    const user = userEvent.setup()
    render(<Harness />)
    const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
    await waitFor((): void => {
      expect(confirmButton).not.toBeDisabled()
    })

    await user.click(confirmButton)
    await waitFor((): void => {
      expect(screen.getByRole('button', { name: /Publishing…/ })).toBeDisabled()
    })

    if (gate.resolve !== null) {
      gate.resolve()
    }
    await waitFor((): void => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('wraps non-Error publish rejections so the Toast surfaces a string message', async (): Promise<void> => {
    // Covers usePublish's `e instanceof Error ? e : new Error(String(e))`
    // wrapping path through the dialog's surface — a string rejection still
    // produces a usable Toast message.
    const { apiClient } = await import('../lib/apiClient')
    vi.spyOn(apiClient, 'publish').mockImplementationOnce(
      // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/only-throw-error -- non-Error throw exercises usePublish's `e instanceof Error ? e : new Error(String(e))` else-branch; async signature matches the apiClient.publish() shape so the await in usePublish.submit() attaches its catch in the same microtask (avoids the noisy unhandled-rejection warning a sync Promise.reject would emit)
      async (): Promise<PublishResponse> => { throw 'plain string' },
    )
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(CLEAN_HEALTH)),
    )
    const user = userEvent.setup()
    render(<Harness />)
    const confirmButton = await screen.findByRole('button', { name: /Confirm/ })
    await waitFor((): void => {
      expect(confirmButton).not.toBeDisabled()
    })

    await user.click(confirmButton)

    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent(/Publish failed: plain string/)
  })
})
