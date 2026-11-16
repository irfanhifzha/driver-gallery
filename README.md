# Drive Gallery

A Vite + React (TypeScript) photo gallery that lists images from **one public
Google Drive folder** via the Drive API v3 and renders them in a randomized
masonry grid with a keyboard-navigable lightbox and a live, preview-only photo
editor.

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
API key is the only setting; the folder is picked in the UI, so there is no
default folder baked into the build.

```
VITE_GOOGLE_API_KEY=...
```

| Variable | Meaning |
| --- | --- |
| `VITE_GOOGLE_API_KEY` | Google Cloud API key, restricted to the Drive API and HTTP referrers (`http://localhost:5173/*`). |

Until a folder is loaded, the app shows a **Pick a folder** prompt and makes no
Drive requests. The last folder you loaded is remembered in
`localStorage["drive-gallery:folder"]`, not in the environment.

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

## Cost and free limits

The project is designed to stay inside Google's free quota with no billing
account. It makes exactly one kind of Drive API call and never downloads file
content through the API.

### What this app consumes

| Traffic | Drive API call | Cost |
| --- | --- | --- |
| Loading or refreshing a folder | **one** `files.list` per 1000 files | 100 quota units |
| Scrolling, paging, filtering, search, RAW toggle | none (client-side) | 0 |
| Opening the lightbox / grid thumbnails | none — signed CDN URLs | 0 |
| File info panel, zoom, adjustments | none (same listing data) | 0 |

- A 70-photo folder is a single `files.list` → **100 quota units**, cached in
  `sessionStorage` for 5 minutes, so repeat views and back-navigation are free.
