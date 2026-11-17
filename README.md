# Drive Gallery

A Vite + React (TypeScript) photo gallery that lists images from **one public
Google Drive folder** via the Drive API v3 and renders them in a randomized
masonry grid with a keyboard-navigable lightbox and a live, preview-only photo
editor.

- No backend, no OAuth: the folder is shared "Anyone with the link", and the
  browser uses a **referrer-restricted API key**.
- Full design rationale, quotas, and upgrade paths live in
  [`react-vite-drive-gallery-plan.md`](./react-vite-drive-gallery-plan.md).
- What the site actually does at runtime — API calls, cache keys, storage,
  privacy — is mapped in [`USAGE.md`](./USAGE.md).
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

Until a folder is loaded, the app shows a **Nothing here yet** state and makes
no Drive requests. The last folder you loaded is remembered in
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
├─ lib/favorites.ts           # id-keyed shortlist in localStorage + JSON (de)serialise
├─ lib/urlState.ts            # read/write ?folder= and ?photo= address-bar state
├─ hooks/useDriveImages.ts    # fetch lifecycle, auto-pagination, full-listing cache
├─ components/
│  ├─ FolderBar.tsx           # folder link/ID input + validation
│  ├─ Gallery.tsx             # per-folder container: toolbar, filters, grid, pager
│  ├─ Toolbar.tsx             # title, photo count, RAW toggle, refresh
│  ├─ Filters.tsx             # search + type select + sort + Favorites toggle + reset
│  ├─ ImageGrid.tsx           # order-preserving masonry columns of cards
│  ├─ ImageCard.tsx           # lazy <img>, shimmer skeleton, retry + onError fallback
│  ├─ Lightbox.tsx            # full-size view, swipe/pinch zoom/pan, adjust + info + shortcuts, ←/→/Esc
│  ├─ AdjustPanel.tsx         # brightness/contrast/saturation/tint sliders
│  ├─ InfoPanel.tsx           # file metadata panel (EXIF, size, dimensions)
│  ├─ Pagination.tsx          # Prev/Next + numbered pages (24 per page)
│  └─ States.tsx              # LoadingGrid / EmptyState / ErrorState
├─ App.tsx                    # shell: resolves/persists the folder, mounts Gallery
├─ App.css                    # gallery, paging, states, lightbox + zoom styling
└─ index.css                  # warm light-theme tokens, base element styles
```

Offline work sits outside `src/`: `tools/apply_edits.py` is a standalone
reference implementation of the viewer pipeline (crop → filter → tint → white
balance) that reads the JSON from **Edits → Export** and writes processed files
to `tools/media_output/`. It is Python + Pillow + NumPy, not part of the build;
its `--selftest` documents the expected colour and crop behaviour.

### Data flow

1. `App` takes the folder from `?folder=<id>` when the address carries one,
   falling back to `localStorage["drive-gallery:folder"]`. Either way the folder
   is written back to storage and to the address bar (via `replaceState`), so
   the current view stays shareable and a reload reopens it. With neither
   present it renders a **Nothing here yet** state instead of the gallery, so no
   request is made until a folder is loaded. Only the API key is mandatory; if
   it is missing, a "Configuration needed" state is shown and nothing fetches.
   `Gallery` is keyed by the folder ID, so switching folders remounts it and
   resets paging, filters, the lightbox, and the hook's cache lookup.
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
   path ever fetches the original file — see
   [Image resolution](#image-resolution).
5. The listing is shuffled in `useDriveImages`, and `imageMediaMetadata`
   width/height (requested in `FIELDS`) sets each tile's aspect ratio, so the
   masonry order changes per visit while the layout reserves space before load.
   The same `imageMediaMetadata` object carries the EXIF fields the info panel
   displays, so no extra request is needed.
6. `Gallery` filters before paging: case-insensitive file-name search → file-type
   select (options and counts derived from the listing, e.g. `JPEG`, `NEF`) →
   **Favorites** (when its toggle is on) → `withoutRawDuplicates` (when its
   toggle is on) → `PER_PAGE = 24` slice.
   Filtering is purely client-side, resets to page 1, and adds no API requests.
7. Paging is **client-side**: the filtered array is sliced into 24-photo chunks
   and rendered by `Pagination`. Page boundaries are stable, and the lightbox
   navigates within the current page. Changing page scrolls to top; Refresh
   returns to page 1.
8. A shared `?photo=<fileId>` is resolved once the listing is available:
   `Gallery` finds the photo in the sorted list, jumps to the page it lives on,
   and opens it in the lightbox. Opening, navigating, and closing the viewer
   update the `photo` parameter in place; an id that no longer exists is
   dropped, and changing, clearing, or refreshing the folder removes it.

### Invariants to preserve

- **Components never call Google.** Network access lives in `src/lib/drive.ts`;
  components import `DriveImage`, `thumb`, and `fullSrc` from it.
- **Listings are cached; signed thumbnail URLs are not.** `thumbnailLink` values
  expire after a few hours, so never persist them beyond the short listing TTL.
- **Cache only complete listings.** `readCache` rejects entries carrying a
  `nextPageToken`, so a partial page-chain can never masquerade as the full folder.
- **Never call `files.get` per image.** One listing request covers the whole
  folder; per-file requests blow through quota and hit 403s.
- **The adjustment `filter` sits on the image elements, never on a wrapper.**
  `.lightbox-image` carries only `transform`; both views apply `filterCss()` to
  the `<img>` — in the lightbox that means the base photo *and* the HQ detail
  layer — and then paint `…-tint` (`mix-blend-mode: color`) followed by `…-wb`
  (`mix-blend-mode: soft-light`). Filtering the zoom wrapper instead runs the
  blends *inside* the filter, which makes a temperature cast nearly disappear at
  high saturation in the viewer while the grid shows it (and would leave the HQ
  layer covering the filtered base with unfiltered pixels). Keep the order, the
  CSS rules, and the filtered element identical between grid and lightbox.
- **API errors are mapped once**, in `DriveError` / `friendly()` in
  `src/lib/drive.ts`. Hooks surface only user-readable strings.
- `DriveError` must not use TypeScript constructor parameter properties —
  `erasableSyntaxOnly` is on.

### UI behaviour

- Grid: randomized masonry in explicit columns (3 columns, 2 below 1000px), so
  every photo is shown **at its natural aspect ratio**, or at the saved crop's
  ratio when one exists, while the visible top-to-bottom order follows the
  selected sort. A saved edit previews in the card too: the crop sets the card's
  shape (cover, with the crop's pan and zoom), and colour/light reuse the same
  `filter` chain plus temperature/tint blend overlays as the viewer, so a tile
  matches the photo before you open it. Cards reserve space from
  `imageMediaMetadata` while loading; cards are real `<button>`s inside the
  column divs.
- Card states: shimmer skeleton while loading, `onError` → filename tile (covers
  HEIC and expired thumbnails).
- Lightbox: fixed overlay, `role="dialog"`, `aria-modal`, focus moved to the close
  button and restored on close, body scroll locked, Tab trapped, Esc closes,
  arrows navigate, neighbours preloaded, edge arrows disabled. The filename,
  position/zoom factor, **Open in Google Drive**, **Favorite**, and keyboard
  shortcut controls form a meta band at the top; its measured height is
  reserved (and re-measured when the actions wrap or the window resizes), so
  the photo is scaled into the space below it and the two never overlap. The
  photo has square corners. Prev/next are SVG chevrons centred on the photo
  area in round buttons; on phones they move to the bottom corners for thumb
  reach.
- Live adjustments: **Adjust** opens a panel with brightness (50–150 %),
  contrast (50–150 %), saturation (0–200 %), temperature (−100 cooler … +100
  warmer), tint hue (0–360°) and tint strength (0–100 %) sliders. Changes render
  instantly: a `filter` chain on each image layer, a `mix-blend-mode: color`
  overlay for tint, then a `mix-blend-mode: soft-light` overlay for temperature,
  all inside the zoom transform so they follow pan/zoom. The grid card renders
  the exact same stack, in the same order, so a tile and the viewer agree. The
  panel shows the live values and generated `filter: …` string, with Reset, and
  is preview-only — nothing is saved, exported, or written to Drive. Esc closes
  the panel before the viewer, and settings reset when changing photos.
- File info: **Info** in the lightbox opens a panel with file name, type, size,
  pixel dimensions, capture time, camera and lens, exposure time, aperture, ISO,
  focal length, flash, GPS coordinates, and modified date. Fields Drive does not
  report are omitted, and everything comes from the single folder listing. Info
  and Adjust share the top-right corner, so opening one closes the other, and
  Esc closes the open panel before the viewer.
- Keyboard shortcuts: the round **?** button beside **Info** in the lightbox
  controls, or pressing `?`, opens a panel listing `←`/`→` (previous/next), `+`/`-`
  (zoom in/out), `0` (reset zoom), double-click (toggle 2.5×), `?` (toggle the
  list) and `Esc` (close the list, then a panel, then the viewer). The panel
  takes focus when opened and hands it back to the pill when closed.
- Zoom & touch: the mouse wheel zooms 1×–5× around the cursor, dragging pans
  while zoomed, double-click (or double-tap) toggles 2.5×/1×, and `+`, `-`, `0`
  zoom in/out/reset from the keyboard. On touch screens, pinch zooms 1×–5×
  around the fingers and a horizontal one-finger swipe changes photos while at
  1× (swiping pans while zoomed). The scaled image is clipped to its frame so it
  never covers the caption or arrows; zoom resets when changing photos.
- Search & type filter: the search field matches file names case-insensitively
  (with a clear button); the Type select lists only the types present in the
  folder with counts. Both combine with the RAW toggle and pagination, reset to
  page 1 on change, and show a "No photos match" state with **Clear filters**
  when nothing matches.
- Shareable URL state: `?folder=<id>` reopens a folder even when it differs
  from the stored one, and `?photo=<fileId>` opens the lightbox on that photo
  once the listing loads (switching to its page if needed). Both are kept in
  sync with `history.replaceState`, so the address bar can be copied at any
  time without filling the Back button. **Clear folder** removes both
  parameters, and the photo parameter is dropped when that id can no longer be
  found in the folder.
- Favorites: the heart on a card adds/removes that Drive file id from a
  shortlist stored in `localStorage["drive-gallery:favorites"]`; the **Favorites
  (n)** pill filters the grid to it and shows an empty state when the folder has
  none. Entries are id-keyed JSON with `{ name, addedAt }` metadata, so they
  survive reloads, folder switches, and renames (a renamed file keeps its id).
  The lightbox carries the same heart for the photo on screen, and **Clear
  favorites** (shown beside the filters when anything is saved) empties the
  shortlist globally.
- Order: a sort select (Name, Date modified, Size, Type) plus an ↑/↓ toggle,
  defaulting to Name ascending. Sorting is client-side over the filtered list;
  page 1 is restored on change.
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
that folder. **Open in Drive ↗** next to the form opens the current folder in
Google Drive, and **Clear folder** removes the saved folder (and returns to the
"Nothing here yet" state). There is no env-configured default folder to fall
back to.

- The folder must be public (**Anyone with the link → Viewer**); being shared
  with your account only is not enough for the API-key model.
- Invalid input shows an inline error and leaves the current folder untouched.
- The current folder is mirrored in `?folder=<id>`, and a `?photo=<fileId>`
  parameter opens that photo. A link carrying both reopens the exact view, and
  the parameters are removed again by **Clear folder**.
- Listings are cached per folder for 5 minutes, so switching back to a folder
  you just viewed is instant. Filters, paging, and the lightbox reset on switch.
- The stored folder is restored on reload when the URL has no `?folder=`. Use
  **Clear folder** (which also clears the `drive-gallery:folder` key) to start
  again from the empty prompt.
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
- The document also sets `<meta name="referrer" content="no-referrer">`, so
  right-click → **Open image in new tab** opens the photo instead of a `429`
  page. `listImages` opts back into `strict-origin-when-cross-origin` so an
  HTTP-referrer-restricted API key still sees the app origin.
- Files added to the folder without inherited sharing silently disappear from the
  listing.
- Public folder only; a file must be viewable by anyone with the link.
- The app currently has one lint warning (`react/set-state-in-effect` on the
  `?photo=` resolution effect in `Gallery`). The target page and lightbox can
  only be chosen after the listing arrives, so the effect is expected and does
  not fail lint.

## Image resolution

The gallery never downloads originals. Both image paths use Drive's thumbnail
endpoints, and both are capped:

| Where | URL | Ceiling |
| --- | --- | --- |
| Lightbox (`bestSrc`) | signed `lh3.googleusercontent.com/…=w1600`, swapped to `=s0` (largest) once zoomed, with a `=w3200` fallback; `drive.google.com/thumbnail?sz=wN` only when Drive gave no `thumbnailLink` | 1600 px **wide** normally, largest available after zoom |
| Grid (`thumbSrcSet`) | `lh3.googleusercontent.com/…=s400 / =s800 / =s1600` | 1600×1600 box; browser picks per rendered width × DPR (see below) |

- `sz=wN` scales the image to width `N`, preserving aspect ratio, and **never
  upscales** — a file narrower than `N` comes back at its native size.
- `=sN` fits the image inside an `N`×`N` box, so `=s1600` is 1600 px on the
  long edge (a 1080×1920 portrait becomes 900×1600).
- **How the grid picks a candidate:** cards declare
  `sizes="(max-width: 1000px) 46vw, 31vw"`, so the browser computes the slot
  width from the layout and multiplies by the device pixel ratio, then takes the
  smallest candidate that covers it. On a 1280 px desktop the column is ~397 CSS
  px, so it picks **400** at 1× and **800** on a 2× screen; a phone in 2-column
  mode picks 400 at 2×. **1600** is only chosen when the slot × DPR exceeds
  800 px, e.g. a very wide window on a high-DPR display.

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
- **Dynamic detail:** when the viewer zoom × crop zoom reaches 2×, the lightbox
  tries the signed link at `=s0` (largest rendition Drive holds) and falls back
  to `=w3200`; the winner is preloaded first and swapped in only after it has
  loaded, so opening stays on the 1600 px rendition and the extra download
  happens once per photo per session. The console logs
  `[drive-gallery] lightbox detail rendition <w>x<h> from <url>` — the quickest
  way to confirm what Drive actually served. If that log does not appear, the
  swap did not load and the base rendition is still on screen.
- The lightbox deliberately uses the **signed** `thumbnailLink` (rewritten to
  `=w1600` / `=w2560`) rather than `drive.google.com/thumbnail?sz=wN`: the signed
  CDN is the same host the grid already loads from, and the public thumbnail
  endpoint can answer with a smaller render than requested. The `=sN` (box) form
  is avoided because it caps the *long edge*, which would reduce portrait photos
  below what `sz=wN` returned.
- Originals would need `files.get?alt=media` with OAuth.

To raise the ceiling, change the default in `src/lib/drive.ts`
(`fullSrc(id, w = 1600)`) or the lightbox call site; the endpoint accepts larger
widths such as `sz=w2400`, at the cost of a bigger download. Drive renders
thumbnails through a separate pipeline though, so a larger `sz` is not
guaranteed to be honoured for every file.

### Recommended upgrade: progressive high-res in the lightbox

Bumping the default is the quickest fix but every open pays for it. Better is
to keep the fast preview and add a second layer on demand — **progressive
loading**, not a bigger default:

1. **Instant layer.** Keep `sz=w1600` (or even the grid's `=s800`) as the
   immediate preview, so opening a photo never waits on a big download.
2. **High-res layer.** Once the viewer settles (roughly 300–500 ms after open)
   or the user zooms past ~1.5×, fetch a larger rendition in the background,
   one photo at a time, and cross-fade it in. Two sources, in order:
   - `thumbnailLink` rewritten to `=s0` (or `=s2560`) — the signed CDN URL,
     usually the largest rendition, no referrer needed, no API quota.
   - `https://www.googleapis.com/drive/v3/files/<id>?alt=media&key=…` for the
     true original. It is the whole file (10–40 MB for a JPEG/RAW), so only
     fetch it on an explicit "full resolution" action or extreme zoom — and
     note that `alt=media` is a 200-unit download against the API quota.
