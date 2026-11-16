# USAGE — what actually happens when this site runs

A plain-language map of everything the gallery does at runtime: what it calls,
what it stores, what it renders, and what it never does. For setup see
[`README.md`](./README.md); for design notes see
[`react-vite-drive-gallery-plan.md`](./react-vite-drive-gallery-plan.md).

## At a glance

- **Static client-side app.** Vite builds HTML/CSS/JS; there is no backend, no
  database, no server process, and no accounts or logins.
- **One kind of Google call:** `files.list` on the chosen public folder. No
  per-file requests, no downloads through the API, no writes.
- **Images** come from Google's thumbnail CDN using signed URLs, which are not
  API calls and cost no quota.
- **State** lives in `localStorage` (chosen folder and favorites), in
  `sessionStorage` (listing cache), and in the address-bar parameters
  `?folder=<id>` / `?photo=<fileId>`, plus in-memory React state. No app
  cookies, no service worker, no analytics, no IndexedDB.

## A normal visit, step by step

1. **Load the page.** The host serves `index.html` and the built JS/CSS. The app
   reads `?folder=` from the address first, then
   `localStorage["drive-gallery:folder"]`; either way it writes the folder back
   to both storage and the address bar.
   - Nothing in either place → shows the folder bar and a "Nothing here yet"
     state. **No Google request is made.**
   - A folder is known → jumps straight to step 3 for that folder. A matching
     `?photo=<fileId>` is opened once the listing arrives (step 8).
2. **Paste a folder link or ID and press Load folder.** The ID is extracted,
   saved to `localStorage`, mirrored in `?folder=`, and `Gallery` remounts for
   that folder. Loading another folder drops any `?photo=`. **Clear folder**
   removes the saved key and both parameters, returning to the empty state.
3. **Fetch the listing.** The app calls Drive `files.list` with the API key,
   `q = '<folderId>' in parents and trashed = false and mimeType contains 'image/'`,
   `pageSize=1000`, and a narrow `fields` list (name, MIME type, size, modified
   time, thumbnail link, image metadata incl. EXIF). If Drive returns a
   `nextPageToken`, further pages are fetched automatically (max 50 pages =
   ~50,000 files). Each page is appended as it arrives, so photos appear
   progressively.
4. **Cache the result.** Once the listing is complete it is written to
   `sessionStorage["drive-gallery:listing:<folderId>"]` with a timestamp. A
   repeat visit within 5 minutes reads that cache instead of calling Drive.
5. **Shuffle.** The listing is shuffled in memory so the masonry pattern differs
   per load. Only the complete listing is cached; the shuffle happens at read.
6. **Render.** 24 photos per page are laid out as an order-preserving masonry
   (explicit columns, so the visible order follows the selected sort). Filters,
   search, RAW-duplicate hiding, and pagination are all done in the browser over
   the cached array — no extra requests.
7. **Grid images.** Each card renders `thumbnailLink` as `srcSet` candidates
   (`=s400`, `=s800`, `=s1600`) with a tuned `sizes`, `loading="lazy"`, and
   `decoding="async"`. The browser picks a size for the column width. A saved
   edit is previewed in the card too: the card takes the crop's ratio and the
   thumbnail is drawn with the crop's pan/zoom, while colour/light reuse the
   viewer's `filter` chain and temperature/tint blend overlays. These are Google
   CDN requests, not Drive API calls, and previewing an edit adds no request.
8. **Open a photo.** The lightbox requests the same signed CDN link at
   `=w1600` (`bestSrc`, a width request, so portraits keep their pixels) and
   preloads the two neighbours at the same size. If Drive supplied no
   `thumbnailLink`, it falls back to
   `drive.google.com/thumbnail?id=…&sz=w1600` (`fullSrc`). Its top meta band links the file to
   `drive.google.com/file/d/<id>/view` in a new tab, and its height is measured
   so the photo always starts below that band. Opening, navigating, and
   closing the viewer writes the current photo id to `?photo=` (in place, via
   `replaceState`). A shared `?photo=<fileId>` link is resolved against the
   listing: the gallery jumps to the page holding that id and opens it. If the
   id is no longer in the folder, the parameter is removed.
