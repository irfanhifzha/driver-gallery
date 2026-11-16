import type { RefObject } from 'react'
import type { MetadataRow } from '../lib/metadata'

type InfoPanelProps = {
  id: string
  panelRef: RefObject<HTMLElement | null>
  rows: MetadataRow[]
  onClose: () => void
}

export function InfoPanel({ id, panelRef, rows, onClose }: InfoPanelProps) {
  return (
    <aside
      id={id}
      ref={panelRef}
      className="lightbox-panel info-panel"
      aria-label="File information"
    >
      <div className="panel-head">
        <h2>File info</h2>
        <button
          type="button"
          className="panel-close"
          onClick={onClose}
          aria-label="Close file information"
        >
          ✕
        </button>
      </div>

      <dl className="info-list">
        {rows.map((row) => (
          <div className="info-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="info-note">Metadata as reported by Google Drive.</p>
    </aside>
  )
}
