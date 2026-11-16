import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { fullSrc, type DriveImage } from '../lib/drive'
import {
  DEFAULT_ADJUSTMENTS,
  filterCss,
  hasAdjustments,
  type Adjustments,
} from '../lib/adjustments'
import { AdjustPanel } from './AdjustPanel'
import { InfoPanel } from './InfoPanel'
import { metadataRows } from '../lib/metadata'

const MIN_ZOOM = 1
const MAX_ZOOM = 5
const DOUBLE_CLICK_ZOOM = 2.5
const PANEL_ID = 'lightbox-adjustments'
const INFO_PANEL_ID = 'lightbox-info'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

type View = { scale: number; x: number; y: number }

const INITIAL_VIEW: View = { scale: 1, x: 0, y: 0 }

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
  const mediaRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const adjustButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const infoPanelRef = useRef<HTMLElement>(null)

  const [failedId, setFailedId] = useState<string | null>(null)
  const [view, setView] = useState<View>(INITIAL_VIEW)
  const [dragging, setDragging] = useState(false)
  const [adjustments, setAdjustments] =
    useState<Adjustments>(DEFAULT_ADJUSTMENTS)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const image = images[index]
  const failed = image ? failedId === image.id : false
  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  const resetZoom = useCallback(() => {
    dragRef.current = null
    setDragging(false)
    setView(INITIAL_VIEW)
  }, [])

  const resetAdjustments = useCallback(() => {
    setAdjustments(DEFAULT_ADJUSTMENTS)
  }, [])

  const updateAdjustments = useCallback((patch: Partial<Adjustments>) => {
    setAdjustments((prev) => ({ ...prev, ...patch }))
  }, [])

  const closeAdjust = useCallback(() => {
    setAdjustOpen(false)
    adjustButtonRef.current?.focus()
  }, [])

  const closeInfo = useCallback(() => {
    setInfoOpen(false)
    infoButtonRef.current?.focus()
  }, [])

  // The two panels share the same corner, so only one is open at a time.
  const openAdjust = useCallback(() => {
    setInfoOpen(false)
    setAdjustOpen(true)
  }, [])

  const openInfo = useCallback(() => {
    setAdjustOpen(false)
    setInfoOpen(true)
  }, [])

  const goPrev = useCallback(() => {
    if (index > 0) {
      resetZoom()
      resetAdjustments()
      onIndexChange(index - 1)
    }
  }, [index, onIndexChange, resetAdjustments, resetZoom])

  const goNext = useCallback(() => {
    if (index < images.length - 1) {
      resetZoom()
      resetAdjustments()
      onIndexChange(index + 1)
    }
  }, [index, images.length, onIndexChange, resetAdjustments, resetZoom])

  /**
   * Zoom around a screen point. The image is centred in its frame and
   * transformed as translate(x,y) scale(s), so the point under the cursor can
   * stay pinned by scaling the offset by the same ratio.
   */
  const zoomTo = useCallback(
    (
      clientX: number,
      clientY: number,
      target: (currentScale: number) => number,
    ) => {
      setView((prev) => {
        const media = mediaRef.current
        if (!media) return prev

        const scale = clamp(target(prev.scale), MIN_ZOOM, MAX_ZOOM)
        if (Math.abs(scale - prev.scale) < 0.001) return prev

        // The frame is never transformed, so its rect is the stable layout box.
        const rect = media.getBoundingClientRect()
        const ratio = scale / prev.scale
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const pointerX = clientX - centerX
        const pointerY = clientY - centerY

        let x = pointerX - ratio * (pointerX - prev.x)
        let y = pointerY - ratio * (pointerY - prev.y)

        const maxX = Math.max(0, (rect.width * scale - rect.width) / 2)
        const maxY = Math.max(0, (rect.height * scale - rect.height) / 2)

        if (scale === MIN_ZOOM) {
          x = 0
          y = 0
        }

        return {
          scale,
          x: clamp(x, -maxX, maxX),
          y: clamp(y, -maxY, maxY),
        }
      })
    },
    [],
  )

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

  // Wheel zoom, using a native listener so preventDefault is allowed.
  useEffect(() => {
    const media = mediaRef.current
    if (!media || failed) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomTo(event.clientX, event.clientY, (scale) =>
        scale * Math.exp(-event.deltaY * 0.0015),
      )
    }

    media.addEventListener('wheel', onWheel, { passive: false })
    return () => media.removeEventListener('wheel', onWheel)
  }, [failed, zoomTo])

  // Move focus into whichever panel just opened.
  useEffect(() => {
    if (!adjustOpen) return
    panelRef.current
      ?.querySelector<HTMLInputElement>('input[type="range"]')
      ?.focus()
  }, [adjustOpen])

  useEffect(() => {
    if (!infoOpen) return
    infoPanelRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [infoOpen])

  // Keyboard navigation, zoom keys, and a simple focus trap.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (adjustOpen) {
          closeAdjust()
          return
        }
        if (infoOpen) {
          closeInfo()
          return
        }
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
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomTo(window.innerWidth / 2, window.innerHeight / 2, (s) => s * 1.25)
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomTo(window.innerWidth / 2, window.innerHeight / 2, (s) => s / 1.25)
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        resetZoom()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]',
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
  }, [
    adjustOpen,
    closeAdjust,
    closeInfo,
    goNext,
    goPrev,
    infoOpen,
    onClose,
    resetZoom,
    zoomTo,
  ])

  // Preload neighbours so ←/→ feels instant. Neighbours stay at thumbnail
  // size; high-res images are only fetched for the photo being looked at.
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const neighbour = images[index + offset]
      if (neighbour) new Image().src = fullSrc(neighbour.id)
    }
  }, [images, index])

  const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (view.scale <= MIN_ZOOM) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    setView((prev) => {
      const media = mediaRef.current
      if (!media) return prev

      const rect = media.getBoundingClientRect()
      const maxX = Math.max(0, (rect.width * prev.scale - rect.width) / 2)
      const maxY = Math.max(0, (rect.height * prev.scale - rect.height) / 2)

      return {
        ...prev,
        x: clamp(drag.originX + event.clientX - drag.startX, -maxX, maxX),
        y: clamp(drag.originY + event.clientY - drag.startY, -maxY, maxY),
      }
    })
  }

  const endDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setDragging(false)
  }

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

      {failed ? null : (
        <button
          ref={adjustButtonRef}
          type="button"
          className="lightbox-adjust"
          onClick={() => (adjustOpen ? closeAdjust() : openAdjust())}
          aria-expanded={adjustOpen}
          aria-controls={PANEL_ID}
        >
          Adjust
        </button>
      )}

      <button
        ref={infoButtonRef}
        type="button"
        className="lightbox-adjust lightbox-info"
        onClick={() => (infoOpen ? closeInfo() : openInfo())}
        aria-expanded={infoOpen}
        aria-controls={INFO_PANEL_ID}
      >
        Info
      </button>

      <div className="lightbox-meta">
        <span className="lightbox-name">{image.name}</span>
        <span className="lightbox-count">
          {index + 1} / {images.length}
          {view.scale > MIN_ZOOM ? ` · ${view.scale.toFixed(1)}×` : ''}
        </span>
        {failed ? null : (
          <span className="lightbox-hint">
            Scroll to zoom · drag to pan · double-click to reset
          </span>
        )}
      </div>

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
        <div ref={mediaRef} className="lightbox-media">
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
            <div
              className={`lightbox-image${
                view.scale > MIN_ZOOM ? ' is-zoomed' : ''
              }${dragging ? ' is-dragging' : ''}`}
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                filter: hasAdjustments(adjustments)
                  ? filterCss(adjustments)
                  : undefined,
              }}
            >
              <img
                src={fullSrc(image.id)}
                alt={image.name}
                referrerPolicy="no-referrer"
                draggable={false}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={(event) => {
                  zoomTo(event.clientX, event.clientY, (scale) =>
                    scale > MIN_ZOOM ? MIN_ZOOM : DOUBLE_CLICK_ZOOM,
                  )
                }}
                onDragStart={(event) => event.preventDefault()}
                onError={() => {
                  console.error(
                    '[drive-gallery] lightbox image failed to load',
                    {
                      name: image.name,
                      mimeType: image.mimeType,
                      id: image.id,
                    },
                  )
                  setFailedId(image.id)
                  setAdjustOpen(false)
                }}
              />
              {adjustments.tintStrength > 0 ? (
                <span
                  className="lightbox-tint"
                  aria-hidden="true"
                  style={{
                    background: `hsl(${adjustments.tintHue} 80% 50%)`,
                    opacity: adjustments.tintStrength / 100,
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
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

      {adjustOpen && !failed ? (
        <AdjustPanel
          id={PANEL_ID}
          panelRef={panelRef}
          values={adjustments}
          onChange={updateAdjustments}
          onReset={resetAdjustments}
          onClose={closeAdjust}
        />
      ) : null}

      {infoOpen && image ? (
        <InfoPanel
          id={INFO_PANEL_ID}
          panelRef={infoPanelRef}
          rows={metadataRows(image)}
          onClose={closeInfo}
        />
      ) : null}
    </div>
  )
}