9. **Zoom & swipe.** CSS `transform: translate() scale()` on the already-loaded
   bitmap, 1×–5×. Pinch zooms around the fingers; at 1× a horizontal swipe
   changes photos, while zoomed it pans.
   - **Dynamic detail:** when `viewer zoom × crop zoom` first reaches 2×, the
     viewer preloads a sharper rendition (`=s0`, i.e. the largest the signed link
     holds, with `=w3200` as fallback) and paints it as a second `<img>` layer
     over the base photo; the `· HQ` marker in the counter shows it is active.
     This happens once per photo per session and is remembered across
     navigation. It is a **CDN request, not an API call** — no quota units, no
     `files.get`, no `alt=media` download.
   - Because the base rendition is already loaded, opening a photo never waits
     on the sharp one, and a failed sharp fetch simply leaves the base image in
     place.
10. **Adjust.** Brightness/contrast/saturation are a CSS `filter`; temperature
    and tint are blend overlays inside the zoom transform. Preview only — no
    request, no upload, no saved file. Settings reset when changing photos and
    when the viewer closes.
11. **Shortcuts.** Pressing `?` (or clicking the round **?** button beside
    **Info**) opens a panel listing `←`/`→`, `+`/`-`, `0`, double-click, `?`,
    and `Esc`. It is display-only and makes no request; `Esc` closes it before
    any other panel or the viewer. Only one panel is open at a time.
12. **Info.** The metadata panel is built from the listing already in memory —
    no request.
13. **Favorite.** The heart on a card — or the Favorite pill in the lightbox
    overlay — toggles the file id in
    `localStorage["drive-gallery:favorites"]`, written as
    `{ version: 1, items: { <id>: { name, addedAt } } }`. The **Favorites**
    filter then shows only shortlisted files in the current folder. No request.
14. **Order.** Name / Date modified / Size / Type, ascending (default) or
    descending — client-side sort over the filtered list, resets to page 1.
15. **Open in Drive.** A normal link to `drive.google.com/drive/folders/<id>`;
    the app makes no request, Google's own page handles it.
16. **Refresh.** Clears the folder's session cache, empties the grid, closes the
    viewer, removes `?photo=`, and starts a fresh listing call (one API call per
    1000 files again).

## Network calls

