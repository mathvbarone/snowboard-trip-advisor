import { describe, expect, it } from 'vitest'
import { runAxe, MOBILE_VIEWPORT } from './harness'

describe('harness defaults', (): void => {
  it('default mobile viewport is 360×780', (): void => {
    expect(MOBILE_VIEWPORT).toEqual({ width: 360, height: 780 })
  })
})

describe('runAxe', (): void => {
  it('reports no violations on a minimal accessible page', async (): Promise<void> => {
    const html =
      '<!doctype html><html lang="en"><head><title>x</title></head><body><main><h1>x</h1></main></body></html>'
    const result = await runAxe(html)
    expect(result.violations).toEqual([])
  })
  it('reports violations on a missing-lang document', async (): Promise<void> => {
    const html =
      '<!doctype html><html><head><title>x</title></head><body><main><h1>x</h1></main></body></html>'
    const result = await runAxe(html)
    expect(result.violations.length).toBeGreaterThan(0)
  })
})
