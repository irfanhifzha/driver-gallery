import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { fullSrc, type DriveImage } from '../lib/drive'
import type { FavoriteMap } from '../lib/favorites'
import {
  DEFAULT_ADJUSTMENTS,
  filterCss,
  hasAdjustments,
  whiteBalanceOverlay,
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
  favorites: FavoriteMap
  onIndexChange: (index: number) => void
  onToggleFavorite: (image: DriveImage) => void
  onClose: () => void
}

export function Lightbox({
  images,
  index,
  favorites,
  onIndexChange,
  onToggleFavorite,
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

  // Active touch/mouse pointers, keyed by pointer id, for swipe and pinch.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{
    startDistance: number
    startScale: number
    startX: number
    startY: number
    centerX: number
    centerY: number
  } | null>(null)
  const swipeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  /** The gesture turned into a pinch; its remaining finger must not navigate. */
  const pinchedRef = useRef(false)
  const swipeMovedRef = useRef(false)
  const settleTimerRef = useRef<number | undefined>(undefined)

  const adjustButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const infoPanelRef = useRef<HTMLElement>(null)

  const [failedId, setFailedId] = useState<string | null>(null)
  const [view, setView] = useState<View>(INITIAL_VIEW)
  const [dragging, setDragging] = useState(false)
  /** Live horizontal offset while a swipe is in progress. */
  const [swipeX, setSwipeX] = useState(0)
  const [settling, setSettling] = useState(false)
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
    setSwipeX(0)
    setSettling(false)
    setView(INITIAL_VIEW)
  }, [])

  /** Animate a partial swipe back to centre; clear the timer on the next one. */
  const settleSwipe = useCallback(() => {
    if (!swipeMovedRef.current) return
    swipeMovedRef.current = false
    setSettling(true)
    setSwipeX(0)
    window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => setSettling(false), 220)
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

  useEffect(() => () => window.clearTimeout(settleTimerRef.current), [])

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

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (pointersRef.current.size === 2) {
      // A second finger turns the gesture into a pinch; drop any pan or swipe.
      dragRef.current = null
      swipeRef.current = null
      swipeMovedRef.current = false
      setDragging(false)
      setSettling(false)
      setSwipeX(0)
      pinchedRef.current = true

      const [first, second] = [...pointersRef.current.values()]
      pinchRef.current = {
        startDistance: Math.hypot(first.x - second.x, first.y - second.y),
        startScale: view.scale,
        startX: view.x,
        startY: view.y,
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
      }
      return
    }

    if (pointersRef.current.size !== 1) return

    if (view.scale > MIN_ZOOM) {
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: view.x,
        originY: view.y,
      }
      setDragging(true)
    } else {
      swipeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      }
      swipeMovedRef.current = false
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointersRef.current.get(event.pointerId)
    if (!point) return

    point.x = event.clientX
    point.y = event.clientY

    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()]
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      if (distance < 1 || pinch.startDistance < 1) return

      event.preventDefault()
      const centerX = (first.x + second.x) / 2
      const centerY = (first.y + second.y) / 2

      setView((prev) => {
        const media = mediaRef.current
        if (!media) return prev

        const rect = media.getBoundingClientRect()
        const scale = clamp(
          pinch.startScale * (distance / pinch.startDistance),
          MIN_ZOOM,
          MAX_ZOOM,
        )
        const frameCenterX = rect.left + rect.width / 2
        const frameCenterY = rect.top + rect.height / 2

        // Keep the content that was under the fingers pinned to their midpoint.
        const contentX =
          (pinch.centerX - frameCenterX - pinch.startX) / pinch.startScale
        const contentY =
          (pinch.centerY - frameCenterY - pinch.startY) / pinch.startScale

        let x = centerX - frameCenterX - contentX * scale
        let y = centerY - frameCenterY - contentY * scale

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
      return
    }

    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault()
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
      return
    }

    const swipe = swipeRef.current
    if (swipe && swipe.pointerId === event.pointerId) {
      const dx = event.clientX - swipe.startX
      const dy = event.clientY - swipe.startY

      // Only track a horizontal gesture; vertical drags do nothing here.
      if (Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault()
        swipeMovedRef.current = true
        setSettling(false)
        setSwipeX(clamp(dx, -160, 160))
      }
    }
  }

  const finishPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const swipe = swipeRef.current
    pointersRef.current.delete(event.pointerId)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    // Leaving one finger down after a pinch must not become a pan or swipe.
    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null
    }
    if (pointersRef.current.size > 0) {
      if (pinchedRef.current) {
        dragRef.current = null
        setDragging(false)
      }
      if (swipe && swipe.pointerId === event.pointerId) swipeRef.current = null
      return
    }

    dragRef.current = null
    setDragging(false)

    const wasPinched = pinchedRef.current
    pinchedRef.current = false
    if (swipe && swipe.pointerId === event.pointerId) swipeRef.current = null

    if (cancelled || wasPinched || !swipe) {
      settleSwipe()
      return
    }

    const dx = event.clientX - swipe.startX
    const dy = event.clientY - swipe.startY
    const media = mediaRef.current
    const threshold = media
      ? Math.max(48, Math.min(96, media.getBoundingClientRect().width * 0.15))
      : 48
    const horizontal =
      Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.2

    if (horizontal && dx < 0 && hasNext) {
      swipeMovedRef.current = false
      setSettling(false)
      setSwipeX(0)
      goNext()
      return
    }
    if (horizontal && dx > 0 && hasPrev) {
      swipeMovedRef.current = false
      setSettling(false)
      setSwipeX(0)
      goPrev()
      return
    }

    settleSwipe()
  }

  if (!image) return null

  const whiteBalanceStyle = whiteBalanceOverlay(adjustments)

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
        <div className="lightbox-actions">
          <a
            className="lightbox-open"
            href={`https://drive.google.com/file/d/${image.id}/view`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Drive ↗
          </a>
          <button
            type="button"
            className={`lightbox-favorite${
              favorites[image.id] ? ' is-favorite' : ''
            }`}
            aria-pressed={Boolean(favorites[image.id])}
            onClick={() => onToggleFavorite(image)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
                fill={favorites[image.id] ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            {favorites[image.id] ? 'Favorited' : 'Favorite'}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="lightbox-nav lightbox-prev"
        onClick={goPrev}
        disabled={!hasPrev}
        aria-label="Previous image"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M15 5 8 12l7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <figure className="lightbox-figure">
        <div
          ref={mediaRef}
          className="lightbox-media"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishPointer(event)}
          onPointerCancel={(event) => finishPointer(event, true)}
          onDoubleClick={(event) => {
            zoomTo(event.clientX, event.clientY, (scale) =>
              scale > MIN_ZOOM ? MIN_ZOOM : DOUBLE_CLICK_ZOOM,
            )
          }}
        >
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
              }${dragging ? ' is-dragging' : ''}${
                settling ? ' is-settling' : ''
              }`}
              style={{
                transform: `translate(${view.x + swipeX}px, ${view.y}px) scale(${view.scale})`,
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
              {whiteBalanceStyle ? (
                <span
                  className="lightbox-wb"
                  aria-hidden="true"
                  style={whiteBalanceStyle}
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
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