| Destination | When | Counts against Drive API quota? |
| --- | --- | --- |
| Your static host | Page load, CSS/JS | No (host's own logs) |
| `www.googleapis.com/drive/v3/files` | Folder load / Refresh | **Yes** — 100 quota units per page |
| `lh3.googleusercontent.com` | Grid thumbnails, lightbox base (`=w1600`), zoomed detail (`=s0`), neighbour preloads | No — signed CDN URLs, no key |
| `drive.google.com/thumbnail` | Fallback only: files with no `thumbnailLink` | No — no API key involved |
| `drive.google.com/*` | Only if you click a Drive link | No |

### Where image bytes come from

No image ever comes through the Drive API. Both the grid and the viewer read
Google's thumbnail CDN with URLs built from the listing's signed
`thumbnailLink`:

| What | URL shape | Size |
| --- | --- | --- |
| Grid card | signed link, `=s400 / =s800 / =s1600` `srcSet` | browser picks by column width × DPR |
| Lightbox base | signed link, `=w1600` | 1600 px wide, immediate |
| Lightbox detail (zoom ≥ 2×) | signed link, `=s0` | largest Drive holds (e.g. 3712×5568) |
| Neighbour preload | signed link, `=w1600` | 1600 px wide, speculative |

- `=wN` is a **width** request, `=sN` a square **box** (long edge), which is why
  the lightbox base uses `=w` and only the "largest" request uses `=s0`.
- The detail layer costs one extra CDN download per photo per session — about
  1.9 MB for a 3712×5568 JPEG — and is never requested for neighbouring photos.
- `files.get` and `alt=media` (200 quota units, original bytes) are never used.

## API quota, in practice

- One `files.list` per 1000 files = **100 quota units**. A 70-photo folder is a
  single call, then cached for 5 minutes per tab.
- Current published limits (2026): 1,000,000 units/min per project, 325,000
  units/min per user per project, a 400,000,000 units/day billing threshold, and
  1 TB/day of API egress. This app never uses API downloads (`alt=media`), so the
  egress limit is untouched.
- 4,000,000 folder loadings/day would be needed to reach the daily threshold.
  Details and the "keep it free" advice are in the README's *Cost and free
  limits* section.
- Images can still answer `429`, but that is Google's referrer check on the
  thumbnail CDN, not your API quota. It is why every `<img>` keeps
  `referrerPolicy="no-referrer"`.

## Browser storage

| Key | Store | Lifetime | What is in it |
| --- | --- | --- | --- |
| `?folder=<id>` | Address bar | Until changed | Folder currently shown; wins over the stored folder on load |
| `?photo=<fileId>` | Address bar | Until the viewer closes | Photo open in the lightbox; resolved to its page after loading |
| `drive-gallery:folder` | `localStorage` | Until cleared | Folder ID last loaded (restored on reload when the URL has none) |
| `drive-gallery:favorites` | `localStorage` | Until removed | `{ version, items: { <fileId>: { name, addedAt } } }` — the shortlist |
| `drive-gallery:listing:<folderId>` | `sessionStorage` | 5 minutes, per tab | `{ storedAt, images: [...] }` — the complete listing incl. metadata |

- `sessionStorage` is typically ~5 MB per origin. A very large folder's JSON may
  exceed that; `writeCache` then fails silently and the next reload refetches.
- Only complete listings are cached (a leftover `nextPageToken` makes
  `readCache` reject the entry).
- Clearing `drive-gallery:folder` — or pressing **Clear folder** — returns the
  app to the "Nothing here yet" state.
- Deleting a favorited file in Drive leaves its entry behind (id + name); it
  simply never matches the current listing.
- The app sets no cookies, uses `localStorage` only for the folder key and the
  favorites JSON, and registers no service worker, so there is no offline mode.

## Client-side work (no server involved)

- **Search** is a case-insensitive substring match on file names, recomputed as
  you type over the in-memory list.
- **Type filter** options and counts are derived from the listing.
- **RAW de-duplication** hides RAW files whose base name has a matching JPEG;
  lone RAW files stay visible.
- **Pagination** slices the filtered array into 24-photo pages; page changes are
  instant and scroll to top.
- **Deep links** look up the `?photo=` id in the sorted in-memory listing to pick
  the page and lightbox index — no extra request.
- **Masonry** is CSS `column-count` (3 columns, 2 under 1000 px), with each card
  reserving space from `imageMediaMetadata` width/height to avoid layout jumps.

## Privacy and data flow

- Your folder ID is stored locally and appears in Drive links you click.
- The API key is compiled into the public bundle (visible in DevTools); it is
  protected only by HTTP-referrer and API restrictions in Google Cloud.
- Photo data goes browser ↔ Google. Nothing is sent to the site owner; only the
  static host sees asset requests.
- No upload, edit, delete, move, or sharing change is ever performed. The app is
  read-only.
- Google's own pages (Drive) may set their own cookies when you open them; that
  is outside this app.

## Limits and failure modes

| Symptom | Likely cause |
| --- | --- |
| `400 API key not valid` | Wrong/placeholder key in `.env.local`, or the dev server started before it existed |
| `403` on listing | Key restriction (referrer/API) or folder not shared "Anyone with the link" |
| `429` on an image | Referrer sent to the thumbnail CDN, or an expired/limited signed URL |
| No `· HQ` marker on zoom | The sharp preload did not load (offline, `429`, expired signed link); the base rendition stays, which is normal at low zoom |
| `HQ` shows but photo stays soft | Zoom is a CSS transform, so DevTools' "Rendered size" never changes; check the console's `[drive-gallery] lightbox detail rendition <w>x<h>` line for what Drive actually served |
| Filename tile instead of a photo | Both thumbnail and fallback failed (unsupported format, missing thumbnail, expired URL) |
| Nothing loads in a new tab | Usually an expired signed `thumbnailLink`; reload the gallery and retry from a fresh card |
| Cache seems stale | 5-minute listing TTL — press **Refresh** |
| Very large folder slow | Every page is fetched up front; the listing itself is the cost, plus JSON over the 5 MB cache budget |

## Where the behaviour lives

- `src/lib/drive.ts` — the API call, field list, URL builders (`thumb`,
  `thumbSrcSet`, `fullSrc`, `bestSrc`, `largestSrc`), RAW helpers.
- `src/hooks/useDriveImages.ts` — cache, auto-pagination, shuffle, refresh.
- `src/components/Gallery.tsx` — filters, RAW toggle, favorites state,
  pagination, page state.
- `src/components/Lightbox.tsx` — viewer, zoom, adjustments, info and
  keyboard-shortcut panels.
- `src/lib/adjustments.ts` — filter string, Temperature/tint overlays.
- `src/lib/favorites.ts` — favorites JSON read/write and toggle by file id.
- `src/lib/metadata.ts` — EXIF/size formatting for the info panel.
- `src/lib/urlState.ts` — reads `?folder=`/`?photo=` and updates the address
  bar in place with `replaceState`; `src/lib/drive.ts` validates both ids.
