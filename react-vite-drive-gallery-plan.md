# React + Vite Google Drive Image Gallery — Build Plan

> Scope: a Vite + React (TypeScript) app that lists image files from one Google Drive
> folder via the Drive API v3 and renders them as a responsive gallery with a lightbox.
>
> Chosen approach: **public folder + API key** (no OAuth, no backend).
>
> Quota figures are Google's documented defaults; confirm current values in
> Cloud Console → APIs & Services → Quotas before sizing anything.

---

## 0. The one decision that shapes everything

How the browser gets permission to read the folder. Pick one before writing code.

| Model | Auth | Pros | Cons | Best for |
|---|---|---|---|---|
| **A. Public folder + API key** ⭐ | Folder set to "Anyone with the link"; API key only | No OAuth screen, no token expiry, ~20 lines of code | Anyone with the link can read the images; key must be referrer-restricted | Personal portfolio, demo, MVP |
| **B. OAuth in the browser (GIS token model)** | User signs in with Google, access token in memory | Works on private folders, no backend, no client secret | Testing mode = 100 users + 7-day refresh-token expiry; `drive.readonly` is a *restricted* scope (verification/CASA needed to go public); token lives in the page | Your own Drive, small trusted audience |
| **C. Tiny backend proxy** (Worker/Vercel fn) | Service account or OAuth code flow server-side | Tokens never in browser, can cache + proxy originals (kills CORS issues), refresh tokens durable | Extra deploy target + secret management | Real product, private folders, many users |

**This plan implements A.** Kept deliberate: the UI never talks to Google directly, so
swapping to B or C later means changing one module (`src/lib/drive.ts`), not the components.

### Scopes, precisely (relevant if you upgrade to B)

- `drive.file` — only files the app created/opened. **Cannot list an arbitrary existing
  folder.** Not usable here.
- `drive.metadata.readonly` — names/sizes/thumbnails, no original bytes. Sensitive scope.
- `drive.readonly` — full read. **Restricted scope** → public use requires Google
  verification plus an annual CASA security assessment.

---

## 1. Cloud + folder setup (~10 min, free)

1. Create a project at <https://console.cloud.google.com>.
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **Credentials → Create credentials → API key.** Then edit the key:
   - *Application restrictions* → **HTTP referrers**: `http://localhost:5173/*`
   - *API restrictions* → **Restrict key** → Google Drive API
4. In Drive: right-click the folder → **Share → General access → Anyone with the link
   → Viewer.** Share the **folder**, not individual files — children inherit access.
5. Folder ID = the segment after `/folders/` in the folder URL:
   `https://drive.google.com/drive/folders/`**`<FOLDER_ID>`**

### Smoke-test before touching React

Referrer restrictions mean `curl` must impersonate the browser:

```bash
curl -s -H "Referer: http://localhost:5173/" \
  "https://www.googleapis.com/drive/v3/files?key=$KEY\
&q='$FOLDER_ID'+in+parents+and+trashed=false+and+mimeType+contains+'image/'\
&fields=files(id,name,thumbnailLink)&pageSize=5"
```

```bash
curl -s -H "Referer: http://localhost:5173/" "https://www.googleapis.com/drive/v3/files?key=$KEY
&q='$FOLDER_ID'+in+parents+and+trashed=false+and+mimeType+contains+'image/'&fields=files(id,name,thumbnailLink)&pageSize=5"
```

```bash
curl -s -H "Referer: http://localhost:5173/" "https://www.googleapis.com/drive/v3/files?key=AIzaSyAnDfJczMr2rT_grfP-4AnuPecPz7lSfSU&q='1NAq1GHqPVKGGeg--W2zbMKqqafPLFvEw'+in+parents+and+trashed=false+and+mimeType+contains+'image/'&fields=files(id,name,thumbnailLink)&pageSize=5"
```

`200` + a `files` array → setup is done. A `403` here means key restriction or sharing
is wrong, not a code bug.

---

## 2. Scaffold

```bash
npm create vite@latest drive-gallery -- --template react-ts
cd drive-gallery
npm i
npm run dev          # http://localhost:5173
```

Requirements: Node 20.19+ or 22.12+ (Vite 7).

Generated tree (React + TS template):

```
index.html   package.json   vite.config.ts   eslint.config.js   tsconfig*.json
public/vite.svg
src/main.tsx  src/App.tsx  src/App.css  src/index.css  src/assets/react.svg  src/vite-env.d.ts
```

Target structure after the work:

