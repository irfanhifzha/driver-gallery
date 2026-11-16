import { useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'
import {
  filterCss,
  hasAdjustments,
  type Adjustments,
} from '../lib/adjustments'
import {
  DEFAULT_CROP,
  RATIO_PRESETS,
  formatRatio,
  parseRatio,
  type Crop,
} from '../lib/crop'
import type { GalleryMode } from './ModeBar'

const CONTROLS = [
  { key: 'brightness', label: 'Brightness', min: 50, max: 150, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 50, max: 150, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, unit: '' },
  { key: 'tintHue', label: 'Tint hue', min: 0, max: 360, unit: '°' },
  { key: 'tintStrength', label: 'Tint strength', min: 0, max: 100, unit: '%' },
] as const

type AdjustPanelProps = {
  id: string
  values: Adjustments
  crop: Crop | null
  mode: GalleryMode
  dirty: boolean
  panelRef: RefObject<HTMLElement | null>
  onChange: (patch: Partial<Adjustments>) => void
  onCropChange: (crop: Crop | null) => void
  onReset: () => void
  onSave: () => void
  onClose: () => void
}

export function AdjustPanel({
  id,
  values,
  crop,
  mode,
  dirty,
  panelRef,
  onChange,
  onCropChange,
  onReset,
  onSave,
  onClose,
}: AdjustPanelProps) {
  const [customRatio, setCustomRatio] = useState('')
  const [ratioError, setRatioError] = useState<string | null>(null)

  const editing = mode === 'editor'

  const applyCustomRatio = () => {
    if (!customRatio.trim()) {
      setRatioError(null)
      return
    }
    const ratio = parseRatio(customRatio)
    if (ratio === null) {
      setRatioError('Use a ratio like 5:4 or 1.5 (0.25–4).')
      return
    }
    setRatioError(null)
    onCropChange({ ...(crop ?? DEFAULT_CROP), ratio })
  }

  const handleCustomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    // Enter applies the ratio instead of submitting an enclosing form.
    event.preventDefault()
    applyCustomRatio()
  }

  const updateCrop = (patch: Partial<Crop>) => {
    onCropChange({ ...(crop ?? DEFAULT_CROP), ...patch })
  }

  return (
    <aside
      id={id}
      ref={panelRef}
      className="lightbox-panel"
      aria-label="Photo adjustments"
    >
      <div className="panel-head">
        <h2>Adjust</h2>
        <button
          type="button"
          className="panel-close"
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
                  {control.key === 'temperature' && value > 0
                    ? `+${value}`
                    : value}
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
                aria-valuetext={
                  control.key === 'temperature'
                    ? `${value} ${
                        value === 0 ? 'neutral' : value > 0 ? 'warmer' : 'cooler'
                      }`
                    : `${value} ${control.unit === '°' ? 'degrees' : 'percent'}`
                }
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

      {editing ? (
        <section className="crop-block" aria-label="Crop">
          <div className="crop-head">
            <h3>Crop{crop ? ` · ${formatRatio(crop.ratio)}` : ''}</h3>
            {crop ? (
              <button
                type="button"
                className="crop-clear"
                onClick={() => onCropChange(null)}
              >
                Remove
              </button>
            ) : null}
          </div>

          <div className="crop-ratios">
            {RATIO_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="crop-ratio"
                aria-pressed={
                  crop ? Math.abs(crop.ratio - preset.ratio) < 0.005 : false
                }
                onClick={() => updateCrop({ ratio: preset.ratio })}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="crop-custom">
            <label htmlFor="crop-custom-ratio">Custom ratio</label>
            <div className="crop-custom-field">
              <input
                id="crop-custom-ratio"
                type="text"
                inputMode="decimal"
                value={customRatio}
                placeholder="5:4"
                aria-invalid={ratioError ? true : undefined}
                onChange={(event) => {
                  setCustomRatio(event.target.value)
                  setRatioError(null)
                }}
                onKeyDown={handleCustomKeyDown}
              />
              <button
                type="button"
                className="crop-set"
                onClick={applyCustomRatio}
                disabled={!customRatio.trim()}
              >
                Set
              </button>
            </div>
          </div>

          {ratioError ? (
            <p className="crop-error" role="alert">
              {ratioError}
            </p>
          ) : null}

          {crop ? (
            <>
              <div className="adjust-control">
                <label className="adjust-label" htmlFor="crop-zoom">
                  <span>Crop zoom</span>
                  <span className="adjust-value">
                    {Math.round(crop.zoom * 100)}%
                  </span>
                </label>
                <input
                  id="crop-zoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={crop.zoom}
                  onChange={(event) =>
                    updateCrop({ zoom: Number(event.target.value) })
                  }
                />
              </div>

              <button
                type="button"
                className="adjust-reset"
                onClick={() => updateCrop({ x: 0, y: 0, zoom: 1 })}
                disabled={crop.x === 0 && crop.y === 0 && crop.zoom === 1}
              >
                Center crop
              </button>

              <p className="crop-hint">
                Drag the photo in the viewer to reposition it inside the frame.
              </p>
            </>
          ) : (
            <p className="crop-hint">
              Pick a ratio to start cropping. The full photo stays visible until
              then.
            </p>
          )}
        </section>
      ) : null}

      <p className="adjust-code">
        <span>filter: {filterCss(values)}</span>
        {values.temperature !== 0 ? (
          <span>
            temperature: {values.temperature > 0 ? '+' : ''}
            {values.temperature} ({values.temperature > 0 ? 'warmer' : 'cooler'})
          </span>
        ) : null}
        {values.tintStrength > 0 ? (
          <span>
            tint: hsl({values.tintHue} 80% 50%) · {values.tintStrength}%
          </span>
        ) : null}
        {crop ? <span>crop: {formatRatio(crop.ratio)}</span> : null}
      </p>

      <button
        type="button"
        className="adjust-reset"
        onClick={onReset}
        disabled={!hasAdjustments(values) && !crop}
      >
        Reset adjustments
      </button>

      {editing ? (
        <>
          <button
            type="button"
            className="adjust-save"
            onClick={onSave}
            disabled={!dirty}
          >
            Save adjustments
          </button>
          <p className="adjust-note">
            {dirty
              ? 'Unsaved changes — Save stores them in this browser.'
              : 'Saved in this browser.'}
          </p>
        </>
      ) : (
        <p className="adjust-note">
          Live preview only. Switch to Editor mode to save crop and colour.
        </p>
      )}
    </aside>
  )
}
