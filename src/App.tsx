import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import Hero from './components/Hero'
import FilterBar from './components/FilterBar'
import ComparePanel from './components/ComparePanel'
import ResortGrid from './components/ResortGrid'
import { loadPublishedDataset, type PublishedResort } from './data/loadPublishedDataset'
import { parseCompareIds } from './lib/queryState'
import './styles/tokens.css'
import './styles/global.css'

export default function App(): JSX.Element {
  const [search, setSearch] = useState('')
  const [resorts, setResorts] = useState<PublishedResort[]>([])

  useEffect(() => {
    let isActive = true

    void loadPublishedDataset().then((dataset) => {
      if (!isActive) {
        return
      }

      setResorts(dataset.resorts)
    })

    return (): void => {
      isActive = false
    }
  }, [])

  const compareIds = useMemo(
    (): string[] => parseCompareIds(window.location.search),
    [],
  )

  const filteredResorts = useMemo((): PublishedResort[] => {
    const normalizedSearch = search.trim().toLowerCase()

    if (normalizedSearch.length === 0) {
      return resorts
    }

    return resorts.filter((resort) =>
      [resort.name, resort.country, resort.region]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [resorts, search])

  const comparedResorts = useMemo(
    (): PublishedResort[] => resorts.filter((resort) => compareIds.includes(resort.id)),
    [compareIds, resorts],
  )

  return (
    <main className="app-shell">
      <Hero />
      <FilterBar search={search} onSearchChange={setSearch} />
      <ComparePanel resorts={comparedResorts} />
      <ResortGrid resorts={filteredResorts} />
    </main>
  )
}
