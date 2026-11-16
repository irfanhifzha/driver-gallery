# Drive Gallery

A Vite + React (TypeScript) photo gallery that lists images from **one public
Google Drive folder** via the Drive API v3 and renders them in a responsive grid
with a keyboard-navigable lightbox.

- No backend, no OAuth: the folder is shared "Anyone with the link", and the
  browser uses a **referrer-restricted API key**.
- Full design rationale, quotas, and upgrade paths live in
  [`react-vite-drive-gallery-plan.md`](./react-vite-drive-gallery-plan.md).
- If the folder ever becomes private, swap the API-key call in
  `src/lib/drive.ts` for an `Authorization: Bearer` header (plan §10). Components
  do not need to change.

Credentials live only in `.env.local`, which is git-ignored and must be created
locally; there is no committed `.env` to fall back on.

## Stack

React 19 · TypeScript 7 · Vite 8 · oxlint. No runtime dependencies beyond React.

## Setup

Create `.env.local` in the project root (it is git-ignored via `*.local`). The
API key is required; the folder ID is only the default shown on first load, since
folders can be switched in the UI.

```
VITE_GOOGLE_API_KEY=...
VITE_DRIVE_FOLDER_ID=...
```

| Variable | Meaning |
| --- | --- |
| `VITE_GOOGLE_API_KEY` | Google Cloud API key, restricted to the Drive API and HTTP referrers (`http://localhost:5173/*`). |
| `VITE_DRIVE_FOLDER_ID` | Optional default folder: the `<id>` segment of `https://drive.google.com/drive/folders/<id>`. Can be changed per visit in the UI. |

**Env loading:** Vite reads `.env.local`.
A wrong or placeholder value here produces `400 API key not valid` straight from
Google.

Handy commands:

```bash
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build (typecheck + production bundle)
npm run lint     # oxlint
npm run preview  # serve dist/
```

## Architecture

```
src/
├─ config.ts                  # apiKey (required), defaultFolderId (optional), configError
├─ lib/drive.ts               # the ONLY module that knows Google exists
│                              #   + RAW/JPEG duplicate helpers
├─ hooks/useDriveImages.ts    # fetch lifecycle, auto-pagination, full-listing cache
├─ components/
│  ├─ FolderBar.tsx           # folder link/ID input, validation, "Use default"
│  ├─ Gallery.tsx             # per-folder container: toolbar, filters, grid, pager
│  ├─ Toolbar.tsx             # title, photo count, RAW toggle, refresh
│  ├─ Filters.tsx             # file-name search + file-type select + reset
│  ├─ ImageGrid.tsx           # <ul> grid of cards
│  ├─ ImageCard.tsx           # lazy <img>, shimmer skeleton, retry + onError fallback
│  ├─ Lightbox.tsx            # full-size view, ←/→/Esc, focus trap, scroll lock
│  ├─ Pagination.tsx          # Prev/Next + numbered pages (24 per page)
│  └─ States.tsx              # LoadingGrid / EmptyState / ErrorState
├─ App.tsx                    # shell: resolves/persists the folder, mounts Gallery
├─ App.css                    # gallery, paging, states, lightbox + zoom styling
└─ index.css                  # warm light-theme tokens, base element styles
```

### Data flow

1. `App` resolves the folder in this order: `localStorage["drive-gallery:folder"]
   → VITE_DRIVE_FOLDER_ID → empty prompt`. Only the API key is mandatory; if it
   is missing, a "Configuration needed" state is shown and nothing fetches.
   `Gallery` is keyed by the folder ID, so switching folders remounts it and
   resets paging, filters, the lightbox, and the hook's cache lookup.
2. `useDriveImages` looks for a fresh (<5 min) **complete** listing in
   `sessionStorage["drive-gallery:<folderId>"]` during the first render.
   - Cache hit → images are available immediately, no request.
   - Miss → `listImages()` runs in an effect, with an `AbortController` aborted
     on unmount, refresh, or a newer request.
