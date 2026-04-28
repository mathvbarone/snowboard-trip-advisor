import {
  ISOCountryCode,
  ISODateTimeString,
  ResortSlug,
  type ResortView,
} from '@snowboard-trip-advisor/schema'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import ResortCard from './ResortCard'

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

const FRESH = ISODateTimeString.parse('2026-04-26T08:00:00Z')

function makeKotelnica(): ResortView {
  return {
    slug: ResortSlug.parse('kotelnica-bialczanska'),
    name: { en: 'Kotelnica Białczańska' },
    country: ISOCountryCode.parse('PL'),
    region: { en: 'Białka Tatrzańska, Tatra Mountains' },
    altitude_m: {
      state: 'fresh',
      value: { min: 770, max: 920 },
      source: 'manual',
      observed_at: FRESH,
    },
    slopes_km: {
      state: 'fresh',
      value: 8,
      source: 'manual',
      observed_at: FRESH,
    },
    lift_count: { state: 'never_fetched' },
    skiable_terrain_ha: { state: 'never_fetched' },
    season: { state: 'never_fetched' },
    snow_depth_cm: {
      state: 'fresh',
      value: 80,
      source: 'manual',
      observed_at: FRESH,
    },
    lifts_open: { state: 'never_fetched' },
    lift_pass_day: {
      state: 'fresh',
      value: { amount: 51, currency: 'EUR' },
      source: 'manual',
      observed_at: FRESH,
    },
    lodging_sample_median_eur: { state: 'never_fetched' },
  }
}

function makeSpindleruv(): ResortView {
  return {
    slug: ResortSlug.parse('spindleruv-mlyn'),
    name: { en: 'Špindlerův Mlýn' },
    country: ISOCountryCode.parse('CZ'),
    region: { en: 'Krkonoše / Giant Mountains' },
    altitude_m: {
      state: 'fresh',
      value: { min: 715, max: 1310 },
      source: 'manual',
      observed_at: FRESH,
    },
    slopes_km: {
      state: 'fresh',
      value: 27,
      source: 'manual',
      observed_at: FRESH,
    },
    lift_count: { state: 'never_fetched' },
    skiable_terrain_ha: { state: 'never_fetched' },
    season: { state: 'never_fetched' },
    snow_depth_cm: {
      state: 'fresh',
      value: 65,
      source: 'manual',
      observed_at: FRESH,
    },
    lifts_open: { state: 'never_fetched' },
    lift_pass_day: {
      state: 'fresh',
      value: { amount: 60, currency: 'EUR' },
      source: 'manual',
      observed_at: FRESH,
    },
    lodging_sample_median_eur: { state: 'never_fetched' },
  }
}

describe('ResortCard', (): void => {
  beforeEach((): void => {
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
  })

  it('renders the resort name as a heading', (): void => {
    render(<ResortCard resort={makeKotelnica()} />)
    expect(
      screen.getByRole('heading', { name: 'Kotelnica Białczańska', level: 2 }),
    ).toBeInTheDocument()
  })

  it('annotates the heading with lang="pl" for a PL resort', (): void => {
    render(<ResortCard resort={makeKotelnica()} />)
    expect(
      screen.getByRole('heading', { name: 'Kotelnica Białczańska' }),
    ).toHaveAttribute('lang', 'pl')
  })

  it('annotates the heading with lang="cs" for a CZ resort', (): void => {
    render(<ResortCard resort={makeSpindleruv()} />)
    expect(
      screen.getByRole('heading', { name: 'Špindlerův Mlýn' }),
    ).toHaveAttribute('lang', 'cs')
  })

  it('renders the four named durable + live metric fields', (): void => {
    render(<ResortCard resort={makeKotelnica()} />)
    // altitude (durable, formatter=altitude → "770–920")
    expect(screen.getByText('770–920 m')).toBeInTheDocument()
    // slopes_km (durable, formatter=number → "8 km")
    expect(screen.getByText('8 km')).toBeInTheDocument()
    // snow_depth_cm (live, formatter=number → "80 cm")
    expect(screen.getByText('80 cm')).toBeInTheDocument()
    // lift_pass_day (live, formatter=money → "€51")
    expect(screen.getByText('€51')).toBeInTheDocument()
  })

  it('renders the four metric fields for the second seed resort too', (): void => {
    render(<ResortCard resort={makeSpindleruv()} />)
    expect(screen.getByText('715–1,310 m')).toBeInTheDocument()
    expect(screen.getByText('27 km')).toBeInTheDocument()
    expect(screen.getByText('65 cm')).toBeInTheDocument()
    expect(screen.getByText('€60')).toBeInTheDocument()
  })

  it('renders a star <IconButton> that carries data-detail-trigger=<slug>', (): void => {
    render(<ResortCard resort={makeKotelnica()} />)
    const star = screen.getByRole('button', { name: /add to shortlist/i })
    expect(star).toHaveAttribute('data-detail-trigger', 'kotelnica-bialczanska')
  })

  it('star reflects aria-pressed=false when slug is NOT in URL shortlist', (): void => {
    render(<ResortCard resort={makeKotelnica()} />)
    expect(
      screen.getByRole('button', { name: /add to shortlist/i, pressed: false }),
    ).toBeInTheDocument()
  })

  it('star reflects aria-pressed=true when slug IS in URL shortlist', (): void => {
    setLocation('shortlist=kotelnica-bialczanska')
    render(<ResortCard resort={makeKotelnica()} />)
    expect(
      screen.getByRole('button', { name: /add to shortlist/i, pressed: true }),
    ).toBeInTheDocument()
  })

  it('star toggles aria-pressed when clicked (writes to URL)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<ResortCard resort={makeKotelnica()} />)
    const star = screen.getByRole('button', { name: /add to shortlist/i })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await user.click(star)
    // Re-query — useSyncExternalStore propagates the URL change.
    expect(
      screen.getByRole('button', { name: /add to shortlist/i }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(window.location.search).toContain('shortlist=kotelnica-bialczanska')
  })

  it('star removes the slug from URL shortlist when toggled off', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska')
    const user = userEvent.setup()
    render(<ResortCard resort={makeKotelnica()} />)
    await user.click(screen.getByRole('button', { name: /add to shortlist/i }))
    expect(window.location.search).not.toContain('kotelnica-bialczanska')
  })

  it('renders a "Browse lodging near …" CTA with rel/referrerpolicy hardening', (): void => {
    render(<ResortCard resort={makeKotelnica()} />)
    const cta = screen.getByRole('link', { name: /browse lodging near kotelnica/i })
    expect(cta).toHaveAttribute('rel', 'noopener noreferrer')
    expect(cta).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('is axe-clean (default + with shortlist pressed)', async (): Promise<void> => {
    const { container, rerender } = render(<ResortCard resort={makeKotelnica()} />)
    expect(await axe(container)).toHaveNoViolations()
    setLocation('shortlist=kotelnica-bialczanska')
    rerender(<ResortCard resort={makeKotelnica()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
