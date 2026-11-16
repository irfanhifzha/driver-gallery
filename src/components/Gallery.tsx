import { useEffect, useMemo, useState } from 'react'
import { Filters } from './Filters'
import { ImageGrid } from './ImageGrid'
import { Lightbox } from './Lightbox'
import { Pagination } from './Pagination'
import {
  EmptyState,
  ErrorState,
  LoadingGrid,
  NoMatchesState,
} from './States'
import { Toolbar } from './Toolbar'
import { useDriveImages } from '../hooks/useDriveImages'
import { fileType, withoutRawDuplicates, type DriveImage } from '../lib/drive'
import { readUrlState, updateUrl } from '../lib/urlState'
import {
  favoritesToJson,
  readFavorites,
  toggleFavorite,
  writeFavorites,
  type FavoriteMap,
} from '../lib/favorites'

/** Photos per page. The full listing is cached, so paging is instant. */
const PER_PAGE = 24

type GalleryProps = {
  folderId: string
  apiKey: string
}

export function Gallery({ folderId, apiKey }: GalleryProps) {
  const { images, loading, error, refresh } = useDriveImages(folderId, apiKey)
  const [page, setPage] = useState(1)
  const [hideRaw, setHideRaw] = useState(true)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  type SortKey = 'name' | 'modified' | 'size' | 'type'
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [favorites, setFavorites] = useState<FavoriteMap>(readFavorites)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // A `?photo=` deep link is resolved once the listing is available; while it
  // is pending, the URL is left alone so the parameter isn't cleared first.
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(
    () => readUrlState().photo,
  )

  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const image of images) {
      const label = fileType(image)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count }))
  }, [images])

  const needle = query.trim().toLowerCase()
  const filtered = images.filter((image) => {
    if (needle && !image.name.toLowerCase().includes(needle)) return false
    if (type !== 'all' && fileType(image) !== type) return false
    if (favoritesOnly && !favorites[image.id]) return false
    return true
  })
  const favoriteCount = images.reduce(
    (count, image) => (favorites[image.id] ? count + 1 : count),
    0,
  )
  const deduped = withoutRawDuplicates(filtered)
  const duplicateCount = filtered.length - deduped.length
  const shown = hideRaw ? deduped : filtered

  const sorted = useMemo(() => {
    const copy = [...shown]
    const direction = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      let comparison = 0
      if (sortKey === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      } else if (sortKey === 'modified') {
        comparison = (a.modifiedTime ?? '').localeCompare(b.modifiedTime ?? '')
      } else if (sortKey === 'size') {
        comparison = Number(a.size ?? 0) - Number(b.size ?? 0)
      } else if (sortKey === 'type') {
        comparison = fileType(a).localeCompare(fileType(b))
      }
      return comparison * direction
    })
    return copy
  }, [shown, sortKey, sortDir])

  const hasImages = sorted.length > 0
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PER_PAGE
  const pageImages = sorted.slice(start, start + PER_PAGE)
  const activeIndex =
    openIndex !== null && openIndex < pageImages.length ? openIndex : null
  const activeImage = activeIndex !== null ? pageImages[activeIndex] : undefined

  // Resolve a shared `?photo=<id>` against the full sorted list, then jump to
  // the page it lives on so the lightbox opens on the right photo.
  useEffect(() => {
    if (!pendingPhoto) return
    // On a cold load, wait for the listing instead of discarding the link.
    if (loading && images.length === 0) return

    const index = sorted.findIndex((image) => image.id === pendingPhoto)
    if (index >= 0) {
      setPage(Math.floor(index / PER_PAGE) + 1)
      setOpenIndex(index % PER_PAGE)
    } else if (!error || images.length > 0) {
      // The link no longer matches anything visible; drop the stale parameter.
      updateUrl({ photo: null })
    }
    setPendingPhoto(null)
  }, [pendingPhoto, loading, images.length, error, sorted])

  // Keep `?photo=` in step with the lightbox so the address bar stays shareable.
  useEffect(() => {
    if (pendingPhoto !== null) return
    updateUrl({ photo: activeImage?.id ?? null })
  }, [pendingPhoto, activeImage?.id])

  const resetPaging = () => {
    setPage(1)
    setOpenIndex(null)
  }

  const handleRefresh = () => {
    resetPaging()
    refresh()
  }

  const goToPage = (next: number) => {
    setPage(next)
    setOpenIndex(null)
    updateUrl({ photo: null })
    window.scrollTo({ top: 0 })
  }

  const handleToggleHideRaw = (hide: boolean) => {
    setHideRaw(hide)
    resetPaging()
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    resetPaging()
  }

  const handleTypeChange = (value: string) => {
    setType(value)
    resetPaging()
  }

  const handleSortKeyChange = (value: string) => {
    setSortKey(value as SortKey)
    resetPaging()
  }

  const handleSortDirChange = (value: 'asc' | 'desc') => {
    setSortDir(value)
    resetPaging()
  }

  const handleToggleFavoritesOnly = (next: boolean) => {
    setFavoritesOnly(next)
    resetPaging()
  }

  const handleToggleFavorite = (image: DriveImage) => {
    const next = toggleFavorite(favorites, image)
    setFavorites(next)
    writeFavorites(next)
  }

  const handleClearFavorites = () => {
    setFavorites({})
    writeFavorites({})
    setFavoritesOnly(false)
    resetPaging()
  }

  const handleExportFavorites = () => {
    const blob = new Blob([favoritesToJson(favorites)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `drive-gallery-favorites-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleImportFavorites = (imported: FavoriteMap) => {
    // Imported entries win over existing ones for the same file id.
    const next = { ...favorites, ...imported }
    setFavorites(next)
    writeFavorites(next)
    resetPaging()
  }

  const handleResetFilters = () => {
    setQuery('')
    setType('all')
    setFavoritesOnly(false)
    resetPaging()
  }

  return (
    <>
      <Toolbar
        count={shown.length}
        duplicateCount={duplicateCount}
        hideRaw={hideRaw}
        loading={loading}
        onRefresh={handleRefresh}
        onToggleHideRaw={handleToggleHideRaw}
      />

      <main>
        {images.length > 0 ? (
          <Filters
            query={query}
            type={type}
            types={types}
            favoritesOnly={favoritesOnly}
            favoriteCount={favoriteCount}
            totalFavorites={Object.keys(favorites).length}
            sortKey={sortKey}
            sortDir={sortDir}
            onQueryChange={handleQueryChange}
            onTypeChange={handleTypeChange}
            onToggleFavorites={handleToggleFavoritesOnly}
            onClearFavorites={handleClearFavorites}
            onExportFavorites={handleExportFavorites}
            onImportFavorites={handleImportFavorites}
            onSortKeyChange={handleSortKeyChange}
            onSortDirChange={handleSortDirChange}
            onReset={handleResetFilters}
          />
        ) : null}

        {loading && !hasImages ? <LoadingGrid /> : null}

        {error && !hasImages ? (
          <ErrorState message={error} onRetry={handleRefresh} />
        ) : null}

        {!loading && !error && images.length === 0 ? <EmptyState /> : null}

        {!loading && !error && images.length > 0 && !hasImages ? (
          <NoMatchesState
            onClear={handleResetFilters}
            title={
              favoritesOnly && favoriteCount === 0
                ? 'No favorites in this folder'
                : undefined
            }
            body={
              favoritesOnly && favoriteCount === 0
                ? 'Tap the heart on a photo to add it to your shortlist.'
                : undefined
            }
          />
        ) : null}

        {hasImages ? (
          <>
            <ImageGrid
              images={pageImages}
              favorites={favorites}
              onOpen={setOpenIndex}
              onToggleFavorite={handleToggleFavorite}
            />

            {pageCount > 1 ? (
              <div className="pager-bar">
                <p className="page-range">
                  Showing {start + 1}–{start + pageImages.length} of{' '}
                  {sorted.length}
                </p>
                <Pagination
                  page={currentPage}
                  pageCount={pageCount}
                  onPageChange={goToPage}
                />
              </div>
            ) : null}

            {error || (loading && hasImages) ? (
              <div className="gallery-footer">
                {error ? (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {loading && hasImages ? (
                  <p className="muted" role="status">
                    Loading all photos…
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      {activeIndex !== null ? (
        <Lightbox
          images={pageImages}
          index={activeIndex}
          favorites={favorites}
          onIndexChange={setOpenIndex}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  )
}
