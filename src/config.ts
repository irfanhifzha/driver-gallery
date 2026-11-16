const STORAGE_KEY = 'drive-gallery:api-key'

/**
 * There is deliberately no build-time default: every visitor supplies their own
 * Google API key through the UI, and it is kept only in this browser. A
 * deployment therefore never ships a key anyone could reuse.
 */
export function readApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || null
  } catch {
    // Storage can be blocked (private mode); the app asks again next visit.
    return null
  }
}

export function writeApiKey(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, key.trim())
  } catch {
    // Same fallback as above: the key still works for this page load.
  }
}
