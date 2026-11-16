import { useEffect, useRef, useState } from 'react'
import {
  parseFavoritesJson,
  type FavoriteMap,
} from '../lib/favorites'

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
  onExportFavorites: () => void
  onImportFavorites: (favorites: FavoriteMap) => void
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
  onExportFavorites,
  onImportFavorites,
  onSortKeyChange,
  onSortDirChange,
  onReset,
}: FiltersProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const [importError, setImportError] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)

  // A click outside the group closes the actions dropdown.
  useEffect(() => {
    if (!favoritesOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setFavoritesOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [favoritesOpen])

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseFavoritesJson(await file.text())
    if (!parsed) {
      setImportError(true)
      return
    }
    setImportError(false)
    onImportFavorites(parsed)
  }

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

        <button
          type="button"
          className="search-clear"
          onClick={() => onQueryChange('')}
          aria-label="Clear search"
          disabled={!query}
        >
          ✕
        </button>
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

        {/* The filter button and its actions dropdown are separate controls:
            the heart filters, the caret beside it opens the actions list. */}
        <div
          className="favorites-menu"
          ref={menuRef}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !favoritesOpen) return
            event.stopPropagation()
            setFavoritesOpen(false)
            menuToggleRef.current?.focus()
          }}
        >
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

          <button
            ref={menuToggleRef}
            type="button"
            className="favorites-toggle"
            aria-label="Favorites actions"
            title="Favorites actions"
            aria-expanded={favoritesOpen}
            aria-controls={favoritesOpen ? 'favorites-list' : undefined}
            onClick={() => setFavoritesOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {favoritesOpen ? (
            <div
              className="favorites-list"
              id="favorites-list"
              role="group"
              aria-label="Favorites actions"
            >
              <button
                type="button"
                onClick={onClearFavorites}
                disabled={totalFavorites === 0}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M3.5 6h17M8.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18.5 6l-.9 13.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Clear favorites
              </button>

              <button
                type="button"
                onClick={onExportFavorites}
                disabled={totalFavorites === 0}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M12 3.5v10.5M7.5 10 12 14.5 16.5 10M4 20h16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Export favorites
              </button>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M12 20V9.5M7.5 14 12 9.5 16.5 14M4 4h16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Import favorites
              </button>

              {importError ? (
                <p className="favorites-error" role="alert">
                  That file is not a favorites export.
                </p>
              ) : null}

              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  void handleImportFile(file)
                }}
              />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="filter-reset"
          onClick={onReset}
          disabled={!isFiltering}
          aria-label="Reset filters"
          title="Reset"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M3 2v6h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
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
