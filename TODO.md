# TODO — Live photo adjustments (brightness, contrast, saturation, tint)

> Goal: a small, non-destructive preview editor in the lightbox. Sliders change
> how the photo looks on screen in real time. Nothing is uploaded, saved,
> downloaded, or written back to Drive — closing the viewer simply discards the
> settings.

## Scope decisions (v1)

- **Lightbox only.** The grid stays untouched; editing a small thumbnail is not
  useful and would cost a CSS filter per card.
- **Preview only.** No canvas export, no file download, no Drive write, no
  persistence across reloads.
- **One photo at a time.** Settings reset when navigating to another photo so it
  is always obvious which adjustments belong to which image.
- **CSS, not pixels.** Brightness/contrast/saturation use the native `filter`
  property; tint uses a blend overlay, because `filter` has no arbitrary colour
  tint.
- **No new dependencies.** Sliders and layout use existing components/tokens.

## Controls

| Control | Range | Default | Applied as |
| --- | --- | --- | --- |
| Brightness | 50–150 % | 100 % | `brightness()` |
| Contrast | 50–150 % | 100 % | `contrast()` |
| Saturation | 0–200 % | 100 % | `saturate()` |
| Tint hue | 0–360° | 0° | overlay colour `hsl(hue 80% 50%)` |
| Tint strength | 0–100 % | 0 % | overlay `opacity`, `mix-blend-mode: color` |

- A **Reset** button restores every default.
- The panel shows the live numeric value of each slider, plus a read-only
  one-line `filter: …` string (useful for "see the settings" and for copying).
- Defaults must be a true no-op: image looks identical to today at 100/100/100,
  0 % tint.

## UI plan

1. Add an **Adjust** toggle button to the lightbox controls (next to close).
2. Panel layout:
   - Desktop: floating card on the right edge of the lightbox, above the
     backdrop, below the close button.
   - Mobile: bottom sheet above the caption, sliders stacked, max-height with
     internal scroll.
3. Panel contents: heading, five labelled sliders with value read-outs, the
   `filter:` line, Reset button, close button.
4. Panel starts closed. Opening it must not interfere with zoom/pan or arrow
   navigation.
5. Values are displayed live; no "Apply" button is needed.

## Technical plan

### Files

- `src/components/Lightbox.tsx` — hold adjustment state, compute the filter
  string, render the panel toggle + panel, reset on photo change.
- `src/components/AdjustPanel.tsx` *(new)* — presentational panel: sliders,
  read-outs, CSS string, Reset/close callbacks.
- `src/App.css` — panel, slider and tint-overlay styles.
- `README.md` — document the feature and the "preview only" behaviour.

No changes to `drive.ts`, the hook, or the API layer.

### State

```ts
type Adjustments = {
  brightness: number // 100
  contrast: number   // 100
  saturation: number // 100
  tintHue: number    // 0
  tintStrength: number // 0
}
```

- `useState` inside the lightbox, initialised to defaults.
- Reset in `goPrev`/`goNext` (same place zoom resets today) and on lightbox
  close (component unmounts, so state disappears automatically).
- No `localStorage`, no `sessionStorage`, no query params.

### Rendering

- Image filter:
  `filter: brightness(b%) contrast(c%) saturate(s%)`.
- Tint overlay must sit exactly on the photo and **transform with it** when
  zoomed/panned. Plan:
  - Wrap image + overlay in a `.lightbox-image` element that receives the
    existing `translate() scale()` transform.
  - Overlay is `position: absolute; inset: 0; pointer-events: none;`
    `mix-blend-mode: color;` and `opacity: tintStrength / 100`.
  - Add `isolation: isolate` on `.lightbox-image` so the blend only affects the
    photo, not the dark backdrop.
  - Move the max-width/max-height constraints onto that wrapper; the zoom math
    in `Lightbox.tsx` already measures the untransformed `.lightbox-media`
    frame, so it needs no changes.
- Zoom/pan/drag handlers stay on the image (or move to the wrapper — verify
  pointer capture still works).

### Accessibility

- Each slider is a real `<input type="range">` inside a `<label>` with visible
  text; add `aria-valuetext` (e.g. "120 percent").
- Panel is a disclosure: the Adjust button gets `aria-expanded` and
  `aria-controls`; focus moves into the panel on open and back to the toggle on
  close.
- Keyboard: sliders use native arrow keys. Decide and document Esc behaviour:
  **Esc closes the panel when open, otherwise closes the viewer.**
- Do not trap focus twice — the panel lives inside the existing dialog focus
  trap.

## Milestones

- [ ] **M1 — Filter core.** Adjustment state, brightness/contrast/saturation
      sliders, live preview, Reset. No tint yet.
- [ ] **M2 — Tint.** Hue + strength controls and the transform-synced overlay;
      verify with zoom and pan.
- [ ] **M3 — Panel polish.** Desktop card / mobile sheet, live value read-outs,
      `filter:` string, focus handling, Esc order.
- [ ] **M4 — Docs & checks.** README section, comment in Lightbox, build + lint.

## Verification

- [ ] Sliders update the preview on every input event with no perceptible lag.
- [ ] Defaults at 100/100/100 and 0 % tint look identical to the current image.
- [ ] Reset returns all sliders and the image to defaults.
- [ ] Navigating with ←/→ resets settings for the new photo.
- [ ] Tint overlay stays glued to the photo when zooming and panning; it never
      tints the backdrop, caption, or panel.
- [ ] Panel works in both desktop and mobile layouts; no horizontal scroll.
- [ ] Keyboard-only: open panel, adjust every slider, reset, close panel, close
      viewer; Esc order is correct.
- [ ] `npm run build` and `npm run lint` pass (known single warning unchanged).

## Out of scope / possible follow-ups

- Saving/exporting the edited image (would need canvas + cross-origin handling,
  because thumbnails come from `googleusercontent.com`).
- Persisting adjustments per photo or in the URL.
- A "apply to all photos" toggle.
- Crop/rotate/flip, sharpness, vignette, or auto-enhance.
- Applying adjustments to grid thumbnails.
