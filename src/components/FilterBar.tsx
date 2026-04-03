type Props = {
  search: string
  onSearchChange: (value: string) => void
}

export default function FilterBar({ search, onSearchChange }: Props) {
  return (
    <section className="filter-bar" aria-label="Resort filters">
      <label className="filter-bar__field">
        <span>Search resorts</span>
        <input
          aria-label="Search resorts"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Verbier, St Anton, Les 3 Vallees"
        />
      </label>
      <p className="filter-bar__hint">
        Search by resort name, region, or country across the published dataset.
      </p>
    </section>
  )
}
