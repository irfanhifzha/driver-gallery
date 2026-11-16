const { VITE_GOOGLE_API_KEY, VITE_DRIVE_FOLDER_ID } = import.meta.env

/** Required: the referrer-restricted API key used for every Drive request. */
export const apiKey = VITE_GOOGLE_API_KEY?.trim() || null

/** Optional seed folder; the UI can switch to any other public folder. */
export const defaultFolderId = VITE_DRIVE_FOLDER_ID?.trim() || null

export const configError = apiKey
  ? null
  : 'Missing VITE_GOOGLE_API_KEY. Add it to .env.local and restart the dev server.'
