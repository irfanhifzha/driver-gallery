# TODO — Optional high-quality viewing

> Goal: show the normal (already sharp) thumbnail first, and let the visitor
> switch a single photo to high quality on demand. Default stays low-res so
> browsing is cheap; nothing here adds API usage.
>
> **Status:** implemented (tasks below checked). Build and lint pass; the
> visual/keyboard checks still need a browser pass.

## Cost facts (read this before choosing an approach)

| Action | Drive API calls | Quota units |
| --- | --- | --- |
| Loading / refreshing a folder | 1 × `files.list` per 1000 files | 100 |
| Switching thumbnail → high-res | **0** — signed CDN URL, no API key | **0** |
| Switching back to thumbnail | 0 — browser cache | 0 |
| Opening the file in Google Drive | 0 — Google's own page | 0 |

So a high-res **toggle inside the app is free** in quota terms. The alternative
of sending people to a Drive tab does not save quota; it only changes the UX.
Drive's 1 TB/day API egress limit also does not apply, because this never uses
`files.get?alt=media`.

What it *does* cost is bandwidth and memory. A 6000×4000 JPEG is roughly 15–25 MB
to download and about **96 MB decoded** (width × height × 4 bytes), which can
stall or crash older phones. Hence: opt-in per photo, default off.

## Decision

1. **Two tiers in the app.**
   - Default: today's lightbox source, `fullSrc(id)` (`sz=w1600`).
   - **High quality** (explicit click): `thumbnailLink` rewritten to `=s0` when
     it exists (verified to return the exact original bytes), else
     `fullSrc(id, 3200)`.
2. **Keep a Drive escape hatch** — "Open original in Drive" for the true file,
   downloads, and RAW/NEF files the browser cannot decode.
3. **No API calls for any of this.** No `files.get`, no OAuth, no proxy.

## Behaviour

- A **High quality** pill sits with the other lightbox controls; default off.
- Clicking it preloads the big image with `new Image()` and only swaps the
  `<img src>` once it decodes, so the thumbnail never blanks out; show a spinner
  and disable the toggle while loading.
- Label the cost before loading when it is large: the listing already carries
  `size`, so the button can read `High quality · 18 MB`.
- Remember the choice for the session (`sessionStorage["drive-gallery:highres"]`)
  so someone comparing several photos doesn't re-click every time. Reset to off
  for a new browser session.
- Toggling back to the thumbnail must reuse the browser cache, not refetch.
- On error, revert to the thumbnail and show a short inline message.
- Never preload high-res neighbours; ←/→ keeps preloading at thumbnail size.

## Pixel and rate-limit caveats

- `=s0` returns original bytes; a 50 MP file is a genuinely big download.
  Consider only offering `=s0` above a size threshold, otherwise `sz=w3200`.
- `sz=wN` accepts larger widths, but values beyond the file's native size just
  return the native image (no upscaling). The exact upper bound for very large
  originals is unverified.
- `thumbnailLink` URLs expire after a few hours, so a long-lived tab can fail on
  `=s0`; fall back to `fullSrc(id, 3200)` once.
- Every request must keep `referrerPolicy="no-referrer"`, and the "open in new
  tab" anchor needs `rel="noreferrer"`, or Google answers `429`.

## Tasks

- [x] Add a `quality` state to the lightbox (`'thumbnail' | 'high'`), default
      `'thumbnail'`, seeded from `sessionStorage`.
- [x] Build the high-res URL helper (`=s0` when `thumbnailLink` exists, else
      `fullSrc(id, 3200)`) next to `fullSrc` in `src/lib/drive.ts`.
- [x] Implement preload-then-swap with a loading state and error fallback.
- [x] Add the toggle pill, `aria-pressed`, and the file-size label.
- [x] Add "Open original in Drive" (`/file/d/<id>/view`, `target="_blank"`,
      `rel="noreferrer"`).
- [ ] Re-check the control spacing on mobile now that the tools row can wrap.
- [x] Document the toggle in `README.md` (UI behaviour + cost section).

## Verification

- [ ] Toggling quality makes no request to `www.googleapis.com` (check DevTools).
- [ ] High quality is visibly sharper at 100 % and at 5× zoom.
- [ ] Switching back is instant (cached) and the toggle state is remembered
      across photos in the same session.
- [ ] A file with no `thumbnailLink` still reaches high quality via the
      `fullSrc(id, 3200)` fallback.
- [ ] RAW/NEF still reach the Drive link and never break the layout.
- [x] `npm run build` and `npm run lint` pass with zero warnings.
