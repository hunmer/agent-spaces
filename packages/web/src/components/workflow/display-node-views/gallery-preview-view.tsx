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

  const visible = items.slice(0, 6);
  const cols = Math.min(items.length, 3);
  const rows = Math.ceil(visible.length / cols);

  return (
    <div
      className="nodrag nopan grid h-full w-full gap-1 overflow-hidden rounded-lg bg-background p-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {visible.map((item, index) => {
        const last = index === visible.length - 1 && items.length > visible.length;
        const imgSrc = item.thumb || item.src;
        const isBase64 = imgSrc.startsWith('data:');
        const alt = isBase64 ? '' : (item.caption || imgSrc);
        return (
          <button
            key={item.id || `${item.src}-${index}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openMediaGallery(mediaItems, index);
            }}
            className="relative min-h-0 min-w-0 overflow-hidden rounded border border-border bg-muted transition-opacity hover:opacity-80"
            title={item.caption || ''}
          >
            {item.type === 'video' ? (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Play className="h-5 w-5" />
              </span>
            ) : (
              <img
                src={imgSrc}
                alt={alt}
                draggable={false}
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
