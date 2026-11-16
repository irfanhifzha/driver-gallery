import { useState } from 'react'
import type { FormEvent } from 'react'
import { parseFolderId } from '../lib/drive'

type FolderBarProps = {
  folderId: string
  onApply: (folderId: string) => void
  onClear: () => void
  /** Opens the API key form again, so a wrong key can be replaced. */
  onChangeKey: () => void
}

export function FolderBar({
  folderId,
  onApply,
  onClear,
  onChangeKey,
}: FolderBarProps) {
  const [draft, setDraft] = useState(folderId)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = parseFolderId(draft)
    if (!parsed) {
      setError('Paste a Drive folder link (…/folders/<id>) or the folder ID.')
      return
    }
    setError(null)
    setDraft(parsed)
    onApply(parsed)
  }


  return (
    <section className="folder-bar" aria-label="Google Drive folder">
      <form className="folder-form" onSubmit={submit}>
        <div className="folder-head">
          <label className="folder-label" htmlFor="folder-id">
            Google Drive folder
          </label>
          <button type="button" className="folder-key" onClick={onChangeKey}>
            Change API key
          </button>
        </div>

        <div className="folder-field">
          <span className="folder-prefix" aria-hidden="true">
            https://drive.google.com/drive/folders/
          </span>
          <input
            id="folder-id"
            className="folder-input"
            value={draft}
            placeholder="Paste a folder link or ID"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'folder-error' : undefined}
            onChange={(event) => {
              const value = event.target.value
              const parsed = parseFolderId(value)
              setDraft(parsed ?? value)
            }}
          />
        </div>

        <button
          type="submit"
          className="btn folder-load"
          aria-label="Load folder"
          title="Load folder"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4.5 12h15M13.5 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className="filter-reset folder-clear"
          onClick={() => {
            setError(null)
            setDraft('')
            onClear()
          }}
          disabled={!folderId}
          aria-label="Clear folder"
          title="Clear folder"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M3.5 6h17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M8.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18.5 6l-.9 13.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 10.5v6M14 10.5v6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {folderId ? (
          <a
            className="folder-drive"
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Drive ↗
          </a>
        ) : null}

      </form>

      {error ? (
        <p className="folder-error" id="folder-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
