import type { Adjustments } from './adjustments'
import type { Crop } from './crop'

export type PhotoEdit = {
  adjust: Adjustments
  crop: Crop | null
  updatedAt: string
}

export type EditMap = Record<string, PhotoEdit>

/**
 * Saved per photo in this browser only. The stored document is a plain JSON
 * envelope so it can be inspected, copied, or exported without the app:
 * `{ version, updatedAt, items: { [fileId]: { adjust, crop, updatedAt } } }`.
 */
export const EDITS_KEY = 'drive-gallery:edits'
const VERSION = 1

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isAdjustments = (value: unknown): value is Adjustments => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    isNumber(candidate.brightness) &&
    isNumber(candidate.contrast) &&
    isNumber(candidate.saturation) &&
    isNumber(candidate.temperature) &&
    isNumber(candidate.tintHue) &&
    isNumber(candidate.tintStrength)
  )
}

const isCrop = (value: unknown): value is Crop => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    isNumber(candidate.ratio) &&
    isNumber(candidate.zoom) &&
    isNumber(candidate.x) &&
    isNumber(candidate.y)
  )
}

const isPhotoEdit = (value: unknown): value is PhotoEdit => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    isAdjustments(candidate.adjust) &&
    (candidate.crop === null || isCrop(candidate.crop)) &&
    typeof candidate.updatedAt === 'string'
  )
}

export function readEdits(): EditMap {
  try {
    const raw = localStorage.getItem(EDITS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const items = (parsed as { items?: unknown }).items
    if (!items || typeof items !== 'object') return {}

    // Keep only entries that still match the shape, so a hand-edited or
    // half-written document cannot break the viewer.
    const edits: EditMap = {}
    for (const [id, value] of Object.entries(items as Record<string, unknown>)) {
      if (id && isPhotoEdit(value)) edits[id] = value
    }
    return edits
  } catch {
    // Private mode or corrupt JSON: start clean instead of failing the gallery.
    return {}
  }
}

/** Pretty JSON envelope, for the editor's Export action. */
export function editsToJson(edits: EditMap): string {
  return JSON.stringify(
    {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      items: edits,
    },
    null,
    2,
  )
}

/**
 * Accepts the exported envelope or a bare `id -> edit` map, and returns null
 * when nothing in the file looks like an edit.
 */
export function parseEditsJson(text: string): EditMap | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null

    const candidate = (parsed as { items?: unknown }).items ?? parsed
    if (!candidate || typeof candidate !== 'object') return null

    const edits: EditMap = {}
    let found = 0
    for (const [id, value] of Object.entries(
      candidate as Record<string, unknown>,
    )) {
      if (!id || !isPhotoEdit(value)) continue
      edits[id] = value
      found += 1
    }
    return found > 0 ? edits : null
  } catch {
    return null
  }
}

export function writeEdits(edits: EditMap) {
  try {
    localStorage.setItem(
      EDITS_KEY,
      JSON.stringify({
        version: VERSION,
        updatedAt: new Date().toISOString(),
        items: edits,
      }),
    )
  } catch {
    // Storage full or blocked; the edit still applies for this page load.
  }
}
