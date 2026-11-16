import { fileType, type DriveImage } from './drive'

export type MetadataRow = { label: string; value: string }

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** Drive returns `size` as a byte string; show the largest sensible unit. */
function formatBytes(size?: string) {
  const bytes = Number(size)
  if (!size || !Number.isFinite(bytes) || bytes <= 0) return null

  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${UNITS[unit]}`
}

const trim = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

/**
 * Drive usually returns EXIF time as "2026:11:05 18:17:34", but some clients
 * write ISO timestamps; keep date + minutes either way.
 */
function formatExifTime(time?: string) {
  if (!time) return null

  const exif = time.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/)
  if (exif) {
    const [, year, month, day, hour, minute] = exif
    return `${year}-${month}-${day} ${hour}:${minute}`
  }

  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return time
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatExposure(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  if (seconds >= 1) return `${trim(seconds)} s`
  return `1/${Math.round(1 / seconds)} s`
}

function formatLocation(location?: { latitude?: number; longitude?: number }) {
  const { latitude, longitude } = location ?? {}
  if (latitude === undefined || longitude === undefined) return null
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
}

function formatModified(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Build the label/value rows for the lightbox info panel. Fields Drive does not
 * report are omitted rather than shown as placeholders, so screenshots and
 * phone photos don't render a wall of dashes.
 */
export function metadataRows(image: DriveImage): MetadataRow[] {
  const rows: MetadataRow[] = []
  const add = (label: string, value: string | number | null | undefined) => {
    if (value === undefined || value === null || value === '') return
    rows.push({ label, value: String(value) })
  }

  const meta = image.imageMediaMetadata ?? {}

  add('File', image.name)
  add('Type', fileType(image))
  add('Size', formatBytes(image.size))
  if (meta.width && meta.height) {
    add('Dimensions', `${meta.width} × ${meta.height} px`)
  }
  add('Captured', formatExifTime(meta.time))
  add(
    'Camera',
    [meta.cameraMake, meta.cameraModel].filter(Boolean).join(' '),
  )
  add('Lens', meta.lens)
  add('Exposure', formatExposure(meta.exposureTime))
  add('Aperture', meta.aperture ? `f/${trim(meta.aperture)}` : null)
  add('ISO', meta.isoSpeed)
  add('Focal length', meta.focalLength ? `${trim(meta.focalLength)} mm` : null)
  add(
    'Flash',
    meta.flashUsed === undefined
      ? null
      : meta.flashUsed
        ? 'Fired'
        : 'Did not fire',
  )
  add('Location', formatLocation(meta.location))
  add('Modified', formatModified(image.modifiedTime))

  return rows
}