3. `listImages()` calls `files.list` with
   `q = '<folderId>' in parents and trashed = false and mimeType contains 'image/'`,
   `pageSize=1000`, `orderBy=name_natural`, and a narrow `fields` list. The hook
   then **auto-paginates**: it keeps requesting pages while `nextPageToken` is
   present, appends each page as it arrives, and stops when the token comes back
   empty (capped at `MAX_PAGES = 50`). Only a complete listing is cached; there
   is no "Load more" button.
4. Cards render `thumbnailLink` as a `srcSet` (`=s400`, `=s800`, `=s1600`) so the
   browser picks a size for the column width. Those are pre-signed
   `lh3.googleusercontent.com` URLs and cost **zero** API calls. The lightbox
   uses `fullSrc(id)` (`drive.google.com/thumbnail?id=…&sz=w1600`).
5. The listing is shuffled in `useDriveImages`, and `imageMediaMetadata`
   width/height (requested in `FIELDS`) sets each tile's aspect ratio, so the
   masonry order changes per visit while the layout reserves space before load.
6. `App` filters before paging: case-insensitive file-name search → file-type
   select (options and counts derived from the listing, e.g. `JPEG`, `NEF`) →
   `withoutRawDuplicates` (when its toggle is on) → `PER_PAGE = 24` slice.
   Filtering is purely client-side, resets to page 1, and adds no API requests.
7. Paging is **client-side**: the filtered array is sliced into 24-photo chunks
   and rendered by `Pagination`. Page boundaries are stable, and the lightbox
   navigates within the current page. Changing page scrolls to top; Refresh
   returns to page 1.

### Invariants to preserve

- **Components never call Google.** Network access lives in `src/lib/drive.ts`;
  components import `DriveImage`, `thumb`, and `fullSrc` from it.
- **Listings are cached; signed thumbnail URLs are not.** `thumbnailLink` values
  expire after a few hours, so never persist them beyond the short listing TTL.
- **Cache only complete listings.** `readCache` rejects entries carrying a
  `nextPageToken`, so a partial page-chain can never masquerade as the full folder.
- **Never call `files.get` per image.** One listing request covers the whole
  folder; per-file requests blow through quota and hit 403s.
- **API errors are mapped once**, in `DriveError` / `friendly()` in
  `src/lib/drive.ts`. Hooks surface only user-readable strings.
- `DriveError` must not use TypeScript constructor parameter properties —
  `erasableSyntaxOnly` is on.

### UI behaviour

- Grid: randomized masonry via CSS `column-count` (3 columns, 2 below 1000px),
  so every photo is shown **uncropped at its natural aspect ratio** and columns
  fill in a varied pattern. Cards reserve space from `imageMediaMetadata` while
  loading; cards are real `<button>`s in a `<ul>`/`<li>` list.
- Card states: shimmer skeleton while loading, `onError` → filename tile (covers
  HEIC and expired thumbnails).
- Lightbox: fixed overlay, `role="dialog"`, `aria-modal`, focus moved to the close
  button and restored on close, body scroll locked, Tab trapped, Esc closes,
  arrows navigate, neighbours preloaded, edge arrows disabled.
- Zoom: the mouse wheel zooms 1×–5× around the cursor, dragging pans while
  zoomed, double-click toggles 2.5×/1×, and `+`, `-`, `0` zoom in/out/reset from
  the keyboard. The scaled image is clipped to its frame so it never covers the
  caption or arrows; zoom resets when changing photos.
- Search & type filter: the search field matches file names case-insensitively
  (with a clear button); the Type select lists only the types present in the
  folder with counts. Both combine with the RAW toggle and pagination, reset to
  page 1 on change, and show a "No photos match" state with **Clear filters**
  when nothing matches.