3. **Cache per file id in memory** (a `Map<id, url>` of preloaded images) and
   don't re-fetch when navigating back to a photo in the same session.
4. **Tie the zoom ceiling to loaded pixels.** For example cap viewer zoom at 4×
   while only the 1600 px layer is in and 8× once the high-res layer arrives,
   instead of advertising detail the browser does not have.
5. **Keep the editor on the same texture.** The crop/colour preview should use
   the high-res image too, otherwise a tight crop looks softer than the photo
   around it.

Costs to keep in mind: each high-res fetch is real bandwidth, Drive can answer
`429` under load, and RAW-only files still have no browser-decodable rendition
at any size. Load lazily, one photo at a time, and never preload high-res for
neighbours.

### How the dynamic detail feature is built (and what went wrong getting there)

The lightbox now upgrades itself after zoom. Four separate faults made earlier
attempts look like "Drive cannot do this", and each one matters if the feature is
changed later:

1. **Wrong host.** The viewer used `drive.google.com/thumbnail?id=…&sz=w1600`
   while the grid used the signed `lh3.googleusercontent.com/…=s800` link. The
   public `thumbnail` endpoint can answer with a *smaller* rendition than the
   requested `sz`, so the lightbox could genuinely look softer than the grid
   tile it was opened from. Both paths now go through `bestSrc()` in
   `src/lib/drive.ts`: rewrite the signed `thumbnailLink` when present, fall back
   to the public endpoint only when there is none.
