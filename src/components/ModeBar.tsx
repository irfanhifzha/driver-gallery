export type GalleryMode = 'view' | 'editor'

type ModeBarProps = {
  mode: GalleryMode
  onChange: (mode: GalleryMode) => void
}

const OPTIONS = [
  {
    mode: 'view',
    label: 'View mode',
    hint: 'Saved edits are previewed live; the Panel stays a preview.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="2.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    ),
  },
  {
    mode: 'editor',
    label: 'Editor mode',
    hint: 'Adjust opens with every photo; save crop and colour to this browser.',
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
] as const

export function ModeBar({ mode, onChange }: ModeBarProps) {
  const active = OPTIONS.find((option) => option.mode === mode) ?? OPTIONS[0]

  return (
    <div className="mode-bar">
      <div className="mode-switch" role="group" aria-label="Gallery mode">
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            className="mode-btn"
            aria-pressed={mode === option.mode}
            onClick={() => onChange(option.mode)}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <p className="mode-hint">{active.hint}</p>
    </div>
  )
}
