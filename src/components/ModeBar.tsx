import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { parseEditsJson, type EditMap } from '../lib/edits'

export type GalleryMode = 'view' | 'editor'

type ModeBarProps = {
  mode: GalleryMode
  onChange: (mode: GalleryMode) => void
  /** Number of photos with a saved edit, shown on the Edits menu. */
  editCount: number
  onExportEdits: () => void
  onImportEdits: (edits: EditMap) => void
  onClearEdits: () => void
}

const OPTIONS = [
  {
    mode: 'view',
    label: 'View mode',
    hint: 'Saved edits are previewed live; the Panel stays a preview.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="2.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    ),
  },
  {
    mode: 'editor',
    label: 'Editor mode',
    hint: 'Adjust opens with every photo; save crop and colour to this browser.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M4 7h6M16 7h4M4 17h4M14 17h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle
          cx="13"
          cy="7"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <circle
          cx="11"
          cy="17"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    ),
  },
] as const

export function ModeBar({
  mode,
  onChange,
  editCount,
  onExportEdits,
  onImportEdits,
  onClearEdits,
}: ModeBarProps) {
  const active = OPTIONS.find((option) => option.mode === mode) ?? OPTIONS[0]
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset first so re-picking the same file still fires a change event.
    event.target.value = ''
    if (!file) return

    try {
      const imported = parseEditsJson(await file.text())
      if (!imported) {
        setError('That file is not an edits export.')
        return
      }
      setError(null)
      onImportEdits(imported)
    } catch {
      setError('That file could not be read.')
    }
  }

  return (
    <div className="mode-bar">
      <div className="mode-switch" role="group" aria-label="Gallery mode">
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            className="mode-btn"
            aria-pressed={mode === option.mode}
            onClick={() => onChange(option.mode)}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <div className="mode-bar-right">
        <p className="mode-hint">{active.hint}</p>

        {mode === 'editor' ? (
          <div className="edits-menu" ref={menuRef}>
            <button
              ref={triggerRef}
              type="button"
              className="edits-trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M4 20h4L19 9l-4-4L4 16v4Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.5 6.5 17.5 10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
              </svg>
              Edits
              {editCount > 0 ? (
                <span className="edits-count">{editCount}</span>
              ) : null}
            </button>

            {menuOpen ? (
              <div className="edits-dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={editCount === 0}
                  onClick={() => {
                    onExportEdits()
                    setMenuOpen(false)
                  }}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    fileRef.current?.click()
                  }}
                >
                  Import JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  disabled={editCount === 0}
                  onClick={() => {
                    setMenuOpen(false)
                    if (
                      window.confirm(
                        'Remove all saved edits from this browser? This cannot be undone.',
                      )
                    ) {
                      onClearEdits()
                    }
                  }}
                >
                  Clear all edits
                </button>
              </div>
            ) : null}

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={handleFile}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="edits-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
