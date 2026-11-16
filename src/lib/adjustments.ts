export type Adjustments = {
  brightness: number
  contrast: number
  saturation: number
  /** -100 = cooler, 0 = neutral, +100 = warmer. */
  whiteBalance: number
  tintHue: number
  tintStrength: number
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  whiteBalance: 0,
  tintHue: 0,
  tintStrength: 0,
}

/** CSS filter chain for brightness/contrast/saturation (percent values). */
export const filterCss = (a: Adjustments) =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)`

export const hasAdjustments = (a: Adjustments) =>
  a.brightness !== 100 ||
  a.contrast !== 100 ||
  a.saturation !== 100 ||
  a.whiteBalance !== 0 ||
  a.tintStrength > 0

/**
 * White balance is a colour cast, not a filter: a warm or cool overlay with
 * `soft-light` blending shifts the balance without flattening brightness.
 * Returns null at the neutral setting.
 */
export const whiteBalanceOverlay = (a: Adjustments) => {
  if (a.whiteBalance === 0) return null

  const warm = a.whiteBalance > 0
  return {
    background: warm ? 'rgb(255, 176, 92)' : 'rgb(96, 160, 255)',
    opacity: (Math.abs(a.whiteBalance) / 100) * 0.35,
  }
}
