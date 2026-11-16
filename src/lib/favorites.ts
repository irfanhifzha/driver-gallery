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

/** Validate the `id → { name, addedAt }` map shared by storage and imports. */
function parseFavoriteItems(items: unknown): FavoriteMap | null {
  if (!items || typeof items !== 'object') return null

  const favorites: FavoriteMap = {}
  for (const [id, value] of Object.entries(items as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const { name, addedAt } = value as Partial<Favorite>
    if (typeof name !== 'string' || typeof addedAt !== 'string') continue
    favorites[id] = { name, addedAt }
  }
  return favorites
}

export function readFavorites(): FavoriteMap {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parseFavoriteItems((parsed as { items?: unknown }).items) ?? {}
  } catch {
    return {}
  }
}

/** Serialise favorites for download; `parseFavoritesJson` reads this back. */
export function favoritesToJson(favorites: FavoriteMap): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: favorites,
    },
    null,
    2,
  )
}

/**
 * Parse an exported favorites file. Accepts both the exported/stored envelope
 * (`{ items }`) and a bare `id → favorite` map; null when unrecognisable.
 */
export function parseFavoritesJson(raw: string): FavoriteMap | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as { items?: unknown }
    return parseFavoriteItems('items' in record ? record.items : parsed)
  } catch {
    return null
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
