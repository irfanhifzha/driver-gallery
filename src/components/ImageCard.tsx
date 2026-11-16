import { useEffect, useRef, useState } from 'react'
import {
  aspectRatio,
  fullSrc,
  fullSrcSet,
  thumb,
  thumbSrcSet,
  type DriveImage,
} from '../lib/drive'

type ImageCardProps = {
  image: DriveImage
  index: number
  isFavorite: boolean
  onOpen: (index: number) => void
  onToggleFavorite: (image: DriveImage) => void
}

/** First try the signed thumbnail, then fall back to the Drive endpoint once. */
const MAX_ATTEMPTS = 2

export function ImageCard({
  image,
  index,
  isFavorite,
  onOpen,
  onToggleFavorite,
}: ImageCardProps) {
  // 'failed' covers unrenderable formats and files Drive cannot thumbnail.
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const ratio = aspectRatio(image)
  const retryTimer = useRef<number | undefined>(undefined)

  const primarySrc = thumb(image, 800) || fullSrc(image.id, 800)
  const src = attempt === 0 ? primarySrc : fullSrc(image.id, 800)

  useEffect(() => () => window.clearTimeout(retryTimer.current), [])

  const handleError = () => {
    if (attempt < MAX_ATTEMPTS - 1) {
      console.warn('[drive-gallery] thumbnail failed, retrying', {
        name: image.name,
        mimeType: image.mimeType,
        attempt: attempt + 1,
        src,
      })
      retryTimer.current = window.setTimeout(
        () => setAttempt((current) => current + 1),
        700 + Math.random() * 800,
      )
      return
    }

    console.error('[drive-gallery] image could not be displayed', {
      name: image.name,
      mimeType: image.mimeType,
      id: image.id,
      src,
      hint: 'Format may not be renderable, or Drive has no thumbnail for this file.',
    })
    setStatus('failed')
  }

  return (
    <li className="grid-item">
      <button
        type="button"
        className={`card card-${status}`}
        onClick={() => onOpen(index)}
        style={
          status === 'ready' || !ratio
            ? undefined
            : { aspectRatio: String(ratio) }
        }
      >
        {status !== 'failed' ? (
          <img
            src={src}
            srcSet={attempt === 0 ? thumbSrcSet(image) : fullSrcSet(image.id)}
            sizes="(max-width: 1000px) 46vw, 31vw"
            alt={image.name}
            loading="lazy"
            decoding="async"
            // The signed thumbnail CDN answers 429 when a Referer is sent.
            referrerPolicy="no-referrer"
            onLoad={() => setStatus('ready')}
            onError={handleError}
          />
        ) : (
          <span className="fallback">{image.name}</span>
        )}
        {status !== 'failed' ? (
          <span className="card-caption" aria-hidden="true">
            {image.name}
          </span>
        ) : null}
        {status === 'loading' ? (
          <span className="skeleton" aria-hidden="true" />
        ) : null}
      </button>

      <button
        type="button"
        className={`favorite-toggle${isFavorite ? ' is-favorite' : ''}`}
        aria-pressed={isFavorite}
        aria-label={
          isFavorite
            ? `Remove ${image.name} from favorites`
            : `Add ${image.name} to favorites`
        }
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={() => onToggleFavorite(image)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
            fill={isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  )
}
