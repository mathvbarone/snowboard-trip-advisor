import type { ValidationIssue } from '@snowboard-trip-advisor/schema'

// Two error classes for the two failure axes downstream code branches on:
//
// - DatasetFetchError covers the network / HTTP / JSON-parse failures.
//   `kind` = 'fetch' | 'parse' so DatasetUnavailable can show specific
//   copy (spec §4.5).
// - DatasetValidationError covers the validator-rejected dataset case;
//   `issues` is the typed ValidationIssue list (capped at 20 in the
//   dev-only details block per spec §10.3).

export class DatasetFetchError extends Error {
  readonly kind: 'fetch' | 'parse'
  readonly status?: number

  constructor(
    message: string,
    kind: 'fetch' | 'parse',
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'DatasetFetchError'
    this.kind = kind
    if (status !== undefined) {
      this.status = status
    }
  }
}

export class DatasetValidationError extends Error {
  readonly issues: ReadonlyArray<ValidationIssue>

  constructor(message: string, issues: ReadonlyArray<ValidationIssue>) {
    super(message)
    this.name = 'DatasetValidationError'
    this.issues = issues
  }
}

// Telemetry seam — exported as a function (not a constant) so tests can
// vi.spyOn it. Phase 1 ships a no-op; Epic 6 wires Sentry without
// touching the call sites (App.tsx + DatasetUnavailable per spec §4.5).
export function onDatasetError(err: unknown): void {
  void err
}
