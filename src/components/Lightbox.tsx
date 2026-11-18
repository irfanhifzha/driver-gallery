import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { bestSrc, largestSrc, type DriveImage } from '../lib/drive'
import type { FavoriteMap } from '../lib/favorites'
import {
  DEFAULT_ADJUSTMENTS,
  filterCss,
  hasAdjustments,
  whiteBalanceOverlay,
  type Adjustments,
} from '../lib/adjustments'
import { clampCrop, sameCrop, type Crop } from '../lib/crop'
import type { EditMap, PhotoEdit } from '../lib/edits'
import { AdjustPanel } from './AdjustPanel'
import { EditorDock, type EditorTool } from './EditorDock'
import { InfoPanel } from './InfoPanel'
import type { GalleryMode } from './ModeBar'
import { metadataRows } from '../lib/metadata'

const MIN_ZOOM = 1
const MAX_ZOOM = 5
const DOUBLE_CLICK_ZOOM = 2.5
/** Default lightbox rendition width, from the same signed CDN as the grid. */
const BASE_WIDTH = 1600
/** Fallback width when the signed link cannot serve its largest rendition. */
const DETAIL_WIDTH = 3200
/** Viewer zoom (times crop zoom) that makes the base rendition look soft. */
const DETAIL_ZOOM = 2
const PANEL_ID = 'lightbox-adjustments'
const INFO_PANEL_ID = 'lightbox-info'
const SHORTCUTS_PANEL_ID = 'lightbox-shortcuts'

