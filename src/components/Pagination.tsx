type PaginationProps = {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

type PageItem = number | 'gap'

/** First, last, and the current page ±1; gaps collapse the rest. */
function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }

  const items: PageItem[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)

  if (start > 2) items.push('gap')
  for (let p = start; p <= end; p += 1) items.push(p)
  if (end < pageCount - 1) items.push('gap')
  items.push(pageCount)

  return items
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null

  return (
    <nav className="pagination" aria-label="Gallery pages">
      <button
        type="button"
        className="page-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >
        ← Prev
      </button>

      {pageItems(page, pageCount).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="page-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`page-btn${item === page ? ' page-btn-active' : ''}`}
            onClick={() => onPageChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className="page-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page === pageCount}
      >
        Next →
      </button>
    </nav>
  )
}
