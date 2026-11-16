import { useState } from 'react'
import './App.css'
import { FolderBar } from './components/FolderBar'
import { Gallery } from './components/Gallery'
import { ErrorState } from './components/States'
import { apiKey, configError, defaultFolderId } from './config'
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
  const [folderId, setFolderId] = useState(
    () =>
      readStoredFolder() ??
      (defaultFolderId ? parseFolderId(defaultFolderId) : null) ??
      '',
  )

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

  return (
    <div className="app">
      <FolderBar
        key={folderId}
        folderId={folderId}
        defaultFolderId={defaultFolderId}
        onApply={applyFolder}
      />

      {folderId ? (
        <Gallery key={folderId} folderId={folderId} />
      ) : (
        <div className="state">
          <h2>Pick a folder</h2>
          <p>
            Paste a public Google Drive folder link or ID above to load its
            photos.
          </p>
        </div>
      )}
    </div>
  )
}

export default App
