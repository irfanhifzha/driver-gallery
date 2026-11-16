export type Adjustments = {
  brightness: number
  contrast: number
  saturation: number
  tintHue: number
  tintStrength: number
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
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
  a.tintStrength > 0
