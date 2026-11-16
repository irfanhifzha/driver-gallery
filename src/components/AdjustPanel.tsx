import type { RefObject } from 'react'
import { filterCss, type Adjustments } from '../lib/adjustments'

const CONTROLS = [
  { key: 'brightness', label: 'Brightness', min: 50, max: 150, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 50, max: 150, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
  { key: 'tintHue', label: 'Tint hue', min: 0, max: 360, unit: '°' },
  { key: 'tintStrength', label: 'Tint strength', min: 0, max: 100, unit: '%' },
] as const

type AdjustPanelProps = {
  id: string
  values: Adjustments
  panelRef: RefObject<HTMLElement | null>
  onChange: (patch: Partial<Adjustments>) => void
  onReset: () => void
  onClose: () => void
}

export function AdjustPanel({
  id,
  values,
  panelRef,
  onChange,
  onReset,
  onClose,
}: AdjustPanelProps) {
  return (
    <aside
      id={id}
      ref={panelRef}
      className="adjust-panel"
      aria-label="Photo adjustments"
    >
      <div className="adjust-head">
        <h2>Adjust</h2>
        <button
          type="button"
          className="adjust-close"
          onClick={onClose}
          aria-label="Close adjustments"
        >
          ✕
        </button>
      </div>

      <div className="adjust-controls">
        {CONTROLS.map((control) => {
          const value = values[control.key]
          return (
            <div className="adjust-control" key={control.key}>
              <label
                className="adjust-label"
                htmlFor={`adjust-${control.key}`}
              >
                <span>{control.label}</span>
                <span className="adjust-value">
                  {value}
                  {control.unit}
                </span>
              </label>
              <input
                id={`adjust-${control.key}`}
                type="range"
                min={control.min}
                max={control.max}
                step={1}
                value={value}
                aria-valuetext={`${value} ${
                  control.unit === '°' ? 'degrees' : 'percent'
                }`}
                onChange={(event) =>
                  onChange({
                    [control.key]: Number(event.target.value),
                  } as Partial<Adjustments>)
                }
              />
            </div>
          )
        })}
      </div>

      <p className="adjust-code">
        <span>filter: {filterCss(values)}</span>
        {values.tintStrength > 0 ? (
          <span>
            tint: hsl({values.tintHue} 80% 50%) · {values.tintStrength}%
          </span>
        ) : null}
      </p>

      <button type="button" className="adjust-reset" onClick={onReset}>
        Reset adjustments
      </button>

      <p className="adjust-note">Preview only — nothing is saved.</p>
    </aside>
  )
}
