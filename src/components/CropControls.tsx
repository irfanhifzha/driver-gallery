import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  DEFAULT_CROP,
  RATIO_PRESETS,
  formatRatio,
  parseRatio,
  type Crop,
} from '../lib/crop'

type CropControlsProps = {
  crop: Crop | null
  onChange: (crop: Crop | null) => void
}

export function CropControls({ crop, onChange }: CropControlsProps) {
  const [customRatio, setCustomRatio] = useState('')
  const [ratioError, setRatioError] = useState<string | null>(null)

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
    onChange({ ...(crop ?? DEFAULT_CROP), ratio })
  }

  const handleCustomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    // Enter applies the ratio instead of submitting an enclosing form.
    event.preventDefault()
    applyCustomRatio()
  }

  const update = (patch: Partial<Crop>) => {
    onChange({ ...(crop ?? DEFAULT_CROP), ...patch })
  }

  return (
    <div className="crop-block">
      <div className="crop-head">
        <h3>Crop{crop ? ` · ${formatRatio(crop.ratio)}` : ''}</h3>
        {crop ? (
          <button
            type="button"
            className="crop-clear"
            onClick={() => onChange(null)}
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
            onClick={() => update({ ratio: preset.ratio })}
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
              onChange={(event) => update({ zoom: Number(event.target.value) })}
            />
          </div>

          <div className="crop-actions">
            <button
              type="button"
              className="adjust-reset"
              onClick={() => update({ x: 0, y: 0, zoom: 1 })}
              disabled={crop.x === 0 && crop.y === 0 && crop.zoom === 1}
            >
              Center crop
            </button>
          </div>

          <p className="crop-hint">
            Drag the photo in the viewer to reposition it inside the frame.
            Viewer zoom is off while a crop is active.
          </p>
        </>
      ) : (
        <p className="crop-hint">
          Pick a ratio to start cropping. The full photo stays visible until
          then.
        </p>
      )}
    </div>
  )
}
