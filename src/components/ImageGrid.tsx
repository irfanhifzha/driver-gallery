import type { DriveImage } from '../lib/drive'
import { ImageCard } from './ImageCard'

type ImageGridProps = {
  images: DriveImage[]
  onOpen: (index: number) => void
}

export function ImageGrid({ images, onOpen }: ImageGridProps) {
  return (
    <ul className="grid">
      {images.map((image, index) => (
        <ImageCard
          key={image.id}
          image={image}
          index={index}
          onOpen={onOpen}
        />
      ))}
    </ul>
  )
}
