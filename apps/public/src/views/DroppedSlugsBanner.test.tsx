import { act, render, screen, waitFor, type RenderResult } from '@testing-library/react'
import { axe } from 'jest-axe'
import { Suspense, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetForTests as resetDataset } from '../state/useDataset'
import { __resetShortlistForTests } from '../state/useShortlist'

import DroppedSlugsBanner from './DroppedSlugsBanner'

// DroppedSlugsBanner — surfaces requested-but-missing shortlist slugs
// (a share-link with a resort that's been removed from the dataset).
// Renders null on the happy path (empty shortlist or all known); renders
// a status aside when one or more slugs are dropped. No dismiss button:
// the banner auto-clears when the URL updates (read-only signal).

async function renderAsync(node: ReactNode): Promise<RenderResult> {
  let view!: RenderResult
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
  return view
}

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

async function renderBanner(): Promise<RenderResult> {
  return renderAsync(
    <Suspense fallback={<p data-testid="suspense-fallback">loading</p>}>
      <DroppedSlugsBanner />
    </Suspense>,
  )
}

// Wait for the dataset's Suspense boundary to resolve. The banner is
// either present (dropped slugs) or null (happy path); in both cases
// the Suspense fallback `<p>loading</p>` should disappear once the
// dataset hydrates.
async function waitForDatasetResolved(): Promise<void> {
  await waitFor(
    (): void => {
      expect(screen.queryByTestId('suspense-fallback')).toBeNull()
    },
    { timeout: 1500 },
  )
}

describe('DroppedSlugsBanner', (): void => {
  beforeEach((): void => {
    resetDataset()
    __resetShortlistForTests()
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
    __resetShortlistForTests()
  })

  it('renders null when the shortlist is empty', async (): Promise<void> => {
    const view = await renderBanner()
    await waitForDatasetResolved()
    expect(view.queryByRole('status')).toBeNull()
    expect(view.container.querySelector('[data-region="dropped-slugs-banner"]'))
      .toBeNull()
  })

  it('renders null when every shortlist slug exists in the dataset', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    const view = await renderBanner()
    await waitForDatasetResolved()
    expect(view.queryByRole('status')).toBeNull()
  })

  it('renders an aside listing the one dropped slug (1-resort copy)', async (): Promise<void> => {
    // 'ghost-resort' is shape-valid (slug regex) but absent from the seed
    // dataset, so it should be flagged as dropped.
    setLocation('shortlist=kotelnica-bialczanska,ghost-resort')
    await renderBanner()
    await waitForDatasetResolved()
    const region = await screen.findByRole('status')
    expect(region).toBeInTheDocument()
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveAttribute('data-region', 'dropped-slugs-banner')
    expect(region).toHaveTextContent('1 requested resort not found in dataset.')
    const items = region.querySelectorAll('li')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('ghost-resort')
  })

  it('renders the 2-resort plural copy when two slugs are dropped', async (): Promise<void> => {
    setLocation('shortlist=ghost-resort,phantom-peak')
    await renderBanner()
    await waitForDatasetResolved()
    const region = await screen.findByRole('status')
    expect(region).toHaveTextContent('2 requested resorts not found in dataset.')
    const items = region.querySelectorAll('li')
    expect(items).toHaveLength(2)
    const labels = Array.from(items).map((li): string | null => li.textContent)
    expect(labels).toEqual(['ghost-resort', 'phantom-peak'])
  })

  it('is axe-clean when the banner renders', async (): Promise<void> => {
    setLocation('shortlist=ghost-resort')
    const view = await renderBanner()
    await waitForDatasetResolved()
    await screen.findByRole('status')
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
