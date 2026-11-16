type ToolbarProps = {
  count: number
  duplicateCount: number
  hideRaw: boolean
  loading: boolean
  onRefresh: () => void
  onToggleHideRaw: (hide: boolean) => void
}

export function Toolbar({
  count,
  duplicateCount,
  hideRaw,
  loading,
  onRefresh,
  onToggleHideRaw,
}: ToolbarProps) {
  const hidden = hideRaw ? duplicateCount : 0
  const label =
    loading && count === 0
      ? 'Loading photos…'
      : `${count} photo${count === 1 ? '' : 's'}${
          hidden > 0 ? ` · ${hidden} RAW hidden` : ''
        }${loading ? ' (still loading…)' : ''}`

  return (
    <header className="toolbar">
      <div className="toolbar-heading">
        <p className="eyebrow">Shared Drive folder</p>
        <h1>Photo Gallery</h1>
        <p className="subtitle">{label}</p>
      </div>
      <div className="toolbar-actions">
        {duplicateCount > 0 ? (
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideRaw}
              onChange={(event) => onToggleHideRaw(event.target.checked)}
            />
            Hide RAW duplicates ({duplicateCount})
          </label>
        ) : null}
        <button
          type="button"
          className="btn"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
    </header>
  )
}
