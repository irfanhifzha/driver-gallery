export type Crop = {
  /** width / height of the crop frame, always > 0. */
  ratio: number
  /** 1 = fill the frame, up to 3 = tighter. */
  zoom: number
  /** -1..1 pan, where 0 is centred. */
  x: number
  y: number
}

export const DEFAULT_CROP: Crop = { ratio: 1, zoom: 1, x: 0, y: 0 }

export const RATIO_PRESETS = [
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '4:5', ratio: 4 / 5 },
] as const

export const CROP_MIN_RATIO = 0.25
export const CROP_MAX_RATIO = 4

export const clampCrop = (crop: Crop): Crop => ({
  ratio: Math.min(CROP_MAX_RATIO, Math.max(CROP_MIN_RATIO, crop.ratio)),
  zoom: Math.min(3, Math.max(1, crop.zoom)),
  x: Math.min(1, Math.max(-1, crop.x)),
  y: Math.min(1, Math.max(-1, crop.y)),
})

/**
 * Accepts `16:9`, `1.5`, or `3/2` and returns width / height. Anything
 * outside a sane photo range is rejected rather than silently clamped.
 */
export function parseRatio(input: string): number | null {
  const trimmed = input.trim().replace('/', ':')
  if (!trimmed) return null

  const parts = trimmed.split(':')
  if (parts.length > 2) return null

  const values = parts.map((part) => Number(part.trim()))
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null

  const ratio =
    values.length === 2 ? values[0] / values[1] : values[0]
  if (ratio < CROP_MIN_RATIO || ratio > CROP_MAX_RATIO) return null
  return ratio
}

/** Field-wise comparison, so equal crops from different objects match. */
export const sameCrop = (a: Crop | null, b: Crop | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.ratio === b.ratio &&
    a.zoom === b.zoom &&
    a.x === b.x &&
    a.y === b.y)

/** Compact human label for the panel, e.g. `16:9` or `2.39:1`. */
export function formatRatio(ratio: number): string {
  const preset = RATIO_PRESETS.find((item) => Math.abs(item.ratio - ratio) < 0.005)
  if (preset) return preset.label
  if (Math.abs(ratio - 1) < 0.005) return '1:1'
  return ratio >= 1
    ? `${Number(ratio.toFixed(2))}:1`
    : `1:${Number((1 / ratio).toFixed(2))}`
}
