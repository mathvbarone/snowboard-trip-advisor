import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import FilterBar from './FilterBar'

it('updates search text through the callback', () => {
  const onSearchChange = vi.fn()
  render(<FilterBar search="" onSearchChange={onSearchChange} />)

  fireEvent.change(screen.getByRole('searchbox', { name: /search resorts/i }), {
    target: { value: 'Verbier' },
  })

  expect(onSearchChange).toHaveBeenCalledWith('Verbier')
})
