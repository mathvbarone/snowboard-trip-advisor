import {
  Card,
  Drawer,
  ExternalLink,
  FieldValueRenderer,
} from '@snowboard-trip-advisor/design-system'
import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

import { airbnbDeepLink, bookingDeepLink } from '../lib/deepLinks'
import { countryToPrimaryLang } from '../lib/lang'
import { useDataset } from '../state/useDataset'
import { setURLState } from '../state/useURLState'

// DetailDrawer — non-modal slide-in panel on the right edge. Spec §5.5
// (frozen interface) + §7.11 (body landing in PR 3.5). The default-export
// shape and `DetailDrawerProps` signature are byte-untouched from PR 3.1c
// so App.tsx's lazy-import line stays stable.
//
// Composition (top → bottom):
//   1. Drawer title (Radix DialogTitle — accessible name only).
//   2. Body-level <h2> with `lang={countryToPrimaryLang(country)}` per §6.6.
//      The Radix DialogTitle does not accept `lang` from the title prop,
//      so the language-tagged copy is rendered as a separate heading
//      inside the body (the dialog's accessible name still comes from
//      the Radix title, satisfying the a11y contract).
//   3. Region label (sub-heading).
//   4. Snow conditions section — live signals (snow_depth_cm, lifts_open,
//      lift_pass_day) rendered via FieldValueRenderer (durable + live
//      states share the same renderer; provenance is per-field).
//   5. Terrain stats section — durable facts (altitude range, slopes_km,
//      lift_count, skiable_terrain_ha, season window).
//   6. Browse-lodging CTAs (Booking + Airbnb, both ExternalLink with
//      target="_blank") — deep links with security attrs (rel="noopener
//      noreferrer" + referrerpolicy="no-referrer" emitted by the
//      design-system ExternalLink). Parent §1 line 131 names BOTH
//      Booking and Airbnb providers + per-resort `booking_ss` /
//      `airbnb_ss` overrides; both CTAs ship in PR 3.5. Followed by
//      the honesty micro-copy widened from the spec's Booking-only
//      wording to cover both providers (the disclosure intent is
//      preserved verbatim; only the provider list expands).
//
// Slug → resort lookup pattern: `views.find((v) => v.slug === slug)`.
// App.tsx already gates the mount on `slugs.has(url.detail)`, so the
// find always returns a value at runtime. TS does not know this, so the
// undefined branch is handled explicitly with an early `return null`.
// Per CLAUDE.md "no fallbacks for scenarios that can't happen", the
// early-return is the discipline-preserving choice (a defensive throw
// would be dead code under the App-level guard); JSX permits null
// returns and the test suite asserts the App-level gate independently.

export interface DetailDrawerProps {
  slug: ResortSlug
}

