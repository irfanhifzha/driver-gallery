import { parseFileId, parseFolderId } from './drive'

export type UrlState = {
  folder: string | null
  photo: string | null
}

/** Folder and photo IDs from the current address, ignoring invalid values. */
export function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search)
  return {
    folder: parseFolderId(params.get('folder') ?? ''),
    photo: parseFileId(params.get('photo')),
  }
}

type UrlPatch = {
  /** `null` removes the parameter; omit it to leave the current value alone. */
  folder?: string | null
  photo?: string | null
}

/**
 * Keep the address bar shareable. `replaceState` updates the current history
 * entry in place, so browsing does not fill the Back button with gallery states.
 */
export function updateUrl(patch: UrlPatch) {
  const url = new URL(window.location.href)

  for (const key of ['folder', 'photo'] as const) {
    const value = patch[key]
    if (value === undefined) continue
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }

  const search = url.searchParams.toString()
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${search ? `?${search}` : ''}${url.hash}`,
  )
}
