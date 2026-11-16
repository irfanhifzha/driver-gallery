const { VITE_GOOGLE_API_KEY, VITE_DRIVE_FOLDER_ID } = import.meta.env

const apiKey = VITE_GOOGLE_API_KEY?.trim()
const folderId = VITE_DRIVE_FOLDER_ID?.trim()

const missing = [
  !apiKey && 'VITE_GOOGLE_API_KEY',
  !folderId && 'VITE_DRIVE_FOLDER_ID',
].filter(Boolean)

/** `null` means the app cannot talk to Drive; render `configError` instead. */
export const config =
  apiKey && folderId ? { apiKey, folderId } : null

export const configError = missing.length
  ? `Missing ${missing.join(' and ')}. Add ${missing.length > 1 ? 'them' : 'it'} to .env.local and restart the dev server.`
  : null
