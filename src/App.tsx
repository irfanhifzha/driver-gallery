import { useEffect, useState } from 'react'
import './App.css'
import { FolderBar } from './components/FolderBar'
import { Gallery } from './components/Gallery'
import { ErrorState } from './components/States'
import { apiKey, configError } from './config'
import { parseFolderId } from './lib/drive'
import { readUrlState, updateUrl } from './lib/urlState'

const STORAGE_KEY = 'drive-gallery:folder'

function readStoredFolder() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? parseFolderId(stored) : null
  } catch {
    return null
  }
}

function App() {
  // A shared link wins over the stored folder; otherwise only a folder the
  // visitor loaded before is restored. With none at all the app stays empty
  // until one is pasted, so no request is made by default.
  const [folderId, setFolderId] = useState(
    () => readUrlState().folder ?? readStoredFolder() ?? '',
  )

  // Keep the stored folder and the address bar in step with what is shown, so
  // the current view is always shareable and a reload reopens the same folder.
  useEffect(() => {
    try {
      if (folderId) localStorage.setItem(STORAGE_KEY, folderId)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Private mode: the choice simply won't persist.
    }
    updateUrl(
      folderId ? { folder: folderId } : { folder: null, photo: null },
    )
  }, [folderId])

  if (!apiKey) {
    return (
      <div className="app">
        <ErrorState title="Configuration needed" message={configError ?? ''} />
      </div>
    )
  }

  const applyFolder = (next: string) => {
    // A photo from the previous folder must not leak into the shared link.
    updateUrl({ photo: null })
    setFolderId(next)
  }

  const clearFolder = () => {
    updateUrl({ photo: null })
    setFolderId('')
  }

  return (
    <div className="app">
      {/* Both siblings remount when the folder changes, so the keys are
          namespaced to stay unique among siblings. */}
      <FolderBar
        key={`bar:${folderId}`}
        folderId={folderId}
        onApply={applyFolder}
        onClear={clearFolder}
      />

      {folderId ? (
        <Gallery key={`gallery:${folderId}`} folderId={folderId} />
      ) : (
        <div className="state">
          <h2>Nothing here yet</h2>
          <p>
            Paste a public Google Drive folder link or ID above and press
            <strong> Load folder</strong> to start browsing.
          </p>
        </div>
      )}
    </div>
  )
}

export default App