- Thumbnails come from `lh3.googleusercontent.com` / `drive.google.com/thumbnail`.
  They are neither API calls nor metered quota units (they have their own
  referrer rate limit — see [Gotchas](#gotchas)).
- There is no `files.get`, no `alt=media` download, no OAuth, no backend, and no
  paid SDK. React is the only runtime dependency.

### Current Drive API quotas (verified 2026-11-16)

Google replaced request counts with **quota units** for Cloud projects created
on or after **2026-05-01**; older projects keep their previous request-based
quotas. From Google's [Usage limits][limits] page:

| Limit | Value |
| --- | --- |
| Per minute per project | 1,000,000 quota units |
| Per minute per user per project | 325,000 quota units |
| Per day per project (egress before charges) | 1 TB |
| Per day per project (billing threshold, cannot be raised) | 400,000,000 quota units |

Method costs: read 5 units, **list 100 units**, edit 50 units, download 200 units
(`files.get` with `alt=media`). API-key requests have no user identity, so the
project-wide limits are the ones that apply here.

### How much headroom that is

- Per minute: 1,000,000 ÷ 100 = **10,000 folder listings per minute**, project-wide.
- Per day: 400,000,000 ÷ 100 = **4,000,000 folder listings** before the billing
  threshold — and each listing covers up to 1000 photos and is cached for 5 min.
- Egress: 1 TB/day applies to API downloads. This app downloads **0 bytes**
  through the API, so that limit is never approached.

A small gallery would need millions of daily visits to come close.

### Keeping it strictly free

1. **Do not attach a billing account** to the Google Cloud project that holds the
   API key. Enabling the Drive API and creating a key does not require billing;
   without a billing account there is nothing to charge, and quota errors are the
   worst case.
2. Keep the 5-minute listing cache and the single-listing design. Do not add
   per-image `files.get` calls; each one would cost 5 units and any download 200.
3. Keep the key referrer-restricted (free, and limits abuse of your project quota).
4. Google's docs state standard Drive API use is free and that exceeding quotas is
   *planned* to incur charges later in 2026 with at least 90 days' notice. Staying
   under 400 M units/day makes that a non-issue.

Not covered by any of this: static hosting and a custom domain are separate
services with their own free tiers, and the photos live in the folder owner's
Google Drive storage (15 GB free on a personal account). The gallery itself adds
no storage cost.

[limits]: https://developers.google.com/workspace/drive/api/guides/limits

## Architecture

```
src/
├─ config.ts                  # apiKey (required) + configError
├─ lib/drive.ts               # the ONLY module that knows Google exists
│                              #   + RAW/JPEG duplicate helpers
├─ lib/adjustments.ts         # adjustment defaults, CSS filter string, helpers
├─ lib/metadata.ts            # file size, EXIF time/exposure, metadata rows
├─ hooks/useDriveImages.ts    # fetch lifecycle, auto-pagination, full-listing cache
├─ components/
│  ├─ FolderBar.tsx           # folder link/ID input + validation
│  ├─ Gallery.tsx             # per-folder container: toolbar, filters, grid, pager
│  ├─ Toolbar.tsx             # title, photo count, RAW toggle, refresh
│  ├─ Filters.tsx             # file-name search + file-type select + reset
│  ├─ ImageGrid.tsx           # <ul> grid of cards
│  ├─ ImageCard.tsx           # lazy <img>, shimmer skeleton, retry + onError fallback
│  ├─ Lightbox.tsx            # full-size view, zoom/pan, adjust + info, ←/→/Esc
│  ├─ AdjustPanel.tsx         # brightness/contrast/saturation/tint sliders
│  ├─ InfoPanel.tsx           # file metadata panel (EXIF, size, dimensions)
│  ├─ Pagination.tsx          # Prev/Next + numbered pages (24 per page)
│  └─ States.tsx              # LoadingGrid / EmptyState / ErrorState
├─ App.tsx                    # shell: resolves/persists the folder, mounts Gallery
├─ App.css                    # gallery, paging, states, lightbox + zoom styling
└─ index.css                  # warm light-theme tokens, base element styles
```

### Data flow

1. `App` restores the folder from `localStorage["drive-gallery:folder"]`.
   With nothing stored it renders a **Pick a folder** prompt instead of the
   gallery, so no request is made until a folder is loaded. Only the API key is
   mandatory; if it is missing, a "Configuration needed" state is shown and
   nothing fetches. `Gallery` is keyed by the folder ID, so switching folders
   remounts it and resets paging, filters, the lightbox, and the hook's cache
   lookup.
2. `useDriveImages` looks for a fresh (<5 min) **complete** listing in
   `sessionStorage["drive-gallery:listing:<folderId>"]` during the first
   render.
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
   uses `fullSrc(id)` (`drive.google.com/thumbnail?id=…&sz=w1600`). Neither
   path ever fetches the original — see [Image resolution](#image-resolution).
5. The listing is shuffled in `useDriveImages`, and `imageMediaMetadata`
   width/height (requested in `FIELDS`) sets each tile's aspect ratio, so the
   masonry order changes per visit while the layout reserves space before load.
   The same `imageMediaMetadata` object carries the EXIF fields the info panel
   displays, so no extra request is needed.
6. `Gallery` filters before paging: case-insensitive file-name search → file-type
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
- Live adjustments: **Adjust** opens a panel with brightness (50–150 %),
  contrast (50–150 %), saturation (0–200 %), tint hue (0–360°) and tint strength
  (0–100 %) sliders. Changes render instantly: a `filter` chain on the image plus
  a `mix-blend-mode: color` overlay for tint, both inside the zoom transform so
  they follow pan/zoom. The panel shows the live values and generated
  `filter: …` string, with Reset, and is preview-only — nothing is saved,
  exported, or written to Drive. Esc closes the panel before the viewer, and
  settings reset when changing photos.
- File info: **Info** in the lightbox opens a panel with file name, type, size,
  pixel dimensions, capture time, camera and lens, exposure time, aperture, ISO,
  focal length, flash, GPS coordinates, and modified date. Fields Drive does not
  report are omitted, and everything comes from the single folder listing. Info
  and Adjust share the top-right corner, so opening one closes the other, and
  Esc closes the open panel before the viewer.
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
that folder. There is no env-configured default folder to fall back to.

- The folder must be public (**Anyone with the link → Viewer**); being shared
  with your account only is not enough for the API-key model.
- Invalid input shows an inline error and leaves the current folder untouched.
- Listings are cached per folder for 5 minutes, so switching back to a folder
  you just viewed is instant. Filters, paging, and the lightbox reset on switch.
- The stored folder is restored on reload; clear the `drive-gallery:folder`
  key to start again from the empty prompt.
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
- **Right-click → "Open image in new tab" shows a 429 page.** The new tab is a
  navigation, so the `<img>` referrer policy is ignored and the app origin is
  sent as `Referer`, which Google's thumbnail hosts reject. It is not the Drive
  API quota. Reloading that tab or pasting the URL in a fresh tab works; see
  [the debugging note](#why-open-image-in-new-tab-returns-a-429).
- Files added to the folder without inherited sharing silently disappear from the
  listing.
- Public folder only; a file must be viewable by anyone with the link.
- The app currently has one lint warning (`react/set-state-in-effect` on the
  mount fetch effect). It is expected for fetch-on-mount and does not fail lint.

## Image resolution

The gallery never downloads originals. Both image paths use Drive's thumbnail
endpoints, and both are capped:

| Where | URL | Ceiling |
| --- | --- | --- |
| Lightbox (`fullSrc`) | `drive.google.com/thumbnail?id=…&sz=w1600` | 1600 px **wide** (a portrait can be taller) |
| Grid (`thumbSrcSet`) | `lh3.googleusercontent.com/…=s400 / =s800 / =s1600` | 1600×1600 box; the browser usually picks 400 or 800 |

- `sz=wN` scales the image to width `N`, preserving aspect ratio, and **never
  upscales** — a file narrower than `N` comes back at its native size.
- `=sN` fits the image inside an `N`×`N` box, so `=s1600` is 1600 px on the
  long edge (a 1080×1920 portrait becomes 900×1600).

Measured on a folder of 1080×1920 PNGs:

```
sz=w400    400x711    371 KB
sz=w800    800x1422   1.22 MB
sz=w1600   1080x1920  2.05 MB   native, no upscaling
lh3 =s1600 900x1600   1.41 MB   square box, 1600 on the long edge
```

Consequences:

- Photos at or below the cap render 1:1, so resolution appears to differ between
  folders — a 1080 px-wide set looks identical to the original, while a 6000 px
  photo is delivered as 1600 px in the viewer.
- At 5× zoom the lightbox shows interpolated pixels; that is the cap, not a bug.
- Originals would need `files.get?alt=media` with OAuth.

To raise the ceiling, change the default in `src/lib/drive.ts`
(`fullSrc(id, w = 1600)`) or the lightbox call site; the same endpoint accepts
larger widths such as `sz=w2400`, at the cost of a bigger download. The signed
`thumbnailLink` also accepts `=s0`, which returned the **exact original bytes**
(2,053,200 bytes for the file above) with no extra API call — but only when
`thumbnailLink` exists, and those URLs expire after a few hours.

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
4. If the lightbox image fails, it is replaced by a panel with the file name,
   "This file cannot be displayed in the browser." and an **Open in Drive**
   link, so the browser never shows a broken-image icon.
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

### Why "Open image in new tab" returns a 429

The `429` is Google's referrer check on its thumbnail hosts
(`lh3.googleusercontent.com`, `drive.google.com/thumbnail`), **not** this app's
API quota — Drive API calls go to `www.googleapis.com`, images never do. The
page it returns is an HTML "rate limit exceeded" page, not an image.

In-page images work because every `<img>` sets `referrerPolicy="no-referrer"`.
Right-click → **Open image in new tab** is a top-level navigation, so the
element's referrer policy no longer applies and the browser sends the page
origin (`Referer: http://localhost:5173/`) with the request. Google treats that
unknown referrer as hotlinking and answers `429` instead of the image.

Measured on the same signed URL and the same Drive thumbnail URL:

| Request | Result |
| --- | --- |
| no `Referer` (what the gallery sends) | `200`, image bytes |
| `Referer: http://localhost:5173/` (new tab) | `429`, HTML error page |
| `Referer: https://drive.google.com/` | `200`, image bytes |

That last row is why **reloading** the 429 tab usually works: a reload refers to
the image's own `google.com` URL rather than the app, which passes the check.
Pasting the copied URL into a fresh tab (no referrer) also works. Signed
`thumbnailLink` URLs additionally expire after a few hours, so a URL copied long
ago can fail for that separate reason.

This only affects taking a single image out of the app; the gallery itself is
unaffected because it controls the referrer on every request it makes.

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

## Roadmap (not implemented)

Ideas only, roughly ordered by effort. Everything in the first two groups keeps
the current model (public folder, API key, static site, no backend).

### Near term (small, no new services)

- `?folder=<id>&photo=<fileId>` URL parameters: shareable links that reopen the
  same folder and lightbox photo, restored on load.
- Sort control (file name, modified date) with the choice remembered; random
  shuffle stays the default.
- Persist adjustments per photo in `localStorage`, or export a processed image.
  Export needs canvas + CORS, and the thumbnail hosts are unlikely to allow
  `crossOrigin="anonymous"`, so it may require a same-origin proxy.
- Favorites / shortlist in `localStorage`, with a "Favorites" filter.
- A `?` keyboard-shortcut overlay covering arrows, Esc, and zoom keys.
- Optional infinite scroll alongside numbered pages (page number in the URL).
- Higher-resolution viewing and an "Original" link — see [`TODO.md`](./TODO.md).
- Tests: unit tests for filtering, RAW dedupe, and adjustment helpers; a small
  browser smoke test for folder switching and the lightbox.
- Production deployment (static host + referrer allowlist + env vars).

### Folder scale (data volume)

- **~1,000+ files:** the listing JSON grows past what `sessionStorage` happily
  holds (typically ~5 MB per origin) and `writeCache` silently gives up, so every
  reload refetches. Cache a compact projection (id, name, mimeType, size,
  modified, width/height, thumbnail link) instead of whole objects, or move the
  cache to IndexedDB.
- **~10,000+ files:** auto-pagination fetches every page before filtering, and
  the filter runs over the whole array on each keystroke. Consider "load more"
  instead of fetching everything, memoised filtering, and sending the search to
  Drive's `q` (`name contains '…'`) with debounce.
- **~50,000+ files:** `MAX_PAGES = 50` becomes the real ceiling. At that point
  folder-wide listings stop being viable and search/paging has to move
  server-side.
- Bandwidth: cards already request 400/800/1600 with a layout-tuned `sizes`,
  `loading="lazy"`, and `decoding="async"`. If the page size or column count
  grows, re-check that `sizes` string, and consider `fetchpriority="high"` for
  the first row so the top of a long page paints sooner.

### Traffic scale (quota and caching)

- Today each new session costs one listing (100 quota units); the per-minute
  project quota is the limit that binds first if a gallery goes viral.
- Put listings behind a tiny edge/serverless proxy with a KV cache and a
  per-folder TTL, so all visitors share one upstream call and the API key can
  move server-side.
- Or bake a manifest at build time (CI writes the listing to JSON on deploy) and
  serve it statically: zero Drive calls at runtime, refresh by redeploying or by
  an on-demand rebuild hook.
- Longer TTLs for public galleries (30–60 min) plus the existing manual Refresh
  button.
- A service worker for the shell and recent listings would make revisits instant
  and the gallery usable offline; thumbnails are signed and expire, so cache
  them with short lifetimes only.

### Reach and media

- Private folders require OAuth (PKCE, per-user quotas, token refresh) and give
  up the "no login, no backend" simplicity — a deliberate non-goal until needed.
- Multiple saved folders / collections, with one listing cache per folder.
- Video support via `videoMediaMetadata` and Drive's streaming endpoint (200
  quota units per download, so it needs the same caching story as listings).
- Client-side HEIC/RAW conversion via WASM for formats `<img>` cannot decode;
  adds a large dependency, so gate it behind a click.
- Timeline grouping by EXIF `time`, and a map view from `location` metadata.
- Original-file download per photo, with a clear warning about file size.

### What would break the free model

- Fetching originals for every photo, or a `files.get` per image (5–200 quota
  units each, millions of calls at scale).
- Server-side image processing or thumbnail generation.
- OAuth verification for broad public use (privacy policy, review, consent
  screen).
- Any per-request paid API sitting in front of the gallery.
