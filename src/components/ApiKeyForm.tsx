import { useState } from 'react'
import type { FormEvent } from 'react'

type ApiKeyFormProps = {
  initialKey?: string
  onSave: (key: string) => void
  onCancel?: () => void
}

/**
 * The key is supplied per visitor, so this is the first thing a new visitor
 * sees. Nothing is pre-filled from the build.
 */
export function ApiKeyForm({
  initialKey = '',
  onSave,
  onCancel,
}: ApiKeyFormProps) {
  const [draft, setDraft] = useState(initialKey)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const key = draft.trim()
    if (!key) {
      setError('Paste a Google API key first.')
      return
    }
    setError(null)
    onSave(key)
  }

  return (
    <section className="key-card" aria-label="Google API key">
      <h1>Add your Google API key</h1>
      <p className="key-note">
        The gallery reads the folder straight from Google Drive, so it needs a
        key with the <strong>Drive API</strong> enabled from{' '}
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer"
        >
          Google Cloud ↗
        </a>
        . The key is stored only in this browser and is never committed or
        shared.
      </p>

      <form className="key-form" onSubmit={submit}>
        <input
          className="key-input"
          type="text"
          value={draft}
          placeholder="AIza…"
          aria-label="Google API key"
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
        />

        <button type="submit" className="btn" disabled={!draft.trim()}>
          Save key
        </button>

        {onCancel ? (
          <button type="button" className="key-cancel" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </form>

      {error ? (
        <p className="folder-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
