import type { RefObject } from 'react'
import {
  filterCss,
  hasAdjustments,
  type Adjustments,
} from '../lib/adjustments'
import { ADJUST_CONTROLS } from '../lib/adjustmentControls'
import { AdjustSlider } from './AdjustSlider'

type AdjustPanelProps = {
  id: string
  values: Adjustments
  panelRef: RefObject<HTMLElement | null>
  onChange: (patch: Partial<Adjustments>) => void
  onReset: () => void
  onClose: () => void
}

/**
 * View-mode preview panel. Editor mode uses the bottom `EditorDock`, which has
 * the crop tools and the save/reset actions; this panel never writes anything.
 */
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
        {ADJUST_CONTROLS.map((control) => (
          <AdjustSlider
            key={control.key}
            control={control}
            value={values[control.key]}
            onChange={onChange}
          />
        ))}
      </div>

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
      </p>

      <button
        type="button"
        className="adjust-reset"
        onClick={onReset}
        disabled={!hasAdjustments(values)}
      >
        Reset preview
      </button>

      <p className="adjust-note">
        Live preview only. Switch to Editor mode to save crop and colour.
      </p>
    </aside>
  )
}
