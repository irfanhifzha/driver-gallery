import { useState } from 'react'
import './App.css'
import { FolderBar } from './components/FolderBar'
import { Gallery } from './components/Gallery'
import { ErrorState } from './components/States'
import { apiKey, configError } from './config'
import { parseFolderId } from './lib/drive'

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
  // Only a folder the visitor loaded before is restored; with none stored the
  // app stays empty until one is pasted, so no request is made by default.
  const [folderId, setFolderId] = useState(() => readStoredFolder() ?? '')

  if (!apiKey) {
    return (
      <div className="app">
        <ErrorState title="Configuration needed" message={configError ?? ''} />
      </div>
    )
  }

  const applyFolder = (next: string) => {
    setFolderId(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode: the choice simply won't persist.
    }
  }

  const clearFolder = () => {
    setFolderId('')
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Private mode: nothing was stored anyway.
    }
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