const SHORTCUTS = [
  { keys: '← / →', action: 'Previous / next photo' },
  { keys: '+ / -', action: 'Zoom in / out' },
  { keys: '0', action: 'Reset zoom to 1×' },
  { keys: 'Double-click', action: 'Toggle 2.5× zoom' },
  { keys: '?', action: 'Show or hide this list' },
  { keys: 'Esc', action: 'Close this list, a panel, or the viewer' },
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

type View = { scale: number; x: number; y: number }

const INITIAL_VIEW: View = { scale: 1, x: 0, y: 0 }

type LightboxProps = {
  images: DriveImage[]
  index: number
  favorites: FavoriteMap
  mode: GalleryMode
  /** Saved crop/colour per file id, read from localStorage by the gallery. */
  edits: EditMap
  onSaveEdit: (id: string, edit: PhotoEdit) => void
  onClearEdit: (id: string) => void
  onIndexChange: (index: number) => void
  onToggleFavorite: (image: DriveImage) => void
  onClose: () => void
}

export function Lightbox({
  images,
  index,
  favorites,
  mode,
  edits,
  onSaveEdit,
  onClearEdit,
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

  const metaRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const cropRef = useRef<HTMLDivElement>(null)
  const adjustButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const infoPanelRef = useRef<HTMLElement>(null)
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null)
  const shortcutsPanelRef = useRef<HTMLElement>(null)

  const [failedId, setFailedId] = useState<string | null>(null)
  const [view, setView] = useState<View>(INITIAL_VIEW)
  /** Photo and URL of the sharper rendition, once it has loaded. */
  const [hiRes, setHiRes] = useState<{
    id: string
    src: string
    width: number
  } | null>(null)
  const hiResTriedRef = useRef(new Set<string>())
  const [dragging, setDragging] = useState(false)
  /** Live horizontal offset while a swipe is in progress. */
  const [swipeX, setSwipeX] = useState(0)
  const [settling, setSettling] = useState(false)
  const savedEdit = images[index] ? edits[images[index].id] : undefined
  const [adjustments, setAdjustments] = useState<Adjustments>(
    () => savedEdit?.adjust ?? DEFAULT_ADJUSTMENTS,
  )
  const [crop, setCrop] = useState<Crop | null>(() => savedEdit?.crop ?? null)
  const [dirty, setDirty] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [tool, setTool] = useState<EditorTool>('light')
  const cropDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    width: number
    height: number
  } | null>(null)
  // Editor mode opens with the advanced panel showing; view mode keeps it
  // closed until asked for, with edits still previewed.
  const [adjustOpen, setAdjustOpen] = useState(mode === 'editor')
  const [infoOpen, setInfoOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const image = images[index]
  const failed = image ? failedId === image.id : false
  const edited = image ? Boolean(edits[image.id]) : false
  const hasPrev = index > 0
  const hasNext = index < images.length - 1
  // A crop only owns the gestures while it is being edited. In view mode the
  // saved crop is a preview, so zoom, pan, pinch and swipe stay available.
  const editingOpen = mode === 'editor' && adjustOpen && !failed
  const cropEditing = editingOpen && tool === 'crop' && Boolean(crop)
  // An unsaved crop is a draft owned by the Crop tool. Outside that tool the
  // photo keeps its saved crop (or none), so viewer zoom and pan are not
  // trapped inside a frame that was never saved.
  const savedCrop = savedEdit?.crop ?? null
  const displayCrop =
    crop && (cropEditing || sameCrop(crop, savedCrop)) ? crop : null
  // Sharpness is only requested past this threshold; keeping it a boolean means
  // the preload runs once per photo instead of on every zoom tick.
  const wantDetail = view.scale * (crop?.zoom ?? 1) >= DETAIL_ZOOM

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

  /** View-mode panel: drop the preview, leave any saved edit untouched. */
  const resetPreview = useCallback(() => {
    setAdjustments(DEFAULT_ADJUSTMENTS)
  }, [])

  /** Editor reset also deletes the saved entry, so the "Edited" cue clears. */
  const resetEdit = useCallback(() => {
    setAdjustments(DEFAULT_ADJUSTMENTS)
    setCrop(null)
    setDirty(false)
    if (image) onClearEdit(image.id)
  }, [image, onClearEdit])

  const updateAdjustments = useCallback((patch: Partial<Adjustments>) => {
    setAdjustments((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }, [])

  const updateCrop = useCallback(
    (next: Crop | null) => {
      // Viewer zoom on top of a crop is confusing; cropping starts at 1×.
      if (next) resetZoom()
      setCrop(next)
      setDirty(true)
    },
    [resetZoom],
  )

  /** Cropping starts from a 1× view; the frame is measured untransformed. */
  const handleToolChange = useCallback(
    (next: EditorTool) => {
      if (next === 'crop') resetZoom()
      setTool(next)
    },
    [resetZoom],
  )

  const saveEdit = useCallback(() => {
    if (!image) return
    onSaveEdit(image.id, {
      adjust: adjustments,
      crop,
      updatedAt: new Date().toISOString(),
    })
    setDirty(false)
  }, [adjustments, crop, image, onSaveEdit])

  const closeAdjust = useCallback(() => {
    setAdjustOpen(false)
    adjustButtonRef.current?.focus()
  }, [])

  const closeInfo = useCallback(() => {
    setInfoOpen(false)
    infoButtonRef.current?.focus()
  }, [])

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false)
    shortcutsButtonRef.current?.focus()
  }, [])

  // The panels share the same corner, so only one is open at a time.
  const openAdjust = useCallback(() => {
    setInfoOpen(false)
    setShortcutsOpen(false)
    setAdjustOpen(true)
  }, [])

  const openInfo = useCallback(() => {
    setAdjustOpen(false)
    setShortcutsOpen(false)
    setInfoOpen(true)
  }, [])

  const openShortcuts = useCallback(() => {
    setAdjustOpen(false)
    setInfoOpen(false)
    setShortcutsOpen(true)
  }, [])

  /** Moving to another photo loads that photo's saved edit, not the last one. */
  const goTo = useCallback(
    (next: number) => {
      const saved = images[next] ? edits[images[next].id] : undefined
      setAdjustments(saved?.adjust ?? DEFAULT_ADJUSTMENTS)
      setCrop(saved?.crop ?? null)
      setDirty(false)
      setAdjustOpen(mode === 'editor')
      resetZoom()
      onIndexChange(next)
    },
    [edits, images, mode, onIndexChange, resetZoom],
  )

  const goPrev = useCallback(() => {
    if (index > 0) goTo(index - 1)
  }, [goTo, index])

  const goNext = useCallback(() => {
    if (index < images.length - 1) goTo(index + 1)
  }, [goTo, images.length, index])

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

  // Measure the filename/count/actions block and reserve that much room above
  // the photo, so the caption band never sits on top of the image — including
  // when its action pills wrap on a narrow screen.
  useEffect(() => {
    const meta = metaRef.current
    const dialog = dialogRef.current
    if (!meta || !dialog) return

    const update = () => {
      dialog.style.setProperty(
        '--lightbox-meta-bottom',
        `${meta.offsetTop + meta.offsetHeight}px`,
      )
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(meta)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [image?.id])

  // The dock is the photo's floor in editor mode: publish its height so the
  // photo shrinks to the space above it and the mobile arrows sit above it.
  useEffect(() => {
    const dock = dockRef.current
    const dialog = dialogRef.current
    if (!dock || !dialog) return

    const update = () =>
      dialog.style.setProperty('--editor-dock-height', `${dock.offsetHeight}px`)

    update()
    const observer = new ResizeObserver(update)
    observer.observe(dock)
    return () => observer.disconnect()
  }, [mode, adjustOpen])

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
    // Cropping pins the photo at 1×, so the wheel leaves the viewer alone.
    if (!media || failed || cropEditing) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomTo(event.clientX, event.clientY, (scale) =>
        scale * Math.exp(-event.deltaY * 0.0015),
      )
    }

    media.addEventListener('wheel', onWheel, { passive: false })
    return () => media.removeEventListener('wheel', onWheel)
  }, [failed, zoomTo, cropEditing])

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

  useEffect(() => {
    if (!shortcutsOpen) return
    shortcutsPanelRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [shortcutsOpen])

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
        if (shortcutsOpen) {
          closeShortcuts()
          return
        }
        onClose()
        return
      }
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault()
        if (shortcutsOpen) closeShortcuts()
        else openShortcuts()
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
        if (cropEditing) return
        event.preventDefault()
        zoomTo(window.innerWidth / 2, window.innerHeight / 2, (s) => s * 1.25)
        return
      }
      if (event.key === '-' || event.key === '_') {
        if (cropEditing) return
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
    closeShortcuts,
    cropEditing,
    goNext,
    goPrev,
    infoOpen,
    onClose,
    openShortcuts,
    resetZoom,
    shortcutsOpen,
    zoomTo,
  ])

  // Preload neighbours so ←/→ feels instant. Neighbours stay at the base
  // rendition; the sharper one is only fetched for the photo being looked at.
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const neighbour = images[index + offset]
      if (neighbour) new Image().src = bestSrc(neighbour, BASE_WIDTH)
    }
  }, [images, index])

  // Zooming past DETAIL_ZOOM swaps in a sharper rendition. Candidates are
  // preloaded in order and swapped only once loaded, so the browser serves the
  // winner from cache with no flash. This deliberately depends on the boolean
  // `wantDetail`, not on the zoom value: depending on the value tore the
  // preload down on every wheel tick and the swap never landed.
  useEffect(() => {
    if (!image || failed || !wantDetail) return
    const id = image.id
    if (hiResTriedRef.current.has(id)) return
    hiResTriedRef.current.add(id)

    // Drive sometimes ignores a requested width, so ask for the largest signed
    // rendition first and only then for an explicit 3200 px one.
    const candidates = [largestSrc(image), bestSrc(image, DETAIL_WIDTH)]

    const tryLoad = (index: number) => {
      const src = candidates[index]
      if (!src) {
        hiResTriedRef.current.delete(id)
        return
      }

      const probe = new Image()
      // The signed thumbnail CDN answers 429 when a Referer is sent.
      probe.referrerPolicy = 'no-referrer'
      probe.onload = () => {
        console.info(
          `[drive-gallery] lightbox detail rendition ${probe.naturalWidth}x${probe.naturalHeight} from ${src}`,
        )
        // Storing the id keeps this safe on navigation: the viewer only paints
        // the sharp layer for the photo it is actually showing.
        setHiRes({ id, src, width: probe.naturalWidth })
      }
      probe.onerror = () => tryLoad(index + 1)
      probe.src = src
    }

    tryLoad(0)
  }, [failed, image, wantDetail])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    // While cropping, the whole photo area starts a crop drag. Starting the
    // gesture here (rather than only on the frame) means a drag near the frame
    // edge, or on the letterbox around it, can never fall through to the
    // viewer and pan the image instead.
    if (cropEditing) {
      const frame = cropRef.current
      if (!frame || !crop) return

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const rect = frame.getBoundingClientRect()
      cropDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: crop.x,
        originY: crop.y,
        width: rect.width,
        height: rect.height,
      }
      setCropping(true)
      return
    }

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
    const cropDrag = cropDragRef.current
    if (cropDrag && cropDrag.pointerId === event.pointerId) {
      event.preventDefault()
      const dx = event.clientX - cropDrag.startX
      const dy = event.clientY - cropDrag.startY
      setCrop((prev) =>
        prev
          ? clampCrop({
              ...prev,
              x: cropDrag.originX - dx / Math.max(1, cropDrag.width / 2),
              y: cropDrag.originY - dy / Math.max(1, cropDrag.height / 2),
            })
          : prev,
      )
      setDirty(true)
      return
    }

    const point = pointersRef.current.get(event.pointerId)
    if (!point || cropEditing) return

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
    const cropDrag = cropDragRef.current
    if (cropDrag && cropDrag.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      cropDragRef.current = null
      setCropping(false)
      return
    }

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

  const handleImageError = () => {
    if (!image) return
    console.error('[drive-gallery] lightbox image failed to load', {
      name: image.name,
      mimeType: image.mimeType,
      id: image.id,
    })
    setFailedId(image.id)
    setAdjustOpen(false)
  }

  if (!image) return null

  const whiteBalanceStyle = whiteBalanceOverlay(adjustments)
  // Brightness/contrast/saturation belong on the image layers themselves, the
  // way the grid does it. Filtering the wrapper instead would run the tint and
  // white-balance blends *inside* the filter, so they composite in a different
  // order than the grid (and the HQ layer would hide an unfiltered base image).
  const imageFilter = hasAdjustments(adjustments)
    ? filterCss(adjustments)
    : undefined
  const imageStyle = imageFilter ? { filter: imageFilter } : undefined
  // The base rendition always loads; the sharp one is painted over it as a
  // separate <img>, so no src swap is needed and a failure is invisible.
  const imageSrc = bestSrc(image, BASE_WIDTH)
  const detail = hiRes?.id === image.id ? hiRes : null

  return (
    <div
      ref={dialogRef}
      className={`lightbox${editingOpen ? ' is-editing' : ''}`}
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
          aria-label="Adjust photo"
          title="Adjust"
          aria-expanded={adjustOpen}
          aria-controls={PANEL_ID}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 7h8M18 7h2M4 17h2M12 17h8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle
              cx="15"
              cy="7"
              r="2.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <circle
              cx="9"
              cy="17"
              r="2.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      )}

      <button
        ref={infoButtonRef}
        type="button"
        className="lightbox-adjust lightbox-info"
        onClick={() => (infoOpen ? closeInfo() : openInfo())}
        aria-label="File information"
        title="File info"
        aria-expanded={infoOpen}
        aria-controls={INFO_PANEL_ID}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="8.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M12 11.2v5.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <circle cx="12" cy="8" r="1.15" fill="currentColor" />
        </svg>
      </button>

      <button
        ref={shortcutsButtonRef}
        type="button"
        className="lightbox-adjust lightbox-shortcuts-toggle"
        onClick={() => (shortcutsOpen ? closeShortcuts() : openShortcuts())}
        aria-label="Keyboard shortcuts"
        aria-expanded={shortcutsOpen}
        aria-controls={SHORTCUTS_PANEL_ID}
      >
        ?
      </button>

      <div ref={metaRef} className="lightbox-meta">
        <span className="lightbox-name">{image.name}</span>
        <span className="lightbox-count">
          {index + 1} / {images.length}
          {view.scale > MIN_ZOOM ? ` · ${view.scale.toFixed(1)}×` : ''}
          {detail ? ' · HQ' : ''}
        </span>
        {edited ? (
          <span className="lightbox-edited" title="Has saved adjustments">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M4 20h4L19 9l-4-4L4 16v4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinejoin="round"
              />
              <path
                d="M13.5 6.5 17.5 10.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              />
            </svg>
            Edited
          </span>
        ) : null}
        <div className="lightbox-actions">
          <a
            className="lightbox-open"
            href={`https://drive.google.com/file/d/${image.id}/view`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Drive ↗
          </a>
          <a
            className="lightbox-open"
            href={`https://drive.google.com/uc?export=view&id=${image.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Copy Image
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
          onDragStart={(event) => event.preventDefault()}
          onDoubleClick={(event) => {
            if (cropEditing) return
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
              }${cropEditing ? ' is-crop-editing' : ''}`}
              style={{
                transform: `translate(${view.x + swipeX}px, ${view.y}px) scale(${view.scale})`,
              }}
            >
              {displayCrop ? (
                <div
                  ref={cropRef}
                  className={`lightbox-crop${cropping ? ' is-cropping' : ''}`}
                  style={
                    {
                      '--crop-ratio': displayCrop.ratio,
                      '--crop-x': displayCrop.x,
                      '--crop-y': displayCrop.y,
                      '--crop-zoom': displayCrop.zoom,
                    } as CSSProperties
                  }
                >
                  <img
                    src={imageSrc}
                    alt={image.name}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onError={handleImageError}
                    style={imageStyle}
                  />
                  {detail ? (
                    <img
                      className="lightbox-detail"
                      src={detail.src}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      style={imageStyle}
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  <img
                    src={imageSrc}
                    alt={image.name}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onError={handleImageError}
                    style={imageStyle}
                  />
                  {detail ? (
                    <img
                      className="lightbox-detail"
                      src={detail.src}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      style={imageStyle}
                    />
                  ) : null}
                </>
              )}
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

      {editingOpen ? (
        <EditorDock
          tool={tool}
          onToolChange={handleToolChange}
          values={adjustments}
          crop={crop}
          dirty={dirty}
          hasSaved={edited}
          dockRef={dockRef}
          onChange={updateAdjustments}
          onCropChange={updateCrop}
          onReset={resetEdit}
          onSave={saveEdit}
          onClose={closeAdjust}
        />
      ) : null}

      {adjustOpen && !editingOpen && !failed ? (
        <AdjustPanel
          id={PANEL_ID}
          panelRef={panelRef}
          values={adjustments}
          onChange={updateAdjustments}
          onReset={resetPreview}
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

      {shortcutsOpen ? (
        <aside
          id={SHORTCUTS_PANEL_ID}
          ref={shortcutsPanelRef}
          className="lightbox-panel shortcuts-panel"
          aria-label="Keyboard shortcuts"
        >
          <div className="panel-head">
            <h2>Keyboard shortcuts</h2>
            <button
              type="button"
              className="panel-close"
              onClick={closeShortcuts}
              aria-label="Close keyboard shortcuts"
            >
              ✕
            </button>
          </div>

          <dl className="shortcut-list">
            {SHORTCUTS.map((shortcut) => (
              <div className="shortcut-row" key={shortcut.keys}>
                <dt>
                  <kbd>{shortcut.keys}</kbd>
                </dt>
                <dd>{shortcut.action}</dd>
              </div>
            ))}
          </dl>

          <p className="info-note">Press ? at any time to close this list.</p>
        </aside>
      ) : null}
    </div>
  )
}
