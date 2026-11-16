type TypeOption = {
  label: string
  count: number
}

type FiltersProps = {
  query: string
  type: string
  types: TypeOption[]
  favoritesOnly: boolean
  favoriteCount: number
  totalFavorites: number
  sortKey: string
  sortDir: 'asc' | 'desc'
  onQueryChange: (query: string) => void
  onTypeChange: (type: string) => void
  onToggleFavorites: (favoritesOnly: boolean) => void
  onClearFavorites: () => void
  onSortKeyChange: (key: string) => void
  onSortDirChange: (dir: 'asc' | 'desc') => void
  onReset: () => void
}

export function Filters({
  query,
  type,
  types,
  favoritesOnly,
  favoriteCount,
  totalFavorites,
  sortKey,
  sortDir,
  onQueryChange,
  onTypeChange,
  onToggleFavorites,
  onClearFavorites,
  onSortKeyChange,
  onSortDirChange,
  onReset,
}: FiltersProps) {
  const isFiltering =
    query.trim() !== '' || type !== 'all' || favoritesOnly

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

      <div className="filters-group" role="group" aria-label="Filter photos">
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

        <button
          type="button"
          className={`favorites-filter${favoritesOnly ? ' is-active' : ''}`}
          aria-pressed={favoritesOnly}
          onClick={() => onToggleFavorites(!favoritesOnly)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
              fill={favoritesOnly ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
          Favorites{favoriteCount > 0 ? ` (${favoriteCount})` : ''}
        </button>

        {totalFavorites > 0 ? (
          <button
            type="button"
            className="favorites-clear"
            onClick={onClearFavorites}
          >
            Clear favorites
          </button>
        ) : null}

        {isFiltering ? (
          <button type="button" className="filter-reset" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </div>

      <div
        className="filters-group filters-sort"
        role="group"
        aria-label="Sort photos"
      >
        <label className="sort-filter">
          <span className="type-filter-label">Order</span>
          <select
            className="type-select"
            value={sortKey}
            onChange={(event) => onSortKeyChange(event.target.value)}
            aria-label="Sort photos by"
          >
            <option value="name">Name</option>
            <option value="modified">Date modified</option>
            <option value="size">Size</option>
            <option value="type">Type</option>
          </select>
        </label>

        <button
          type="button"
          className="sort-dir"
          aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          onClick={() =>
            onSortDirChange(sortDir === 'asc' ? 'desc' : 'asc')
          }
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>
    </div>
  )
}
