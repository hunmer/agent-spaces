'use client';

import { Play } from 'lucide-react';
import { openMediaGallery, type MediaItem } from '@/components/ui/media-gallery';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import { type DisplayNodeViewProps, galleryItems, EmptyDisplay } from './utils';

export function GalleryPreviewView({ data }: DisplayNodeViewProps) {
  const items = galleryItems(data);
  const useCarousel = data.carousel === true;
  const mediaItems: MediaItem[] = items.map(item => ({
    src: item.src,
    thumb: item.thumb,
    type: item.type,
    alt: item.caption || item.src,
  }));

  if (items.length === 0) {
    return <EmptyDisplay icon={<Play className="h-5 w-5" />} text="暂无资源" />;
  }

  const renderItem = (item: typeof items[number], index: number, isLast = false) => {
    const imgSrc = item.thumb || item.src;
    const isBase64 = imgSrc.startsWith('data:');
    const alt = isBase64 ? '' : (item.caption || imgSrc);
    return (
      <button
        key={item.id || `${item.src}-${index}`}
        type="button"
        onDoubleClick={(e) => {
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
        {isLast ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs font-medium">
            +{items.length - 6}
          </span>
        ) : null}
      </button>
    );
  };

  if (useCarousel) {
    return (
      <div className="nodrag nopan relative flex h-full w-full items-center">
        <Carousel className="w-full" opts={{ loop: true }}>
          <CarouselContent>
            {items.map((item, index) => (
              <CarouselItem key={item.id || `${item.src}-${index}`} className="pl-2">
                <div className="h-full w-full">{renderItem(item, index)}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="-left-3 top-1/2 -translate-y-1/2" />
          <CarouselNext className="-right-3 top-1/2 -translate-y-1/2" />
        </Carousel>
      </div>
    );
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
        return renderItem(item, index, last);
      })}
    </div>
  );
}