- RAW filter: a toolbar checkbox (default on) hides RAW files (NEF, NRW, CR2,
  CR3, ARW, DNG, RAF, RW2, ORF, SRW, PEF, RWL, X3F, MOS, ERF, KDC, MRW, plus
  `image/x-*` MIME types) **only when a JPEG with the same base file name
exists**, so NEF+JPG pairs show once and lone RAW shots stay visible. Matching is
  case-insensitive; the subtitle reports `· n RAW hidden`, and toggling resets to
  page 1. The filter is client-side — the cached listing still holds every file.
- Pagination: "Showing 25–48 of 70", Prev/Next, and numbered page buttons
  (first/last plus current ±1 with ellipsis for long folders). `aria-current`
  marks the active page. 24 photos per page, configurable via `PER_PAGE`.
  The range label and controls sit in a sticky pill dock pinned to the bottom of
  the viewport (`.pager-bar`, `position: sticky; bottom: 16px`) while the grid
  scrolls; it settles into normal flow at the end of the page.
- Page states: loading grid, empty folder, error + "Try again", inline page error
  when cached images are still on screen, and a "Loading all photos…" indicator
  while remaining pages are fetched in the background.

## Styling

- Light-only warm-paper palette (cream background, white cards, teal `#0f766e`
  accent) defined as CSS custom properties in `src/index.css`; there is
  deliberately no dark variant.
- Serif display headings come from system fonts (`Iowan Old Style`/Palatino/
  Georgia), body copy from the system sans stack — no webfonts are downloaded.
- All component styling lives in `src/App.css` (masonry, cards, paging, states,
  lightbox, zoom). No CSS framework or CSS-in-JS.
- The Vite template's demo styles and assets were removed; only `favicon.svg`
  remains in `public/`.

## Switching folders

The folder bar above the gallery accepts either a raw Drive folder ID or a pasted
link containing `/folders/<id>` (e.g.
`https://drive.google.com/drive/folders/1AbC...`). **Load folder** validates it,
stores it in `localStorage["drive-gallery:folder"]`, and remounts the gallery for
that folder. **Use default** appears when the current folder differs from
`VITE_DRIVE_FOLDER_ID`.

- The folder must be public (**Anyone with the link → Viewer**); being shared
  with your account only is not enough for the API-key model.
- Invalid input shows an inline error and leaves the current folder untouched.
- Listings are cached per folder for 5 minutes, so switching back to a folder
  you just viewed is instant. Filters, paging, and the lightbox reset on switch.
- The stored folder wins over the env default on reload; clear the
  `drive-gallery:folder` key (or press **Use default**) to go back.
- This is read-only: the app never modifies the folder or its sharing.

## Smoke-testing the Drive setup

When the UI shows an error, test the credentials directly. Referrer restrictions
mean the request must send a `Referer` header:

```bash
curl -s -H "Referer: http://localhost:5173/" \
  "https://www.googleapis.com/drive/v3/files?key=$KEY&q='$FOLDER_ID'+in+parents+and+trashed=false+and+mimeType+contains+'image/'&fields=files(id,name,thumbnailLink)&pageSize=5"
```

- `200` + `files` → credentials and sharing are fine; look at app code.
- `400 API key not valid` → wrong or placeholder key in `.env.local` (or the
  dev server started before the file existed — restart it).
- `403` → key restriction (referrer/API) or folder not shared publicly.

## Gotchas

- Anything prefixed `VITE_` is **baked into the browser bundle** at build time.
  The key is public by design; referrer restrictions are browser-enforced only.
  Never put a client secret or service-account JSON in a `VITE_` var.