2. **Box vs width.** `=sN` fits the image in an `N`×`N` box, capping the **long
   edge**, whereas `sz=wN` caps the **width**. For a portrait photo `=s1600`
   returns ~900 px wide (fewer pixels than the old URL), which looks like a
   regression. `bestSrc()` therefore rewrites to `=wN`; only `largestSrc()` uses
   `=s0`, where the box form is exactly what "largest available" means.
3. **A preload cancelled by its own dependency.** The first implementation keyed
   the preload effect on the live `view.scale`. Every wheel tick re-ran the
   effect, its cleanup marked the request cancelled, and the next run skipped
   because the photo was already recorded as tried. The big image downloaded and
   was thrown away. The effect now depends on the boolean `wantDetail`
   (`viewer zoom × crop zoom >= 2`) and keeps the loaded URL in `hiRes` state.
4. **Swapping `src` never repainted.** Changing `src` on the existing `<img>`
   did not visibly replace the photo in testing, even though the preload log
   confirmed the new bytes had arrived. The sharp rendition is now a separate
   `<img class="lightbox-detail">` painted over the base image inside the same
   zoom/crop transform; it only mounts after the preload finishes, so there is no
   flash and no dependence on `src` swap behaviour. A `· HQ` marker in the
   lightbox counter confirms the layer is active.
