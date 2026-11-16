import { useState } from 'react'
import type { FormEvent } from 'react'
import { parseFolderId } from '../lib/drive'

type FolderBarProps = {
  folderId: string
  onApply: (folderId: string) => void
  onClear: () => void
}

export function FolderBar({ folderId, onApply, onClear }: FolderBarProps) {
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
    <section className="folder-bar" aria-label="Drive folder">
      <form className="folder-form" onSubmit={submit}>
        <label className="folder-label" htmlFor="folder-id">
          Drive folder
        </label>

        <input
          id="folder-id"
          className="folder-input"
          value={draft}
          placeholder="Paste a public Drive folder link or ID"
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

        <button type="submit" className="btn">
          Load folder
        </button>

        {folderId ? (
          <button
            type="button"
            className="filter-reset folder-clear"
            onClick={() => {
              setError(null)
              setDraft('')
              onClear()
            }}
          >
            Clear folder
          </button>
        ) : null}

        {folderId ? (
          <a
            className="drive-link folder-drive"
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
