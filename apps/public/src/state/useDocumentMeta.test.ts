import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { URLState } from '../lib/urlState'

import { useDocumentMeta } from './useDocumentMeta'

function urlState(partial: Partial<URLState> = {}): URLState {
  return {
    view: 'cards',
    sort: 'name',
    country: [],
    shortlist: [],
    ...partial,
  }
}

describe('useDocumentMeta', (): void => {
  afterEach((): void => {
    document.title = 'Snowboard Trip Advisor'
    const link = document.querySelector('link[rel="canonical"]')
    if (link !== null) {
      link.setAttribute('href', '')
    }
  })

  it('writes the base title for the cards view', (): void => {
    renderHook((): void => {
      useDocumentMeta(urlState({ view: 'cards' }))
    })
    expect(document.title).toBe('Snowboard Trip Advisor')
  })

  it('appends the matrix view to the title when viewing the matrix', (): void => {
    renderHook((): void => {
      useDocumentMeta(urlState({ view: 'matrix' }))
    })
    expect(document.title).toBe('Comparison matrix — Snowboard Trip Advisor')
  })

  it('writes a canonical href derived from the URL state', (): void => {
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: Object.assign({}, original, {
        origin: 'https://example.test',
        pathname: '/',
      }),
      writable: true,
      configurable: true,
    })
    renderHook((): void => {
      useDocumentMeta(urlState({ view: 'matrix' }))
    })
    const link = document.querySelector('link[rel="canonical"]')
    expect(link?.getAttribute('href')).toBe('https://example.test/?view=matrix')
  })

  it('writes a canonical href without a query string when state is default', (): void => {
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: Object.assign({}, original, {
        origin: 'https://example.test',
        pathname: '/',
      }),
      writable: true,
      configurable: true,
    })
    renderHook((): void => {
      useDocumentMeta(urlState())
    })
    const link = document.querySelector('link[rel="canonical"]')
    expect(link?.getAttribute('href')).toBe('https://example.test/')
  })

  it('creates a canonical link element if one is not already present', (): void => {
    const existing = document.querySelector('link[rel="canonical"]')
    existing?.remove()
    renderHook((): void => {
      useDocumentMeta(urlState())
    })
    const link = document.querySelector('link[rel="canonical"]')
    expect(link).not.toBeNull()
  })
})