5. **Compositor rasterization.** `will-change: transform` on `.lightbox-image`
   promoted the photo to a composited layer that Chrome may rasterize once at the
   unzoomed layout size and then magnify by `transform: scale()`. That hid every
   extra pixel the sharper rendition added. The hint was removed, letting the
   browser re-rasterize at the zoomed size.
6. **Filtering the wrong layer.** The viewer originally put the adjustment
   `filter` on `.lightbox-image` — the same wrapper that holds the tint and
   white-balance overlays. The blends then composited *inside* the filter, in the
   reverse of the grid's order (grid: filter the `<img>`, blend on top), so a
   strong temperature plus saturation was obvious in the grid and almost
   invisible in the viewer. Filtering the wrapper also meant the HQ layer painted
   unfiltered pixels over the filtered base. The `filter` now goes on every image
   layer, with the detail layer included.

Things that are correct but look wrong while debugging:

- DevTools' **"Rendered size" never changes when zooming**. Zoom is a CSS
  `transform`, which is paint-time only: the layout box stays the same (e.g.
  339×509) while the compositor magnifies it. Intrinsic size is what limits
  sharpness; rendered size is just layout.
- A photo drawn at 339 CSS px wide is *downscaled* from a 1600 px rendition and
  is already oversampled. Softness only appears when the magnification exceeds
  the intrinsic pixels (roughly `rendered width × zoom × devicePixelRatio`).
