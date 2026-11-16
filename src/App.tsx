import { useState } from 'react'
import './App.css'
import { ImageGrid } from './components/ImageGrid'
import { Lightbox } from './components/Lightbox'
import { Pagination } from './components/Pagination'
import { EmptyState, ErrorState, LoadingGrid } from './components/States'
import { Toolbar } from './components/Toolbar'
import { config, configError } from './config'
import { useDriveImages } from './hooks/useDriveImages'
import { withoutRawDuplicates } from './lib/drive'

/** Photos per page. The full listing is cached, so paging is instant. */
const PER_PAGE = 24

function App() {
  const { images, loading, error, refresh } = useDriveImages()
  const [page, setPage] = useState(1)
  const [hideRaw, setHideRaw] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (!config) {
    return (
      <div className="app">
        <ErrorState title="Configuration needed" message={configError ?? ''} />
      </div>
    )
  }

  const deduped = withoutRawDuplicates(images)
  const duplicateCount = images.length - deduped.length
  const shown = hideRaw ? deduped : images

  const hasImages = shown.length > 0
  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PER_PAGE
  const pageImages = shown.slice(start, start + PER_PAGE)
  const activeIndex =
    openIndex !== null && openIndex < pageImages.length ? openIndex : null

  const handleRefresh = () => {
    setPage(1)
    setOpenIndex(null)
    refresh()
  }

  const goToPage = (next: number) => {
    setPage(next)
    setOpenIndex(null)
    window.scrollTo({ top: 0 })
  }

  const handleToggleHideRaw = (hide: boolean) => {
    setHideRaw(hide)
    setPage(1)
    setOpenIndex(null)
  }

  return (
    <div className="app">
      <Toolbar
        count={shown.length}
        duplicateCount={duplicateCount}
        hideRaw={hideRaw}
        loading={loading}
        onRefresh={handleRefresh}
        onToggleHideRaw={handleToggleHideRaw}
      />

      <main>
        {loading && !hasImages ? <LoadingGrid /> : null}

        {error && !hasImages ? (
          <ErrorState message={error} onRetry={handleRefresh} />
        ) : null}

        {!loading && !error && !hasImages ? <EmptyState /> : null}

        {hasImages ? (
          <>
            <ImageGrid images={pageImages} onOpen={setOpenIndex} />

            {pageCount > 1 ? (
              <p className="page-range">
                Showing {start + 1}–{start + pageImages.length} of {shown.length}
              </p>
            ) : null}

            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={goToPage}
            />

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
              <a
                className="drive-link"
                href={`https://drive.google.com/drive/folders/${config.folderId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open folder in Drive ↗
              </a>
            </div>
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
    </div>
  )
}

export default App
