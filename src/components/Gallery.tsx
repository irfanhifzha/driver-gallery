import { useMemo, useState } from 'react'
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
import {
  readFavorites,
  toggleFavorite,
  writeFavorites,
  type FavoriteMap,
} from '../lib/favorites'

/** Photos per page. The full listing is cached, so paging is instant. */
const PER_PAGE = 24

type GalleryProps = {
  folderId: string
}

export function Gallery({ folderId }: GalleryProps) {
  const { images, loading, error, refresh } = useDriveImages(folderId)
  const [page, setPage] = useState(1)
  const [hideRaw, setHideRaw] = useState(true)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteMap>(readFavorites)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

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

  const hasImages = shown.length > 0
  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PER_PAGE
  const pageImages = shown.slice(start, start + PER_PAGE)
  const activeIndex =
    openIndex !== null && openIndex < pageImages.length ? openIndex : null

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

  const handleToggleFavoritesOnly = (next: boolean) => {
    setFavoritesOnly(next)
    resetPaging()
  }

  const handleToggleFavorite = (image: DriveImage) => {
    const next = toggleFavorite(favorites, image)
    setFavorites(next)
    writeFavorites(next)
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
            onQueryChange={handleQueryChange}
            onTypeChange={handleTypeChange}
            onToggleFavorites={handleToggleFavoritesOnly}
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
                  {shown.length}
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
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  )
}