```
src/
├─ config.ts                 # env reads + validation
├─ lib/drive.ts              # listImages(), DriveImage type, error mapping
├─ hooks/useDriveImages.ts   # loading / error / pagination / refresh / cache
├─ components/
│  ├─ Toolbar.tsx            # image count, refresh button
│  ├─ ImageGrid.tsx          # responsive CSS grid
│  ├─ ImageCard.tsx          # lazy <img>, skeleton, onError fallback
│  ├─ Lightbox.tsx           # full view, ←/→/Esc, focus trap
│  └─ States.tsx             # Loading / Empty / Error + Retry
└─ styles/…
```

`.env.local` (git-ignored by the template):

```
VITE_GOOGLE_API_KEY=AIza...
VITE_DRIVE_FOLDER_ID=1AbC...
```

Anything `VITE_`-prefixed ships to the browser. Fine for a referrer-restricted key;
never put a client **secret** or service-account JSON there.

`src/vite-env.d.ts` — keep the existing `/// <reference types="vite/client" />` and add:

```ts
interface ImportMetaEnv {
  readonly VITE_GOOGLE_API_KEY: string;
  readonly VITE_DRIVE_FOLDER_ID: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

---

## 3. The three files that carry the app

### 3.1 `src/lib/drive.ts`

The only module that knows Google exists.

```ts
export type DriveImage = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
};

const API = "https://www.googleapis.com/drive/v3/files";
const FIELDS = "id,name,mimeType,size,modifiedTime,thumbnailLink";

export class DriveError extends Error {
  constructor(
    msg: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(msg);
  }
}

