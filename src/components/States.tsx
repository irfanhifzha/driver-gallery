type ErrorStateProps = {
  message: string
  title?: string
  onRetry?: () => void
}

export function LoadingGrid({ count = 12 }: { count?: number }) {
  return (
    <ul className="grid" aria-busy="true" aria-label="Loading photos">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="card card-skeleton">
          <div className="skeleton" />
        </li>
      ))}
    </ul>
  )
}

export function EmptyState() {
  return (
    <div className="state">
      <h2>No images in this folder</h2>
      <p>Add some pictures to the Drive folder, then refresh.</p>
    </div>
  )
}

export function NoMatchesState({ onClear }: { onClear: () => void }) {
  return (
    <div className="state">
      <h2>No photos match</h2>
      <p>Try a different file name or file type.</p>
      <button type="button" className="btn" onClick={onClear}>
        Clear filters
      </button>
    </div>
  )
}

export function ErrorState({ message, title, onRetry }: ErrorStateProps) {
  return (
    <div className="state state-error" role="alert">
      <h2>{title ?? 'Something went wrong'}</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}
