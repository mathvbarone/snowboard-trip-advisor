import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DatasetFetchError,
  DatasetValidationError,
} from '../../lib/errors'

import DatasetUnavailable from './DatasetUnavailable'

describe('DatasetUnavailable', (): void => {
  beforeEach((): void => {
    vi.unstubAllEnvs()
  })
  afterEach((): void => {
    vi.unstubAllEnvs()
  })

  it('shows the network-failure copy when the error is a fetch DatasetFetchError', (): void => {
    const err = new DatasetFetchError('Network error', 'fetch')
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(
      screen.getByText("Couldn't reach the server — please refresh."),
    ).toBeInTheDocument()
  })

  it('shows the parse-failure copy when the error is a parse DatasetFetchError', (): void => {
    const err = new DatasetFetchError('Malformed JSON', 'parse', 200)
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(screen.getByText('The site received malformed data.')).toBeInTheDocument()
  })

  it('shows the validation-failure copy for a DatasetValidationError', (): void => {
    const err = new DatasetValidationError('Dataset failed validation', [])
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(screen.getByText('The published data is invalid.')).toBeInTheDocument()
  })

  it('shows a generic fallback when error is undefined', (): void => {
    render(<DatasetUnavailable error={undefined} onRetry={(): void => undefined} />)
    expect(
      screen.getByText('Couldn\'t load resort data. Please refresh.'),
    ).toBeInTheDocument()
  })

  it('shows the generic fallback for an unrelated Error type', (): void => {
    render(<DatasetUnavailable error={new Error('boom')} onRetry={(): void => undefined} />)
    expect(
      screen.getByText('Couldn\'t load resort data. Please refresh.'),
    ).toBeInTheDocument()
  })

  it('renders a Retry button that invokes onRetry', async (): Promise<void> => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    const err = new DatasetFetchError('Network error', 'fetch')
    render(<DatasetUnavailable error={err} onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('uses role="alert" on the wrapping element', (): void => {
    const err = new DatasetFetchError('Network error', 'fetch')
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('moves focus to the alert wrapper on mount', (): void => {
    const err = new DatasetFetchError('Network error', 'fetch')
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it('renders dev-only <details> with the error message in DEV mode', (): void => {
    vi.stubEnv('DEV', true)
    const err = new DatasetFetchError('Network error', 'fetch')
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(screen.getByText(/Network error/)).toBeInTheDocument()
  })

  it('caps the validation issues list at 20 with a "+N more" tail', (): void => {
    vi.stubEnv('DEV', true)
    const issues = Array.from({ length: 25 }, (_, i) => ({
      code: 'zod_parse_failed' as const,
      zod_issues: [{ path: [`field_${String(i)}`], message: `issue ${String(i)}` }],
    }))
    const err = new DatasetValidationError('Dataset failed validation', issues)
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(screen.getByText(/\+5 more/)).toBeInTheDocument()
  })

  it('does not render the dev-only <details> in production', (): void => {
    vi.stubEnv('DEV', false)
    const err = new DatasetFetchError('Network error 12345', 'fetch')
    render(<DatasetUnavailable error={err} onRetry={(): void => undefined} />)
    expect(screen.queryByText(/Network error 12345/)).not.toBeInTheDocument()
  })
})
