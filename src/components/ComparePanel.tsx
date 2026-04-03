import type { JSX } from 'react'

type CompareResort = {
  id: string
  name: string
}

type Props = {
  resorts: CompareResort[]
}

export default function ComparePanel({ resorts }: Props): JSX.Element {
  return (
    <section className="compare-panel" aria-label="Compare resorts">
      <header className="compare-panel__header">
        <h2>Compare resorts</h2>
        <p>Compare up to four resorts and keep the selection in the URL.</p>
      </header>

      {resorts.length ? (
        <ol className="compare-panel__list">
          {resorts.map((resort) => (
            <li key={resort.id} data-resort-id={resort.id}>
              {resort.name}
            </li>
          ))}
        </ol>
      ) : (
        <p className="compare-panel__empty">
          Select resorts to compare their size, price, and snow metrics.
        </p>
      )}
    </section>
  )
}