- The `HQ` marker appears only after the preload lands. If it never appears, the
  console line `[drive-gallery] lightbox detail rendition <w>x<h> from <url>`
  did not fire and the large image was not fetched (or not decoded).

Still worth fixing later:

- `largestSrc()` returns `=s0`, which for a 3712×5568 photo is ~1.9 MB on first
  zoom. If bandwidth matters more than maximum detail, use `=w2560` as the only
  detail candidate instead of `=s0` (one line in the preload effect).
- The overlay is a full-size decode; on low-memory devices a large `=s0` photo
  plus its base rendition can be heavy. Capping the detail to ~2560 px avoids it.
- If sharpness is still insufficient at high zoom after this, the structural fix
  is zooming by layout size (`zoom` or explicit `width`/`height`) instead of
  `transform: scale()`, so the rendered box itself grows; that requires rewriting
  the pan/clamp math, which is why `transform` is kept for now.

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

### Image referrers and "Open image in new tab"

Drive's thumbnail hosts (`lh3.googleusercontent.com`, `drive.google.com/thumbnail`)
answer `429` when the request carries this app's `Referer`. That is why every
gallery `<img>` sets `referrerPolicy="no-referrer"`.

A context-menu **Open image in new tab** is a top-level navigation, so it does
not use the `<img>` attribute. The static
`<meta name="referrer" content="no-referrer">` in `index.html` sets the document
policy that this navigation follows, so the new tab opens the image without a
referrer.

