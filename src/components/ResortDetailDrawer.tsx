import type { PublishedResort } from '../data/loadPublishedDataset'
import { formatConfidence, formatEuro, formatInteger } from '../lib/format'

type Props = {
  resort: PublishedResort | null
}

export default function ResortDetailDrawer({ resort }: Props) {
  if (!resort) {
    return null
  }

  return (
    <aside className="resort-detail-drawer" aria-label="Resort details">
      <header className="resort-detail-drawer__header">
        <p className="resort-detail-drawer__eyebrow">
          {resort.country} · {resort.region}
        </p>
        <h2>{resort.name}</h2>
        <p>{formatConfidence(resort.overall_confidence)}</p>
      </header>

      <dl className="resort-detail-drawer__stats">
        <div>
          <dt>Status</dt>
          <dd>{resort.status}</dd>
        </div>
        <div>
          <dt>Piste km</dt>
          <dd>{formatInteger(resort.piste_km)}</dd>
        </div>
        <div>
          <dt>Lift pass</dt>
          <dd>{formatEuro(resort.lift_pass_day_eur)}</dd>
        </div>
        <div>
          <dt>3-day trip</dt>
          <dd>{formatEuro(resort.estimated_trip_cost_3_days_eur)}</dd>
        </div>
      </dl>

      <section className="resort-detail-drawer__sources" aria-label="Source URLs">
        <h3>Source URLs</h3>
        <ul>
          {resort.source_urls.map((sourceUrl) => (
            <li key={sourceUrl}>
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                {sourceUrl}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
