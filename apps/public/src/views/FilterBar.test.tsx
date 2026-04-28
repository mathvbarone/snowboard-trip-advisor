import {
  ISOCountryCode,
  ISODateTimeString,
  ResortSlug,
  type ResortView,
} from '@snowboard-trip-advisor/schema'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FilterBar, { type PriceBucket } from './FilterBar'

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

function makeView({
  slug,
  country,
}: {
  slug: string
  country: string
}): ResortView {
  return {
    slug: ResortSlug.parse(slug),
    name: { en: slug },
    country: ISOCountryCode.parse(country),
    region: { en: 'Region' },
    altitude_m: { state: 'never_fetched' },
    slopes_km: { state: 'never_fetched' },
    lift_count: { state: 'never_fetched' },
    skiable_terrain_ha: { state: 'never_fetched' },
    season: { state: 'never_fetched' },
    snow_depth_cm: { state: 'never_fetched' },
    lifts_open: { state: 'never_fetched' },
    lift_pass_day: {
      state: 'fresh',
      value: { amount: 50, currency: 'EUR' },
      source: 'manual',
      observed_at: ISODateTimeString.parse('2026-04-26T08:00:00Z'),
    },
    lodging_sample_median_eur: { state: 'never_fetched' },
  }
}

const VIEWS_TWO_COUNTRY: ReadonlyArray<ResortView> = [
  makeView({ slug: 'kotelnica-bialczanska', country: 'PL' }),
  makeView({ slug: 'spindleruv-mlyn', country: 'CZ' }),
]

const VIEWS_ONE_COUNTRY: ReadonlyArray<ResortView> = [
  makeView({ slug: 'kotelnica-bialczanska', country: 'PL' }),
]

describe('FilterBar', (): void => {
  beforeEach((): void => {
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
  })

  it('renders a country chip per unique country when >1 country present', (): void => {
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'PL', pressed: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CZ', pressed: false })).toBeInTheDocument()
  })

  it('hides the country chip group when only one country is present', (): void => {
    render(
      <FilterBar
        views={VIEWS_ONE_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    // No PL chip at all; the chip-group region is omitted entirely so SR
    // users don't hear a meaningless "1 country chip" group.
    expect(screen.queryByRole('button', { name: 'PL' })).toBeNull()
  })

  it('reflects pressed state for chips that match URL country state', (): void => {
    setLocation('country=PL')
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'PL', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CZ', pressed: false })).toBeInTheDocument()
  })

  it('toggles a country into URL state when chip is clicked', async (): Promise<void> => {
    const user = userEvent.setup()
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'PL' }))
    // Country is REPLACE per urlState.PUSH_KEYS — only view + detail push.
    expect(replaceSpy).toHaveBeenCalled()
    expect(window.location.search).toContain('country=PL')
    pushSpy.mockRestore()
    replaceSpy.mockRestore()
  })

  it('toggles a country OUT of URL state when chip is clicked again', async (): Promise<void> => {
    setLocation('country=PL')
    const user = userEvent.setup()
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'PL' }))
    expect(window.location.search).not.toContain('country=PL')
  })

  it('renders the sort <Select> with default "name" sort', (): void => {
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    expect(screen.getByRole('combobox', { name: /sort/i })).toHaveValue('name')
  })

  it('drives &sort= on URL via setURLState when sort changes', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: /sort/i }),
      'snow_depth_desc',
    )
    expect(window.location.search).toContain('sort=snow_depth_desc')
  })

  it('renders a price bucket <Select> initialised to the controlled value', (): void => {
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="lo"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    expect(screen.getByRole('combobox', { name: /price/i })).toHaveValue('lo')
  })

  it('invokes onPriceBucketChange with the new bucket when select changes', async (): Promise<void> => {
    const user = userEvent.setup()
    const onPriceBucketChange = vi.fn<(b: PriceBucket) => void>()
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={onPriceBucketChange}
      />,
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: /price/i }),
      'mid',
    )
    expect(onPriceBucketChange).toHaveBeenCalledWith('mid')
  })

  it('does NOT push the price bucket to URL state (private filter UX, spec §3.1)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: /price/i }),
      'mid',
    )
    expect(window.location.search).not.toContain('price')
  })

  it('renders the slot when supplied (PR 3.4 fills it with the view toggle)', (): void => {
    render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
        slot={<div data-testid="slot">view-toggle</div>}
      />,
    )
    expect(screen.getByTestId('slot')).toBeInTheDocument()
  })

  it('renders nothing in the slot region when slot is undefined (PR 3.2 default)', (): void => {
    const { container } = render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    expect(container.querySelector('[data-region="slot"]')).toBeNull()
  })

  it('is axe-clean', async (): Promise<void> => {
    const { container } = render(
      <FilterBar
        views={VIEWS_TWO_COUNTRY}
        priceBucket="any"
        onPriceBucketChange={(): void => undefined}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