The Drive API fetch is the exception: `listImages` explicitly sets
`referrerPolicy: 'strict-origin-when-cross-origin'`, so a key restricted by HTTP
referrer still receives the app origin. The `<img>` elements keep their own
no-referrer attributes as a second line of defence.

If the host sends its own `Referrer-Policy` response header, set it to
`no-referrer` too — the header takes precedence over the meta tag.

Measured on the same signed URL:

| Request | Result |
| --- | --- |
| no `Referer` (gallery `<img>` and new tab now) | `200`, image bytes |
| `Referer: http://localhost:5173/` (old new-tab behaviour) | `429`, HTML error page |
| `Referer: https://drive.google.com/` | `200`, image bytes |

Signed `thumbnailLink` URLs still expire after a few hours, so a copied URL can
fail for that separate reason.

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

Ideas only, roughly ordered by effort. *Near term* keeps the current model
(public folder, API key, static site, no backend) and adds no services; the
sections after *Where this could lead* are ordered by how much they change it.

### Near term (small, no new services)

**Editing and the edit document**

- **Export the edited photos.** The saved JSON is self-contained, and
  [`tools/apply_edits.py`](./tools/apply_edits.py) is the proof: it re-renders a
  batch with Pillow + NumPy, keeping each file's own resolution by default (a
  1:1 render of a 20 MP photo takes 2–6 s; `--size 1600` brings a 6 MP photo
  down to ~0.6 s), using the same crop math and filter/blend stack as the
  viewer. The
  natural next step is a real in-browser export (`canvas`), which needs the
  pixels to be CORS-readable — the thumbnail hosts are unlikely to cooperate, so
  expect either a same-origin proxy or a "download JSON, run the script" flow.
- Batch editing in the dock: apply the current look to the whole page, copy one
  photo's adjustments to another, and "reset all colour, keep crops".
