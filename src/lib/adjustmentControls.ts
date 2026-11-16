import type { Adjustments } from './adjustments'

export type AdjustControl = {
  key: keyof Adjustments
  label: string
  min: number
  max: number
  unit: '' | '%' | '°'
  group: 'light' | 'color'
}

/** Shared by the view-mode panel and the editor dock, in this display order. */
export const ADJUST_CONTROLS: readonly AdjustControl[] = [
  {
    key: 'brightness',
    label: 'Brightness',
    min: 50,
    max: 150,
    unit: '%',
    group: 'light',
  },
  {
    key: 'contrast',
    label: 'Contrast',
    min: 50,
    max: 150,
    unit: '%',
    group: 'light',
  },
  {
    key: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 200,
    unit: '%',
    group: 'light',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    min: -100,
    max: 100,
    unit: '',
    group: 'color',
  },
  {
    key: 'tintHue',
    label: 'Tint hue',
    min: 0,
    max: 360,
    unit: '°',
    group: 'color',
  },
  {
    key: 'tintStrength',
    label: 'Tint strength',
    min: 0,
    max: 100,
    unit: '%',
    group: 'color',
  },
]
