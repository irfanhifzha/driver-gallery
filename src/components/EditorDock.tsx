import type { RefObject } from 'react'
import type { Adjustments } from '../lib/adjustments'
import type { Crop } from '../lib/crop'
import { ADJUST_CONTROLS } from '../lib/adjustmentControls'
import { AdjustSlider } from './AdjustSlider'
import { CropControls } from './CropControls'

export type EditorTool = 'light' | 'color' | 'crop'

const TOOLS = [
  {
    tool: 'light',
    label: 'Light',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M4 7h6M16 7h4M4 17h4M14 17h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle
          cx="13"
          cy="7"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <circle
          cx="11"
          cy="17"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    ),
  },
  {
    tool: 'color',
    label: 'Color',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 3.2s5.8 6.1 5.8 9.8a5.8 5.8 0 0 1-11.6 0C6.2 9.3 12 3.2 12 3.2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9.4 13.4a2.7 2.7 0 0 0 2.7 2.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    tool: 'crop',
    label: 'Crop',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M7 3v12.5A1.5 1.5 0 0 0 8.5 17H21M3 7h12.5A1.5 1.5 0 0 1 17 8.5V21"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
] as const

const TITLES: Record<EditorTool, string> = {
  light: 'Light',
  color: 'Color',
  crop: 'Crop',
}

type EditorDockProps = {
  tool: EditorTool
  onToolChange: (tool: EditorTool) => void
  values: Adjustments
  crop: Crop | null
  dirty: boolean
  hasSaved: boolean
  dockRef: RefObject<HTMLDivElement | null>
  onChange: (patch: Partial<Adjustments>) => void
  onCropChange: (crop: Crop | null) => void
  onReset: () => void
  onSave: () => void
  onClose: () => void
}

export function EditorDock({
  tool,
  onToolChange,
  values,
  crop,
  dirty,
  hasSaved,
  dockRef,
  onChange,
  onCropChange,
  onReset,
  onSave,
  onClose,
}: EditorDockProps) {
  return (
    <div ref={dockRef} className="editor-dock">
      <div
        className="editor-tray"
        role="region"
        aria-label={`${TITLES[tool]} adjustments`}
      >
        <div className="editor-tray-head">
          <h2>{TITLES[tool]}</h2>
          <div className="editor-tray-actions">
            <button
              type="button"
              className="editor-reset"
              onClick={onReset}
              disabled={!dirty && !hasSaved}
            >
              Reset
            </button>
            <button
              type="button"
              className="adjust-save"
              onClick={onSave}
              disabled={!dirty}
            >
              Save
            </button>
            <button
              type="button"
              className="panel-close"
              onClick={onClose}
              aria-label="Close editor controls"
            >
              ✕
            </button>
          </div>
        </div>

        {tool === 'crop' ? (
          <CropControls crop={crop} onChange={onCropChange} />
        ) : (
          <div className="editor-sliders">
            {ADJUST_CONTROLS.filter((control) => control.group === tool).map(
              (control) => (
                <AdjustSlider
                  key={control.key}
                  control={control}
                  value={values[control.key]}
                  onChange={onChange}
                />
              ),
            )}
          </div>
        )}

        <p className="editor-status">
          {dirty
            ? 'Unsaved changes — Save stores them in this browser.'
            : hasSaved
              ? 'Saved in this browser. Reset removes the saved edit.'
              : 'No edits yet. Move a slider or pick a crop ratio.'}
        </p>
      </div>

      <div className="editor-tabs" role="group" aria-label="Editor tools">
        {TOOLS.map((item) => (
          <button
            key={item.tool}
            type="button"
            className="editor-tab"
            aria-pressed={tool === item.tool}
            onClick={() => onToolChange(item.tool)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