- Crop improvements: a free-form ratio field, portrait/landscape flip of the
  presets, arrow-key nudging, and a numeric zoom/pan readout.
- Undo/redo per photo (the edit object is tiny, so a short in-memory stack is
  enough) plus a "revert to last saved" that does not close the dock.
- More sliders the CSS pipeline can carry without new dependencies: straighten/
  rotate, vignette (radial-gradient overlay), and highlights/shadows
  approximated with an extra `soft-light` layer.
- Named presets ("Warm film", "High-key") stored in the same JSON envelope, so
  a look can be applied across a folder in one click.

**Browsing and discovery**

- Remember the sort choice, RAW toggle, grid density (2/3/4 columns) and page
  size per device.
- Put filters in the URL (`?q=`, `?type=`, `?sort=`, `?page=`) so a filtered,
  sorted view is shareable the way `?folder=`/`?photo=` already are.
- Compare mode: pin one photo as "A" and flick between it and the current one.
- Slideshow with an interval, following the active filter and sort.
- Group by EXIF capture day (the listing already carries `time`), with a date
  rail to jump between days.
- Optional infinite scroll alongside numbered pages, "Surprise me" for large
  folders, and a "seen recently" marker in `localStorage`.

**Quality and operations**

- Tests: unit tests for filtering, RAW dedupe, crop geometry and the adjustment
  helpers (the Python `--selftest` documents the expected colour behaviour), plus
  a browser smoke test for folder switching and the lightbox.
- Production deployment: static host, referrer allowlist, env vars, cache
  headers, and a documented rollback.
- Distinguish Drive `403` (sharing/restriction) from `429` (rate limit) in the
  UI, with a retry hint instead of one generic error string.
- Accessibility pass: `aria-live` for "n photos match", visible focus on slider
  rows, and full keyboard crop editing (currently pointer-driven).
- A tiny settings panel (cache TTL, default sort, page size) instead of
  constants, still all client-side.

### Where this could lead

Roughly ordered by how much new infrastructure each direction needs. All of them
keep the browser as the only client; the question is where — and whether — the
photos are processed.

1. **A gallery that also exports.** The edit JSON is the product: a folder of
   crop and colour decisions that can be replayed by the browser, by
   `tools/apply_edits.py`, or by a desktop tool. That turns the site from a
   viewer into a lightweight culling and editing front end, and batch export is
   the first substantial feature that needs *no* Google call at all.
2. **Curated share links.** Collections on top of the folder listing ("client
   picks", "trip", "print candidates") kept as a small JSON document and shared
   as `?collection=…` with the ids inside. Still no backend: the link carries the
   ids and the listing resolves them.
3. **Private folders via OAuth PKCE.** The one upgrade that changes the model:
   per-user tokens, refresh handling, a consent screen, and a much larger app. It
   buys private folders and per-user quota and costs the "open the link and it
   works" simplicity — worth doing only when someone asks for it.
4. **Offline-first PWA.** A service worker for the shell, the last listing, and
   short-lived thumbnail caching would make repeat visits instant and let a
   session survive a flaky connection. Signed URLs expire, so cache pixels
   briefly and refresh listings when online.
5. **Team review without accounts.** Ratings, flags and comments stored per
   browser and exchanged as JSON export/import — exactly how the edits document
   already works. A review round becomes "send me your JSON".
6. **Gallery-as-a-service.** The edge-proxy idea below turns this into something
   a photographer can hand to clients: one listing cache shared by all visitors,
   the API key server-side, per-folder TTLs, and a custom domain. Same React app
   plus a small serverless function and a KV store.
7. **Print and album output.** Crop ratios are already the hard part; a contact
   sheet or PDF layout built from the edit JSON (plus the exported renders) is a
   natural extension and can run entirely locally.
8. **AI-assisted culling and search.** Blur/duplicate detection, face grouping or
   natural-language search ("the beach at sunset") all need a model, and so a
   service: the first direction here that adds a paid dependency. The cheap
   version is client-side heuristics (sharpness from a small canvas sample,
   duplicates from EXIF time plus size) with no service at all.

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
