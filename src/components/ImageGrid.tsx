import type { DriveImage } from '../lib/drive'
import type { FavoriteMap } from '../lib/favorites'
import { ImageCard } from './ImageCard'

type ImageGridProps = {
  images: DriveImage[]
  favorites: FavoriteMap
  onOpen: (index: number) => void
  onToggleFavorite: (image: DriveImage) => void
}

export function ImageGrid({
  images,
  favorites,
  onOpen,
  onToggleFavorite,
}: ImageGridProps) {
  return (
    <ul className="grid">
      {images.map((image, index) => (
        <ImageCard
          key={image.id}
          image={image}
          index={index}
          isFavorite={Boolean(favorites[image.id])}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </ul>
  )
}
