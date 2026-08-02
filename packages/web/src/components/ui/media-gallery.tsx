'use client'

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef } from 'react'
import lightGallery from 'lightgallery'
import lgZoom from 'lightgallery/plugins/zoom'
import lgVideo from 'lightgallery/plugins/video'
import lgThumbnail from 'lightgallery/plugins/thumbnail'

import 'lightgallery/css/lightgallery.css'
import 'lightgallery/css/lg-zoom.css'
import 'lightgallery/css/lg-video.css'
import 'lightgallery/css/lg-thumbnail.css'

import { Button } from '@/components/ui/button'

type LgInstance = ReturnType<typeof lightGallery>

export type MediaItem = {
  src: string
  thumb?: string
  type?: 'image' | 'audio' | 'video'
  alt?: string
  // 下载时使用的文件名（不含扩展名时按 src 推断）。lightGallery 的 download 按钮据此命名下载文件。
  fileName?: string
}

/**
 * 全屏预览弹窗右上角自定义按钮。
 * actions 缺省（undefined / 空数组）时不注入任何按钮，行为与历史调用完全一致（向下兼容）。
 * 点击时回调收到当前可见图的 { item, index }（lgAfterSlide 切换后自动更新当前 index）。
 */
export type MediaGalleryAction = {
  label: string
  onClick: (info: { item: MediaItem; index: number }) => void
  icon?: React.ReactNode
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'glass'
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
    // 有 fileName 时映射到 lightGallery 的 download 字段，下载按钮据此命名。
    const el: Record<string, unknown> = { src: item.src, thumb: item.thumb || item.src, subHtml, subHtmlUrl }
    if (item.fileName) {
      el.download = item.fileName
    }
    return el
  }) as Array<Record<string, unknown>>
}

/* ----------------------------------------------------- actions 注入辅助 */
// lightGallery 2.x 全屏弹窗的根容器 class；toolbar 是其子元素，close 按钮约 44px 宽在最右。
const LG_ROOT_SELECTOR = '.lg-container'

/**
 * 把自定义按钮注入到全屏预览弹窗的 .lg-toolbar（排在 close 按钮左侧）。
 * 用 createRoot 渲染（支持 icon + variant）；防重复注入；返回 cleanup。
 * 调用方需传入 currentIndexRef，lgAfterSlide 时更新它，使 action 始终作用于当前可见图。
 */
function attachActions(
  items: MediaItem[],
  actions: MediaGalleryAction[],
  currentIndexRef: React.MutableRefObject<number>,
): () => void {
  if (!Array.isArray(actions) || actions.length === 0) return () => {}

  const gallery = document.querySelector(LG_ROOT_SELECTOR) as HTMLElement | null
  if (!gallery || gallery.dataset.asActionsInjected === '1') return () => {}

  const toolbar = gallery.querySelector<HTMLElement>('.lg-toolbar')
  if (!toolbar) return () => {}

  gallery.dataset.asActionsInjected = '1'

  const host = document.createElement('div')
  host.className = 'as-media-gallery-actions'
  // 绝对定位排在 close 按钮左侧；用 inline style，不依赖项目 Tailwind 作用域（弹窗在 body 下）。
  Object.assign(host.style, {
    position: 'absolute',
    right: '48px', // 留出 close 按钮宽度
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    zIndex: '10',
  } as React.CSSProperties)
  toolbar.appendChild(host)

  const root = createRoot(host)
  root.render(
    <>
      {actions.map((action, i) => (
        <Button
          key={i}
          variant={action.variant || 'glass'}
          size="sm"
          onClick={() => {
            const idx = currentIndexRef.current
            const item = items[idx]
            if (item) action.onClick({ item, index: idx })
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </Button>
      ))}
    </>,
  )

  return () => {
    try { root.unmount() } catch { /* noop */ }
    if (host.parentNode) host.parentNode.removeChild(host)
    if (gallery) delete gallery.dataset.asActionsInjected
  }
}

export function MediaGallery({
  items,
  className,
  actions,
  startIndex = 0,
}: {
  items: MediaItem[]
  className?: string
  actions?: MediaGalleryAction[]
  startIndex?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lgRef = useRef<LgInstance | null>(null)
  const indexRef = useRef<number>(startIndex)
  const actionsCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!containerRef.current || items.length === 0) return

    lgRef.current = lightGallery(containerRef.current, {
      plugins: [lgZoom, lgVideo, lgThumbnail],
      speed: 300,
      licenseKey: '0000-0000-0000-0000',
      download: true,
      dynamic: true,
      index: startIndex,
      dynamicEl: buildDynamicEl(items),
    })

    const hasActions = Array.isArray(actions) && actions.length > 0
    if (hasActions) {
      // lgBeforeOpen 触发时弹窗 DOM 已构建，注入按钮；lgAfterSlide 兜底补注入并同步当前 index。
      lgRef.current.on('lgBeforeOpen', () => {
        actionsCleanupRef.current = attachActions(items, actions!, indexRef)
      })
      lgRef.current.on('lgAfterSlide', (e: { index?: number }) => {
        if (typeof e?.index === 'number') indexRef.current = e.index
        if (!actionsCleanupRef.current) {
          actionsCleanupRef.current = attachActions(items, actions!, indexRef)
        }
      })
    }

    return () => {
      actionsCleanupRef.current?.()
      actionsCleanupRef.current = null
      lgRef.current?.destroy()
      lgRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  if (items.length === 0) return null

  return (
    <div ref={containerRef} className={className} />
  )
}

export function openMediaGallery(
  items: MediaItem[],
  startIndex = 0,
  actions?: MediaGalleryAction[],
) {
  const el = document.createElement('div')
  document.body.appendChild(el)

  const indexRef: React.MutableRefObject<number> = { current: startIndex }
  let actionsCleanup: (() => void) | null = null

  const instance = lightGallery(el, {
    plugins: [lgZoom, lgVideo, lgThumbnail],
    speed: 300,
    licenseKey: '0000-0000-0000-0000',
    download: true,
    dynamic: true,
    index: startIndex,
    dynamicEl: buildDynamicEl(items),
    closable: true,
  })

  const hasActions = Array.isArray(actions) && actions.length > 0
  if (hasActions) {
    instance.on('lgBeforeOpen', () => {
      actionsCleanup = attachActions(items, actions!, indexRef)
    })
    instance.on('lgAfterSlide', (e: { index?: number }) => {
      if (typeof e?.index === 'number') indexRef.current = e.index
      if (!actionsCleanup) actionsCleanup = attachActions(items, actions!, indexRef)
    })
  }

  el.addEventListener('lgAfterClose', () => {
    actionsCleanup?.()
    actionsCleanup = null
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
