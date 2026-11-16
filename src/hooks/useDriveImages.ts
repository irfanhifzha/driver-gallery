import { useCallback, useEffect, useRef, useState } from 'react'
import { config, configError } from '../config'
import { DriveError, listImages, type DriveImage } from '../lib/drive'

/** Listings are cheap, but the API key is shared by every visitor — spare the quota. */
const CACHE_TTL_MS = 5 * 60 * 1000
/** Safety net: 50 pages × pageSize 1000 is far beyond any real folder. */
const MAX_PAGES = 50
const cacheKey = (folderId: string) => `drive-gallery:${folderId}`

type CachedListing = {
  storedAt: number
  images: DriveImage[]
}

function readCache(folderId: string): CachedListing | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(folderId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedListing & {
      nextPageToken?: string
    }
    if (!Array.isArray(parsed.images)) return null
    // Only complete listings are cached; a leftover token means a partial
    // listing from an older version, so ignore it and fetch fresh.
    if (parsed.nextPageToken) return null
    if (Date.now() - parsed.storedAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(folderId: string, images: DriveImage[]) {
  try {
    sessionStorage.setItem(
      cacheKey(folderId),
      JSON.stringify({ storedAt: Date.now(), images }),
    )
  } catch {
    // Private mode or a full quota: caching is an optimisation, never a requirement.
  }
}

function clearCache(folderId: string) {
  try {
    sessionStorage.removeItem(cacheKey(folderId))
  } catch {
    // Ignore — same reasons as writeCache.
  }
}

/** Random order per load, so the masonry pattern changes on each visit. */
function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function useDriveImages() {
  const folderId = config?.folderId

  // Read the cached listing during the first render so a repeat visit paints
  // immediately, with no extra effect round-trip.
  const [cached] = useState(() => (folderId ? readCache(folderId) : null))

  const [images, setImages] = useState<DriveImage[]>(cached?.images ?? [])
  const [loading, setLoading] = useState(Boolean(folderId) && !cached)
  const [error, setError] = useState<string | null>(configError)
  const abortRef = useRef<AbortController | null>(null)

  /**
   * Fetch the first page, then keep requesting while the response carries a
   * `nextPageToken`; when it comes back empty the listing is complete.
   * Pages are appended as they arrive so images show up progressively.
   */
  const fetchAllPages = useCallback(async () => {
    if (!folderId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const collected: DriveImage[] = []
    let token: string | undefined

    try {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data = await listImages(token, controller.signal)
        if (controller.signal.aborted) return

        collected.push(...shuffle(data.files ?? []))
        setImages([...collected])
        token = data.nextPageToken
        if (!token) break
      }

      setError(null)
      if (!token) writeCache(folderId, collected)
    } catch (err) {
      if (controller.signal.aborted) return
      console.error('[drive-gallery] Drive listing failed', err)
      setError(
        err instanceof DriveError
          ? err.message
          : 'Could not reach Google Drive. Check your connection and try again.',
      )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [folderId])

  useEffect(() => {
    if (!folderId || cached) return

    void fetchAllPages()
    return () => abortRef.current?.abort()
  }, [folderId, cached, fetchAllPages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const refresh = useCallback(() => {
    if (!folderId) return
    clearCache(folderId)
    setImages([])
    setError(null)
    setLoading(true)
    void fetchAllPages()
  }, [folderId, fetchAllPages])

  return { images, loading, error, refresh }
}
