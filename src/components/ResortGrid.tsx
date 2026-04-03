import type { PublishedResort } from '../data/loadPublishedDataset'
import ResortCard from './ResortCard'

type Props = {
  resorts: PublishedResort[]
}

export default function ResortGrid({ resorts }: Props) {
  if (!resorts.length) {
    return (
      <section className="resort-grid resort-grid--empty" aria-label="Resort results">
        <p>No resorts match the current filters.</p>
      </section>
    )
  }

  return (
    <section className="resort-grid" aria-label="Resort results">
      <ul className="resort-grid__list">
        {resorts.map((resort) => (
          <li key={resort.id}>
            <ResortCard resort={resort} />
          </li>
        ))}
      </ul>
    </section>
  )
}
