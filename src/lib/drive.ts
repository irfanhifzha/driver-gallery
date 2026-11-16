export type DriveImage = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
  /** Present for images; lets cards reserve space before the file loads. */
  imageMediaMetadata?: { width?: number; height?: number };
};

const API = "https://www.googleapis.com/drive/v3/files";
const FIELDS =
  "id,name,mimeType,size,modifiedTime,thumbnailLink,imageMediaMetadata(width,height)";

export class DriveError extends Error {
  readonly status: number;
  readonly reason?: string;

  constructor(msg: string, status: number, reason?: string) {
    super(msg);
    this.name = "DriveError";
    this.status = status;
    this.reason = reason;
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

/** Responsive candidates built from the signed thumbnail URL, or undefined. */
export const thumbSrcSet = (f: DriveImage) =>
  f.thumbnailLink
    ? [400, 800, 1600].map((w) => `${thumb(f, w)} ${w}w`).join(", ")
    : undefined;

const RAW_EXTENSIONS =
  /\.(?:nef|nrw|cr2|cr3|arw|dng|raf|rw2|orf|srw|pef|rwl|x3f|mos|erf|kdc|mrw)$/i;
const JPEG_EXTENSIONS = /\.(?:jpe?g)$/i;

export const isRawImage = (f: DriveImage) =>
  RAW_EXTENSIONS.test(f.name) || f.mimeType.startsWith("image/x-");

export const isJpegImage = (f: DriveImage) =>
  JPEG_EXTENSIONS.test(f.name) || f.mimeType === "image/jpeg";

const baseName = (name: string) =>
  name.replace(/\.[^./\\]+$/, "").toLowerCase();

/**
 * Drop RAW files that have a JPEG sibling with the same base name, so folders
 * holding both NEF + JPG versions of a shot don't show every photo twice.
 * RAW files without a JPEG match are kept.
 */
export const withoutRawDuplicates = (images: DriveImage[]) => {
  const jpegBases = new Set(
    images.filter(isJpegImage).map((f) => baseName(f.name)),
  );
  return images.filter(
    (f) => !(isRawImage(f) && jpegBases.has(baseName(f.name))),
  );
};

/** Natural aspect ratio, when Drive reports the original dimensions. */
export const aspectRatio = (f: DriveImage) => {
  const width = f.imageMediaMetadata?.width;
  const height = f.imageMediaMetadata?.height;
  return width && height ? width / height : undefined;
};

/** Public files only — safe in <img>, no auth header, no CORS dance. */
export const fullSrc = (id: string, w = 1600) =>
  `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

/** `srcSet` for the Drive thumbnail endpoint, used as the retry fallback. */
export const fullSrcSet = (id: string) =>
  [400, 800, 1600].map((w) => `${fullSrc(id, w)} ${w}w`).join(", ");
