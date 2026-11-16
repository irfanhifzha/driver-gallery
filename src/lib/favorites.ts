import type { DriveImage } from './drive'

/**
 * Favorites are keyed by Drive file id so they survive renames and duplicate
 * file names. The name and timestamp are kept as metadata only, so an entry
 * for a file that has since been deleted is still identifiable.
 */
export type Favorite = {
  name: string
  addedAt: string
}

export type FavoriteMap = Record<string, Favorite>

export const FAVORITES_KEY = 'drive-gallery:favorites'

export function readFavorites(): FavoriteMap {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const items = (parsed as { items?: unknown }).items
    if (!items || typeof items !== 'object') return {}

    const favorites: FavoriteMap = {}
    for (const [id, value] of Object.entries(
      items as Record<string, unknown>,
    )) {
      if (!value || typeof value !== 'object') continue
      const { name, addedAt } = value as Partial<Favorite>
      if (typeof name !== 'string' || typeof addedAt !== 'string') continue
      favorites[id] = { name, addedAt }
    }
    return favorites
  } catch {
    return {}
  }
}

export function writeFavorites(favorites: FavoriteMap) {
  try {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify({ version: 1, items: favorites }),
    )
  } catch {
    // Storage can be full or blocked (private mode); favorites stay in memory.
  }
}

export function toggleFavorite(
  favorites: FavoriteMap,
  image: DriveImage,
): FavoriteMap {
  const next = { ...favorites }
  if (next[image.id]) {
    delete next[image.id]
  } else {
    next[image.id] = { name: image.name, addedAt: new Date().toISOString() }
  }
  return next
}
