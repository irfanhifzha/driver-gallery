import { useEffect, useMemo, useState } from 'react'
import { aspectRatio, type DriveImage } from '../lib/drive'
import type { FavoriteMap } from '../lib/favorites'
import { ImageCard } from './ImageCard'

type GridEntry = {
  image: DriveImage
  index: number
}

type ImageGridProps = {
  images: DriveImage[]
  favorites: FavoriteMap
  onOpen: (index: number) => void
  onToggleFavorite: (image: DriveImage) => void
}

/** Matches the `.grid` breakpoint in App.css. */
const NARROW_QUERY = '(max-width: 1000px)'
const WIDE_COLUMNS = 3
const NARROW_COLUMNS = 2
/** Fallback shape for files without dimensions, matching the card placeholder. */
const FALLBACK_RATIO = 4 / 3
/** Rough cost of the gap between cards, in units of column width. */
const GAP_WEIGHT = 0.04

function useColumnCount() {
  const [columnCount, setColumnCount] = useState(() =>
    window.matchMedia(NARROW_QUERY).matches ? NARROW_COLUMNS : WIDE_COLUMNS,
  )

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY)
    const update = () =>
      setColumnCount(query.matches ? NARROW_COLUMNS : WIDE_COLUMNS)

    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return columnCount
}

export function ImageGrid({
  images,
  favorites,
  onOpen,
  onToggleFavorite,
}: ImageGridProps) {
  const columnCount = useColumnCount()

  // CSS `column-count` lays items out down each column, so a sorted list reads
  // in the wrong order (and reflows as images load). Build the columns here
  // instead: each item in sort order goes to the currently shortest column, so
  // scanning the grid top to bottom follows the selected order.
  const columns = useMemo(() => {
    const buckets = Array.from(
      { length: columnCount },
      (): GridEntry[] => [],
    )
    const heights = Array.from({ length: columnCount }, () => 0)

    images.forEach((image, index) => {
      let target = 0
      for (let column = 1; column < columnCount; column += 1) {
        if (heights[column] < heights[target]) target = column
      }

      buckets[target].push({ image, index })
      heights[target] += 1 / (aspectRatio(image) ?? FALLBACK_RATIO) + GAP_WEIGHT
    })

    return buckets
  }, [images, columnCount])

  return (
    <div className="grid">
      {columns.map((column, columnIndex) => (
        <div className="grid-column" key={columnIndex}>
          {column.map(({ image, index }) => (
            <ImageCard
              key={image.id}
              image={image}
              index={index}
              isFavorite={Boolean(favorites[image.id])}
              onOpen={onOpen}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
