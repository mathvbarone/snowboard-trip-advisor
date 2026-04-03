import { useEffect, useMemo, useState } from 'react'
import Hero from './components/Hero'
import FilterBar from './components/FilterBar'
import ComparePanel from './components/ComparePanel'
import ResortGrid from './components/ResortGrid'
import { loadPublishedDataset, type PublishedResort } from './data/loadPublishedDataset'
import { parseCompareIds } from './lib/queryState'
import './styles/tokens.css'
import './styles/global.css'

export default function App() {
  const [search, setSearch] = useState('')
  const [resorts, setResorts] = useState<PublishedResort[]>([])

  useEffect(() => {
    let isActive = true

    loadPublishedDataset().then((dataset) => {
      if (!isActive) {
        return
      }

      setResorts(dataset.resorts)
    })

    return () => {
      isActive = false
    }
  }, [])

  const compareIds = useMemo(
    () => parseCompareIds(window.location.search),
    [],
  )

  const filteredResorts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    if (!normalizedSearch) {
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
    () => resorts.filter((resort) => compareIds.includes(resort.id)),
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
