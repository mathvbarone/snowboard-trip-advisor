import type { PublishedResort } from '../data/loadPublishedDataset'
import { formatConfidence, formatEuro, formatInteger } from '../lib/format'

type Props = {
  resort: PublishedResort
}

export default function ResortCard({ resort }: Props) {
  return (
    <article className="resort-card" data-resort-id={resort.id}>
      <header className="resort-card__header">
        <div>
          <p className="resort-card__eyebrow">
            {resort.country} · {resort.region}
          </p>
          <h3>{resort.name}</h3>
        </div>
        <span className="resort-card__status">{resort.status}</span>
      </header>

      <dl className="resort-card__stats">
        <div>
          <dt>Piste km</dt>
          <dd>{formatInteger(resort.piste_km)}</dd>
        </div>
        <div>
          <dt>Day pass</dt>
          <dd>{formatEuro(resort.lift_pass_day_eur)}</dd>
        </div>
        <div>
          <dt>3-day trip</dt>
          <dd>{formatEuro(resort.estimated_trip_cost_3_days_eur)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{formatConfidence(resort.overall_confidence)}</dd>
        </div>
      </dl>

      <footer className="resort-card__footer">
        <span>{resort.size_category_official ?? 'Size unclassified'}</span>
        <span>{resort.price_category_ski_only ?? 'Price unclassified'}</span>
      </footer>
    </article>
  )
}