export async function listImages(pageToken?: string, signal?: AbortSignal) {
  const p = new URLSearchParams({
    key: import.meta.env.VITE_GOOGLE_API_KEY,
    q: `'${import.meta.env.VITE_DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`,
    fields: `nextPageToken,files(${FIELDS})`,
    pageSize: "1000",
    orderBy: "name_natural",
  });
  if (pageToken) p.set("pageToken", pageToken);

  const res = await fetch(`${API}?${p}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason;
    throw new DriveError(friendly(res.status, reason), res.status, reason);
  }
  return res.json() as Promise<{ files: DriveImage[]; nextPageToken?: string }>;
}

const friendly = (status: number, reason?: string) =>
  status === 400
    ? "Folder ID looks malformed."
    : status === 403
      ? "Key restriction or folder isn't shared publicly."
      : status === 404
        ? "Folder not found."
        : status === 429 || reason === "rateLimitExceeded"
          ? "Rate limited — retry shortly."
          : `Drive request failed (${status}).`;

/** thumbnailLink ends in "=s220": resize it instead of fetching a second URL. */
export const thumb = (f: DriveImage, w = 400) =>
  f.thumbnailLink?.replace(/=s\d+(-c)?$/, `=s${w}`) ?? "";

/** Public files only — safe in <img>, no auth header, no CORS dance. */
export const fullSrc = (id: string, w = 1600) =>
  `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
```

Why `fields`: it keeps payloads tiny and avoids pulling metadata you never render.
Why thumbnails: `thumbnailLink` is a pre-signed `lh3.googleusercontent.com` URL that
works directly in `<img>` for public files with **zero API calls**, so a 500-image
gallery costs exactly **one** `files.list` request.

### 3.2 `src/hooks/useDriveImages.ts`

- `AbortController` cancelled on unmount / folder change.
- `loadMore()` follows `nextPageToken` (`pageSize` max is 1000, so most folders fit in
  one page).
- 5-minute `sessionStorage` cache keyed by folder ID — kills repeat calls on refresh
  and is good quota hygiene since the API key is project-wide.
- Returns `{ images, loading, loadingMore, error, hasMore, loadMore, refresh }`.

### 3.3 `src/App.tsx`

`Toolbar` → `ImageGrid` → `Lightbox`.

- Grid: `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`.
- Card: `aspect-ratio: 1; object-fit: cover; loading="lazy"; decoding="async"`.
- `onError` → placeholder tile (covers HEIC and expired thumbnail links).
- Alt text = file name; real `<button>`s, visible focus.
- Lightbox: `fullSrc(id)`, `←`/`→`/`Esc`, preload neighbours, lock body scroll,
  restore focus on close.

Build order → M2 static grid from hardcoded JSON → M3 real fetch → M4 lightbox →
M5 states, cache, accessibility. Roughly **2–3 hours** to something presentable.

---

## 4. UI behaviour spec

- Responsive grid, no layout shift (reserve aspect ratio).
- Skeleton shimmer while loading; `onError` → placeholder.
- States: loading, empty ("no images in this folder"), error + retry, "load more".
- Nice-to-haves: name filter, sort by name/date, refresh button, `?folder=` URL param,
  "open in Drive" via `webViewLink`.

## 5. Gotchas specific to the API-key model

- **`thumbnailLink` expires in a few hours.** Don't persist it; re-list on long-lived
  tabs or tolerate dead tiles → placeholder.
- **The API key is public and shared by every visitor** — there is no per-user quota,
  only the project's. Referrer restrictions are browser-enforced only, so treat the key
  as mildly exposed and don't build anything expensive on it.
- **Public files only.** A file added later that doesn't inherit the folder's sharing
  silently drops out of the listing.
- **No subfolders.** `in parents` is one level. Flat folder, or BFS with a depth cap
  and visited set.
- **HEIC/GIF edge cases.** `mimeType contains 'image/'` includes formats browsers can't
  render. Optionally narrow:
  `mimeType = 'image/jpeg' or 'image/png' or 'image/webp' or 'image/gif' or 'image/avif'`.
- **Downloads / originals.** `files/{id}?alt=media` needs an auth header `<img>` can't
  send, and it redirects to `googleusercontent.com` with inconsistent CORS. For this
  model prefer `fullSrc()` for display and `webViewLink` for "open in Drive".

## 6. Free-tier / quota reality check

| Thing | Free? | Practical limit |
|---|---|---|
| Drive API calls | Yes, no billing | Default ≈ **12,000 requests/min per project**, tighter per-user bursts (~10 req/s can trigger `userRateLimitExceeded`); daily ceiling is huge, so it's never binding. One `files.list` page of 1000 = 1 request. |
| Per-file requests | — | Avoid `files.get` per image (100 images = 100 requests + 403 risk). `thumbnailLink` needs **zero** API calls. |
| Drive storage | 15 GB shared across Drive/Gmail/Photos | Your images count against it; the API is not a CDN. |
| Cloud project | Free | Quota-increase requests may require a billing account attached. |
| OAuth **Testing** status (model B) | Free | **100 test users max**; **refresh tokens expire after 7 days**. |
| OAuth **Production** (model B) | Free to publish, not free to verify | Sensitive scope → privacy policy + demo video review. Restricted (`drive.readonly`) → **annual CASA assessment**, vendor cost varies (hundreds–thousands USD/yr). |
| Hosting | Vercel / Netlify / CF Pages free tier | Thumbnails come from Google's CDN, not yours — no egress bill. |

Design consequences: cache listings, never poll, back off exponentially with jitter on
`403 rateLimitExceeded`, and don't hotlink thumbnails from a high-traffic marketing page.

## 7. Deploy checklist

1. Push to GitHub, import to Vercel/Netlify/Cloudflare Pages.
2. Set `VITE_GOOGLE_API_KEY` and `VITE_DRIVE_FOLDER_ID` in the host's env settings —
   they are baked in at build time, so changing them means a redeploy.
3. Add `https://yourdomain.com/*` (and `https://*.pages.dev/*` for previews) to the API
   key's referrer list.

## 8. Milestones

| # | Deliverable | Done when |
|---|---|---|
| M0 | Cloud project, Drive API on, referrer-restricted key, public folder, folder ID | `curl` smoke test returns your images |
| M1 | Vite scaffold, env validation | Page loads; missing env fails loudly |
| M2 | Static grid from hardcoded JSON | Layout looks right at 3 viewports |
| M3 | `listImages` + pagination + error mapping | All folder images listed, "load more" works |
| M4 | Grid + lightbox + states | 100+ images scroll smoothly, keyboard nav works |
| M5 | Cache, a11y, HEIC/error fallbacks | Lighthouse a11y ≥ 95, no layout shift |
| M6 | Deploy + prod referrers | Prod URL loads images; key refuses other domains |

## 9. Risks to re-check

1. **Key exposure** — referrer restrictions are advisory outside browsers. Accept or
   move to model C.
2. **Folder sharing drift** — files added without inherited sharing disappear.
3. **Thumbnail URL expiry** — handle `onError`, don't cache signed URLs.
4. **Format coverage** — decide whether to narrow the `mimeType` filter.

## 10. Upgrade path (if the folder ever becomes private)

In `src/lib/drive.ts`, replace the `key=` param with
`Authorization: Bearer <token>` from Google Identity Services, scope
`https://www.googleapis.com/auth/drive.readonly`. Keep the same `listImages()`
signature; no component changes. Budget for OAuth verification/CASA if anyone outside
your test users will use it.
