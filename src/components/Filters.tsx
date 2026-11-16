type TypeOption = {
  label: string
  count: number
}

type FiltersProps = {
  query: string
  type: string
  types: TypeOption[]
  onQueryChange: (query: string) => void
  onTypeChange: (type: string) => void
  onReset: () => void
}

export function Filters({
  query,
  type,
  types,
  onQueryChange,
  onTypeChange,
  onReset,
}: FiltersProps) {
  const isFiltering = query.trim() !== '' || type !== 'all'

  return (
    <div className="filters">
      <div className="search-field">
        <svg
          className="search-icon"
          viewBox="0 0 20 20"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="8.5"
            cy="8.5"
            r="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12.8 12.8L17 17"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>

        <input
          type="search"
          className="search-input"
          value={query}
          placeholder="Search file names…"
          aria-label="Search photos by file name"
          onChange={(event) => onQueryChange(event.target.value)}
        />

        {query ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
          >
            ✕
          </button>
        ) : null}
      </div>

      <label className="type-filter">
        <span className="type-filter-label">Type</span>
        <select
          className="type-select"
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
        >
          <option value="all">All types</option>
          {types.map((option) => (
            <option key={option.label} value={option.label}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>

      {isFiltering ? (
        <button type="button" className="filter-reset" onClick={onReset}>
          Reset
        </button>
      ) : null}
    </div>
  )
}
