import { render, screen, act } from '@testing-library/react'
import { Suspense, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { __resetForTests } from '../state/useDataset'

import CardsView from './cards'

async function renderAsync(node: ReactNode): Promise<void> {
  await act(async (): Promise<void> => {
    render(node)
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
}

describe('CardsView (placeholder for PR 3.1c)', (): void => {
  it('renders the dataset row count from useDataset', async (): Promise<void> => {
    __resetForTests()
    await renderAsync(
      <Suspense fallback={<p>loading</p>}>
        <CardsView />
      </Suspense>,
    )
    expect(await screen.findByTestId('cards-placeholder')).toHaveTextContent(
      'Resort count: 2',
    )
  })
})
