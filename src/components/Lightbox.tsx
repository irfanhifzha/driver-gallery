import { useCallback, useEffect, useRef, useState } from 'react'
import { fullSrc, type DriveImage } from '../lib/drive'

type LightboxProps = {
  images: DriveImage[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const image = images[index]
  const failed = image ? failedId === image.id : false
  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1)
  }, [index, onIndexChange])

  const goNext = useCallback(() => {
    if (index < images.length - 1) onIndexChange(index + 1)
  }, [index, images.length, onIndexChange])

  // Lock body scroll, move focus in, and give it back on close.
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  // Keyboard navigation plus a simple focus trap.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [goPrev, goNext, onClose])

  // Preload neighbours so ←/→ feels instant.
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const neighbour = images[index + offset]
      if (neighbour) new Image().src = fullSrc(neighbour.id)
    }
  }, [images, index])

  if (!image) return null

  return (
    <div
      ref={dialogRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${images.length}: ${image.name}`}
    >
      <div className="lightbox-backdrop" onClick={onClose} aria-hidden="true" />

      <button
        ref={closeRef}
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="Close image viewer"
      >
        ✕
      </button>

      <button
        type="button"
        className="lightbox-nav lightbox-prev"
        onClick={goPrev}
        disabled={!hasPrev}
        aria-label="Previous image"
      >
        ‹
      </button>

      <figure className="lightbox-figure">
        {failed ? (
          <div className="lightbox-fallback" role="status">
            <p className="lightbox-name">{image.name}</p>
            <p>This file cannot be displayed in the browser.</p>
            <a
              href={`https://drive.google.com/file/d/${image.id}/view`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Drive ↗
            </a>
          </div>
        ) : (
          <img
            src={fullSrc(image.id)}
            alt={image.name}
            referrerPolicy="no-referrer"
            onError={() => {
              console.error('[drive-gallery] lightbox image failed to load', {
                name: image.name,
                mimeType: image.mimeType,
                id: image.id,
              })
              setFailedId(image.id)
            }}
          />
        )}
        <figcaption>
          <span className="lightbox-name">{image.name}</span>
          <span className="lightbox-count">
            {index + 1} / {images.length}
          </span>
        </figcaption>
      </figure>

      <button
        type="button"
        className="lightbox-nav lightbox-next"
        onClick={goNext}
        disabled={!hasNext}
        aria-label="Next image"
      >
        ›
      </button>
    </div>
  )
}