- Changing env vars requires a dev-server restart or a redeploy.
- `in parents` is one level deep: no subfolders are listed.
- `mimeType contains 'image/'` includes formats browsers cannot render. See
  [Supported image formats](#supported-image-formats) for the full list and the
  fallback behaviour.
- Gallery `<img>` elements must keep `referrerPolicy="no-referrer"`: Drive's
  signed thumbnail CDN responds `429` to requests that send a `Referer`.
- Files added to the folder without inherited sharing silently disappear from the
  listing.
- Public folder only; a file must be viewable by anyone with the link.
- The app currently has one lint warning (`react/set-state-in-effect` on the
  mount fetch effect). It is expected for fetch-on-mount and does not fail lint.

## Supported image formats

The Drive query only filters on `mimeType contains 'image/'`, so **every** image
Drive stores is listed. HTML `<img>` can only decode some of those formats:

| Format | `mimeType` | Renders in `<img>`? |
| --- | --- | --- |
| JPEG | `image/jpeg` | Yes, everywhere |
| PNG | `image/png` | Yes, everywhere |
| GIF | `image/gif` | Yes (animated) |
| WebP | `image/webp` | Yes |
| AVIF | `image/avif` | Yes in current browsers |
| BMP | `image/bmp` | Yes (browsers decode it, but files are heavy) |
| SVG | `image/svg+xml` | Mostly; Drive often has no `thumbnailLink` for it |
| HEIC / HEIF | `image/heic`, `image/heif` | Mostly **no**; Safari/Apple platforms can decode it, Chrome/Firefox cannot |
| TIFF | `image/tiff` | No |
| JPEG 2000 | `image/jp2` | No (Safari only) |
| RAW (DNG, CR2, NEF, ARW…) | `image/x-*` | No |
| Photoshop | `image/vnd.adobe.photoshop` | No |

Browser support changes over time; treat the unsupported rows as "assume no" for
Chrome/Firefox/Edge.

### What happens to an unsupported file

1. Drive still returns it in the listing because the `mimeType` matches `image/`.
2. The card requests `thumbnailLink`. Drive often generates a **JPEG** thumbnail
   even for HEIC/RAW, so many of those tiles display fine at thumbnail size.
   That is Drive's server-side conversion, not native browser support.
3. If the thumbnail still cannot be decoded, the `<img>` fires `onError` and the
   card is replaced by a tile showing the **file name** — no broken-image icon.
4. The lightbox has no explicit fallback: opening a file the browser cannot
   decode shows the browser's broken-image rendering and the alt text.
5. A file with no `thumbnailLink` goes straight to `fullSrc()`; if that also
   fails, the card shows the filename tile.

### Debugging images that do not render

Every failure is logged to the browser console with a `[drive-gallery]` prefix:

- `thumbnail failed, retrying` (warning) — the card will retry once through
  `fullSrc()` after ~1s with jitter.
- `image could not be displayed` (error) — both attempts failed; the tile falls
  back to the file name. Includes `name`, `mimeType`, `id`, and the URL tried.
- `lightbox image failed to load` (error) — the lightbox shows a fallback panel
  with an "Open in Drive" link instead of a broken image.
- `Drive listing failed` (error) — the `files.list` request itself failed.

Known cause: Drive's signed `lh3.googleusercontent.com` thumbnail URLs answer
**429** when the request carries a `Referer` header (browsers always send one),
so every gallery `<img>` sets `referrerPolicy="no-referrer"`. Keep that attribute
when adding new images; without it, a large folder shows filename tiles instead
of photos even though the URLs work with `curl`.

A file that still fails after the retry usually has no Drive thumbnail at all
(very recent upload, processing failure, or an unusual format) — Drive returns
`404`/HTML from both endpoints for those, and the filename tile is the correct
result.

If unsupported formats should not appear at all, narrow the query in
`src/lib/drive.ts` instead of filtering after the fetch:

```ts
q: `'${folderId}' in parents and trashed = false and (
  mimeType = 'image/jpeg' or mimeType = 'image/png' or
  mimeType = 'image/webp' or mimeType = 'image/gif' or
  mimeType = 'image/avif'
)`
```

## Not implemented

Plan nice-to-haves that remain open: sort by name/date, `?folder=` URL
parameter, and production deployment (host + referrer allowlist + env vars).
