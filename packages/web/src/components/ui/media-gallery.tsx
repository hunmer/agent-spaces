'use client'

import { useEffect, useRef } from 'react'
import lightGallery from 'lightgallery'
import lgZoom from 'lightgallery/plugins/zoom'
import lgVideo from 'lightgallery/plugins/video'
import lgThumbnail from 'lightgallery/plugins/thumbnail'

import 'lightgallery/css/lightgallery.css'
import 'lightgallery/css/lg-zoom.css'
import 'lightgallery/css/lg-video.css'
import 'lightgallery/css/lg-thumbnail.css'

type LgInstance = ReturnType<typeof lightGallery>

export type MediaItem = {
  src: string
  thumb?: string
  type?: 'image' | 'audio' | 'video'
  alt?: string
}

function buildDynamicEl(items: MediaItem[]) {
  return items.map(item => {
    const isBase64 = item.src.startsWith('data:')
    const subHtml = isBase64 ? '' : (item.alt || '')
    const subHtmlUrl = isBase64 ? '' : undefined
    if (item.type === 'video') {
      // HTML5 视频：只用 video 字段强制视频模式。若同时设 src，lightGallery 核心会把它当图片加载并发出 image/* 请求。
      return {
        thumb: item.thumb || '',
        subHtml,
        subHtmlUrl,
        video: {
          source: [{ src: item.src, type: 'video/mp4' }],
          attributes: { preload: false, playsinline: true, controls: true },
        },
      }
    }
    return { src: item.src, thumb: item.thumb || item.src, subHtml, subHtmlUrl }
  }) as Array<Record<string, unknown>>
}

export function MediaGallery({ items, className }: { items: MediaItem[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lgRef = useRef<LgInstance | null>(null)

  useEffect(() => {
    if (!containerRef.current || items.length === 0) return

    lgRef.current = lightGallery(containerRef.current, {
      plugins: [lgZoom, lgVideo, lgThumbnail],
      speed: 300,
      licenseKey: '0000-0000-0000-0000',
      download: false,
      dynamic: true,
      dynamicEl: buildDynamicEl(items),
    })

    return () => {
      lgRef.current?.destroy()
      lgRef.current = null
    }
  }, [items])

  if (items.length === 0) return null

  return (
    <div ref={containerRef} className={className} />
  )
}

export function openMediaGallery(items: MediaItem[], startIndex = 0) {
  const el = document.createElement('div')
  document.body.appendChild(el)

  const instance = lightGallery(el, {
    plugins: [lgZoom, lgVideo, lgThumbnail],
    speed: 300,
    licenseKey: '0000-0000-0000-0000',
    download: false,
    dynamic: true,
    index: startIndex,
    dynamicEl: buildDynamicEl(items),
    closable: true,
  })

  el.addEventListener('lgAfterClose', () => {
    instance.destroy()
    el.remove()
  })

  instance.openGallery(startIndex)
}

export function NodeMediaPreview({ items }: { items: MediaItem[] }) {
  if (items.length === 0) return null

  const handleClick = (index: number) => {
    openMediaGallery(items, index)
  }

  return (
    <div className="flex gap-1 p-1 overflow-x-auto nodrag nopan" style={{ maxWidth: 220 }}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className="shrink-0 rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
          onClick={(e) => { e.stopPropagation(); handleClick(i) }}
          title={item.alt || item.src}
        >
          {item.type === 'video' || item.type === 'audio' ? (
            <div className="w-10 h-10 flex items-center justify-center bg-muted text-muted-foreground">
              {item.type === 'video' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              )}
            </div>
          ) : (
            <img src={item.thumb || item.src} alt={item.alt || ''} className="w-10 h-10 object-cover" />
          )}
        </button>
      ))}
    </div>
  )
}
