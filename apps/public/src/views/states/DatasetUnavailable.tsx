import { Button, EmptyStateLayout } from '@snowboard-trip-advisor/design-system'
import type { JSX, ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { DatasetFetchError, DatasetValidationError } from '../../lib/errors'

// Empty/error layout for dataset failures (spec §4.5). Branches on the error
// shape to surface specific user copy:
//   - DatasetFetchError(kind='fetch')  → 'reach the server' (likely transient)
//   - DatasetFetchError(kind='parse')  → 'malformed data'    (server-side bad JSON)
//   - DatasetValidationError           → 'invalid published data'
//   - everything else / undefined      → generic fallback
//
// The wrapper element carries role="alert" and is focused on mount so the
// announcement happens once. The dev-only <details> block lives behind
// import.meta.env.DEV so prod bundles don't ship the diagnostic strings; the
// validation-issues list is capped at 20 with a "+N more" tail per spec
// §10.3 to keep the dialog readable when the validator finds many problems.

const ISSUE_LIMIT = 20

export interface DatasetUnavailableProps {
  error: Error | undefined
  onRetry: () => void
}

function copyFor(error: Error | undefined): string {
  if (error instanceof DatasetValidationError) {
    return 'The published data is invalid.'
  }
  if (error instanceof DatasetFetchError) {
    if (error.kind === 'fetch') {
      return "Couldn't reach the server — please refresh."
    }
    return 'The site received malformed data.'
  }
  return "Couldn't load resort data. Please refresh."
}

function devDetails(error: Error | undefined): ReactNode {
  if (!import.meta.env.DEV || error === undefined) {
    return null
  }
  let issuesNode: ReactNode = null
  if (error instanceof DatasetValidationError) {
    const head = error.issues.slice(0, ISSUE_LIMIT)
    const tail = error.issues.length - head.length
    issuesNode = (
      <ul aria-live="off">
        {head.map((issue, i) => (
          <li key={i}>{JSON.stringify(issue)}</li>
        ))}
        {tail > 0 ? <li>{`+${String(tail)} more`}</li> : null}
      </ul>
    )
  }
  return (
    <details aria-live="off">
      <summary>Diagnostics</summary>
      <p>{error.message}</p>
      {issuesNode}
    </details>
  )
}

export default function DatasetUnavailable({
  error,
  onRetry,
}: DatasetUnavailableProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect((): void => {
    ref.current?.focus()
  }, [])

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="sta-dataset-unavailable"
    >
      <EmptyStateLayout
        heading="Resort data unavailable"
        body={copyFor(error)}
        cta={<Button onClick={onRetry}>Retry</Button>}
        details={devDetails(error)}
      />
    </div>
  )
}
