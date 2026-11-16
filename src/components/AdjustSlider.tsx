import type { Adjustments } from '../lib/adjustments'
import type { AdjustControl } from '../lib/adjustmentControls'

type AdjustSliderProps = {
  control: AdjustControl
  value: number
  onChange: (patch: Partial<Adjustments>) => void
}

export function AdjustSlider({
  control,
  value,
  onChange,
}: AdjustSliderProps) {
  return (
    <div className="adjust-control">
      <label className="adjust-label" htmlFor={`adjust-${control.key}`}>
        <span>{control.label}</span>
        <span className="adjust-value">
          {control.key === 'temperature' && value > 0 ? `+${value}` : value}
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
}
