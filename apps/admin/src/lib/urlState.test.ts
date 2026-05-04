import { describe, expect, it } from 'vitest'

import { parseURL, serializeURL } from './urlState'

describe('parseURL (PR 4.2 — Dashboard route only)', () => {
  it('returns dashboard route for empty search', (): void => {
    expect(parseURL('')).toEqual({ route: 'dashboard' })
  })
  it('returns dashboard route for ?route=dashboard', (): void => {
    expect(parseURL('?route=dashboard')).toEqual({ route: 'dashboard' })
  })
  it('drops unknown route value (defaults to dashboard)', (): void => {
    expect(parseURL('?route=bogus')).toEqual({ route: 'dashboard' })
  })
  it('drops extra unknown keys silently', (): void => {
    expect(parseURL('?route=dashboard&foo=bar')).toEqual({ route: 'dashboard' })
  })
})

describe('serializeURL (PR 4.2)', () => {
  it('serializes dashboard route as empty (default omitted)', (): void => {
    expect(serializeURL({ route: 'dashboard' })).toBe('')
  })
})

describe('round-trip', () => {
  it('parseURL(serializeURL({route: dashboard})) === input', (): void => {
    const input = { route: 'dashboard' as const }
    expect(parseURL(serializeURL(input))).toEqual(input)
  })
})
