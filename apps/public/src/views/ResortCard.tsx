import {
  Card,
  ExternalLink,
  FieldValueRenderer,
  IconButton,
  StarGlyph,
} from '@snowboard-trip-advisor/design-system'
import type { ResortView } from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

import { countryToPrimaryLang } from '../lib/lang'
import { useShortlist } from '../state/useShortlist'
import { setURLState } from '../state/useURLState'

// Single-resort card on the cards landing. Composition (top → bottom):
//  1. Hero photo strip (decorative CSS background — no <img alt>).
//  2. <h2> resort name with `lang={countryToPrimaryLang(country)}` per §6.6.
//     - Star <IconButton data-detail-trigger=<slug> aria-pressed=> next to
//       the heading (frozen interface per §5.5).
//  3. Region label (sub-heading).
//  4. Four FieldValueRenderer rows: durable (altitude_m, slopes_km) and
//     live (snow_depth_cm, lift_pass_day).
//  5. "Browse lodging near X" external CTA (rel/referrerpolicy hardened
//     via the design-system ExternalLink wrapper).
//
// SHORTLIST_MAX (=6) head-truncation lives in `lib/urlState.ts`'s
// parseURL/serializeURL — both the in-memory snapshot and the wire form are
// capped there, so toggleShortlist below can simply append without its own
// cap. Likewise the "isShortlisted" branch eliminates a redundant
// dedupe-check that would otherwise be dead code (and a coverage gap).

export interface ResortCardProps {
  resort: ResortView
}

export default function ResortCard({ resort }: ResortCardProps): JSX.Element {
  const { shortlist } = useShortlist()
  const isShortlisted = shortlist.includes(resort.slug)
  const lang = countryToPrimaryLang(resort.country)

  function toggleShortlist(): void {
    if (isShortlisted) {
      const next = shortlist.filter((s): boolean => s !== resort.slug)
      setURLState({ shortlist: next })
      return
    }
    setURLState({ shortlist: [...shortlist, resort.slug] })
  }

  const lodgingHref = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(
    resort.name.en,
  )}`

  return (
    <Card>
      <div className="sta-resort-card">
        <div className="sta-resort-card__photo" aria-hidden="true" />
        <header className="sta-resort-card__heading-row">
          <h2
            className="sta-resort-card__name"
            lang={lang}
          >
            {resort.name.en}
          </h2>
          <IconButton
            // Stable aria-label — `aria-pressed` carries the on/off state
            // so the label does not flip between "Add" / "Remove". SR users
            // hear the same name with a press-state delta on toggle.
            aria-label={`Add to shortlist: ${resort.name.en}`}
            aria-pressed={isShortlisted}
            data-detail-trigger={resort.slug}
            onClick={toggleShortlist}
          >
            <StarGlyph size={20} filled={isShortlisted} />
          </IconButton>
        </header>
        <p className="sta-resort-card__region">{resort.region.en}</p>
        <dl className="sta-resort-card__metrics">
          <div className="sta-resort-card__metric">
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
          <div className="sta-resort-card__metric">
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
          <div className="sta-resort-card__metric">
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
          <div className="sta-resort-card__metric">
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
        </dl>
        <ExternalLink href={lodgingHref} target="_blank" variant="button">
          {`Browse lodging near ${resort.name.en}`}
        </ExternalLink>
      </div>
    </Card>
  )
}
