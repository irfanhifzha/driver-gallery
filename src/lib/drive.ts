export type ImageMetadata = {
  width?: number;
  height?: number;
  rotation?: number;
  /** EXIF capture time, formatted as "YYYY:MM:DD HH:MM:SS". */
  time?: string;
  cameraMake?: string;
  cameraModel?: string;
  lens?: string;
  exposureTime?: number;
  aperture?: number;
  isoSpeed?: number;
  focalLength?: number;
  flashUsed?: boolean;
  location?: { latitude?: number; longitude?: number };
};

export type DriveImage = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
  /** Present for images; drives layout and the file info panel. */
  imageMediaMetadata?: ImageMetadata;
};

const API = "https://www.googleapis.com/drive/v3/files";

/** Accepts a raw Drive folder ID or any link containing `/folders/<id>`. */
export function parseFolderId(input: string) {
  const value = input.trim();
  if (!value) return null;
  const fromUrl = value.match(/\/folders\/([A-Za-z0-9_-]+)/);
  const candidate = fromUrl ? fromUrl[1] : value;
  return /^[A-Za-z0-9_-]{10,}$/.test(candidate) ? candidate : null;
}
const FIELDS =
  "id,name,mimeType,size,modifiedTime,thumbnailLink," +
  "imageMediaMetadata(width,height,rotation,time,cameraMake,cameraModel,lens," +
  "exposureTime,aperture,isoSpeed,focalLength,flashUsed,location(latitude,longitude))";

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

export async function listImages(
  folderId: string,
  pageToken?: string,
  signal?: AbortSignal,
) {
  const p = new URLSearchParams({
    key: import.meta.env.VITE_GOOGLE_API_KEY,
    q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
    fields: `nextPageToken,files(${FIELDS})`,
    pageSize: "1000",
    orderBy: "name_natural",
  });
  if (pageToken) p.set("pageToken", pageToken);

  const res = await fetch(`${API}?${p}`, {
    signal,
    // The document is no-referrer so "Open image in new tab" works; keep a
    // referrer here in case the API key is restricted by HTTP referrer.
    referrerPolicy: "strict-origin-when-cross-origin",
  });
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

const TYPE_ALIASES: Record<string, string> = {
  jpg: "JPEG",
  jpeg: "JPEG",
  tif: "TIFF",
  tiff: "TIFF",
  heic: "HEIC",
  heif: "HEIF",
};

/** Display label for a file's type, e.g. "JPEG", "NEF", "PNG". */
export const fileType = (f: DriveImage) => {
  const extension = f.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension) return TYPE_ALIASES[extension] ?? extension.toUpperCase();
  const subtype = f.mimeType.split("/")[1] ?? f.mimeType;
  return subtype.toUpperCase();
};

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
  `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`
;

/** `srcSet` for the Drive thumbnail endpoint, used as the retry fallback. */
export const fullSrcSet = (id: string) =>
  [400, 800, 1600].map((w) => `${fullSrc(id, w)} ${w}w`).join(", ");