export default function DetailDrawer({ slug }: DetailDrawerProps): JSX.Element | null {
  const { views } = useDataset()
  const resort = views.find((v): boolean => v.slug === slug)
  if (resort === undefined) {
    // App.tsx's `slugs.has(url.detail)` gate prevents this branch in
    // production; the early return keeps TS narrowing honest without
    // adding a defensive throw for an unreachable state.
    return null
  }
  const lang = countryToPrimaryLang(resort.country)
  const bookingHref = bookingDeepLink({
    slug: resort.slug,
    name: resort.name.en,
  })
  const airbnbHref = airbnbDeepLink({
    slug: resort.slug,
    name: resort.name.en,
  })

  // The drawer is mounted with `open` hardcoded to true (the parent
  // App.tsx unmounts the drawer when `?detail=` clears, so the
  // open-state lives in the URL, not in this component). Radix's
  // `onOpenChange` therefore only fires on close transitions
  // (Escape / outside-click); routing every call through
  // setURLState({ detail: undefined }) is correct without a `next`
  // guard. CLAUDE.md "no fallbacks for scenarios that can't happen".
  function handleOpenChange(): void {
    setURLState({ detail: undefined })
  }

  return (
    <Drawer
      open
      onOpenChange={handleOpenChange}
      title={resort.name.en}
      position="right"
    >
      {/* Heading mechanic (UX-4 fold):
            - DialogTitle (Drawer's `title` prop, rendered visibly inside
              the panel) is the SOLE visible heading + the dialog's
              accessible name (Radix wires aria-labelledby automatically).
            - Body <h2> is decorated with `sta-visually-hidden` —
              invisible to sighted users, but kept in the a11y tree with
              the BCP 47 `lang` attribute so screen readers / browser
              hyphenation get pronunciation context for the resort's
              locale.
          Net effect: ONE visible heading; TWO a11y reads of the resort
          name (DialogTitle + lang-tagged h2). The duplicate read is an
          acknowledged structural cost — the cleaner long-term fix is
          extending the Drawer primitive with an optional
          `titleLang?: string` (or `titleNode?: ReactNode`) so
          DialogTitle itself carries `lang=`. Deferred to Epic 6 backlog
          (touching the Drawer surface falls under design-system
          CODEOWNERS). */}
      <h2 className="sta-detail-drawer__name sta-visually-hidden" lang={lang}>
        {resort.name.en}
      </h2>
      <p className="sta-detail-drawer__region">{resort.region.en}</p>
      <Card>
        <section aria-label="Snow conditions" className="sta-detail-drawer__section">
          <h3>Snow conditions</h3>
          <dl>
            <div>
              <dt>Snow depth</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.snow_depth_cm}
                  formatter="number"
                  unit="cm"
                  missingLabel="—"
                  missingTooltip="No live snow signal yet"
                />
              </dd>
            </div>
            <div>
              <dt>Lifts open</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.lifts_open}
                  formatter="liftsOpen"
                  missingLabel="—"
                  missingTooltip="No live lift-status signal yet"
                />
              </dd>
            </div>
            <div>
              <dt>Lift pass / day</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.lift_pass_day}
                  formatter="money"
                  missingLabel="—"
                  missingTooltip="No lift-pass signal yet"
                />
              </dd>
            </div>
            <div>
              <dt>Lodging sample (median / night)</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.lodging_sample_median_eur}
                  formatter="lodging"
                  missingLabel="—"
                  missingTooltip="No live lodging sample yet"
                />
              </dd>
            </div>
          </dl>
        </section>
      </Card>
      <Card>
        <section aria-label="Terrain stats" className="sta-detail-drawer__section">
          <h3>Terrain stats</h3>
          <dl>
            <div>
              <dt>Altitude</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.altitude_m}
                  formatter="altitude"
                  unit="m"
                  missingLabel="—"
                />
              </dd>
            </div>
            <div>
              <dt>Slopes</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.slopes_km}
                  formatter="number"
                  unit="km"
                  missingLabel="—"
                />
              </dd>
            </div>
            <div>
              <dt>Lifts</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.lift_count}
                  formatter="number"
                  missingLabel="—"
                />
              </dd>
            </div>
            <div>
              <dt>Skiable terrain</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.skiable_terrain_ha}
                  formatter="number"
                  unit="ha"
                  missingLabel="—"
                />
              </dd>
            </div>
            <div>
              <dt>Season</dt>
              <dd>
                <FieldValueRenderer
                  field={resort.season}
                  formatter="months"
                  missingLabel="—"
                />
              </dd>
            </div>
          </dl>
        </section>
      </Card>
      {/* TODO Phase 2: analyst-note CMS. Section deliberately omitted — per
          CLAUDE.md "no half-finished implementations", a placeholder paragraph
          shipping prose for nonexistent data is not an acceptable Phase 1 stub. */}
      <section aria-label="Lodging" className="sta-detail-drawer__section">
        <ExternalLink href={bookingHref} target="_blank" variant="button">
          {`Browse Booking.com near ${resort.name.en}`}
        </ExternalLink>
        <ExternalLink href={airbnbHref} target="_blank" variant="button">
          {`Browse Airbnb near ${resort.name.en}`}
        </ExternalLink>
        <p className="sta-detail-drawer__honesty">
          Opens Booking.com or Airbnb in a new tab. We may receive a commission
          if you book; this does not affect the data shown.
        </p>
      </section>
    </Drawer>
  )
}
