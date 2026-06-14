'use client';

import { Play } from 'lucide-react';
import { openMediaGallery, type MediaItem } from '@/components/ui/media-gallery';
import { type DisplayNodeViewProps, galleryItems, EmptyDisplay } from './utils';

export function GalleryPreviewView({ data }: DisplayNodeViewProps) {
  const items = galleryItems(data);
  const mediaItems: MediaItem[] = items.map(item => ({
    src: item.src,
    thumb: item.thumb,
    type: item.type,
    alt: item.caption || item.src,
  }));

  if (items.length === 0) {
    return <EmptyDisplay icon={<Play className="h-5 w-5" />} text="暂无资源" />;
  }

  return (
    <div className="nodrag nopan grid h-full w-full grid-cols-3 gap-1 overflow-hidden rounded-lg bg-background p-1">
      {items.slice(0, 6).map((item, index) => {
        const last = index === 5 && items.length > 6;
        return (
          <button
            key={item.id || `${item.src}-${index}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openMediaGallery(mediaItems, index);
            }}
            className="relative aspect-square overflow-hidden rounded border border-border bg-muted transition-opacity hover:opacity-80"
            title={item.caption || item.src}
          >
            {item.type === 'video' ? (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Play className="h-5 w-5" />
              </span>
            ) : (
              <img
                src={item.thumb || item.src}
                alt={item.caption || ''}
                className="h-full w-full object-cover"
              />
            )}
            {last ? (
              <span className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs font-medium">
                +{items.length - 6}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
