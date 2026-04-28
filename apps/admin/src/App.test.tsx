import { resolve } from 'node:path'

import { loadResortDataset } from '@snowboard-trip-advisor/schema/node'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

// Inline test-time path resolution. Production wiring (admin Vite middleware plugin)
// lands in Epic 4 PR 4.1+; this inline form has no production caller.
//
// Note: import.meta.url in jsdom environment resolves to a non-file:// scheme.
// We use process.cwd() (the repo root when invoked via npm run qa / vitest workspace)
// plus an explicit path. The path is repo-root-relative: data/published/current.v1.json.
const FIXTURE_PATH = resolve(process.cwd(), 'data/published/current.v1.json')

describe('App', (): void => {
  it('renders the app shell landmark', (): void => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('can load the published dataset (smoke; full admin UI in Epic 4)', async (): Promise<void> => {
    const result = await loadResortDataset(FIXTURE_PATH)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views.length).toBe(2)
      expect(result.views.map((v): string => v.slug)).toEqual([
        'kotelnica-bialczanska',
        'spindleruv-mlyn',
      ])
    }
  })
})
