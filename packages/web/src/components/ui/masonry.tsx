"use client"

/**
 * Masonry —— 通用瀑布流公共组件
 *
 * 能力：
 *  1. 自定义容器（className/style/renderContainer）+ 自定义 item 内容（renderItem）
 *  2. 容器设置列数（数字 / 响应式断点）；item 通过 getMeta 设置跨列(colSpan)、跨行(rowSpan)
 *  3. item 自定义宽高比 aspect（"1:1" / "9:16" / "16:9" ...）或显式 height
 *  4. 容器设置 gap 间距
 *  5. 滚动加载更多（hasMore/onLoadMore）；item 懒加载（lazy，进入视窗才渲染内容）
 *  6. 出/入场动画（framer-motion，支持 stagger）
 *  7. 容器按 item 自定义属性排序（sortBy，可多字段）
 *
 * 高度优先级：height > aspect > rowSpan × rowHeight
 */

import * as React from "react"
import { AnimatePresence, motion, type Transition } from "framer-motion"

import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ types */

/** 响应式列数：数字 或 Tailwind 断点映射（移动优先 base -> xl） */
export type MasonryColumns =
  | number
  | Partial<Record<"base" | "sm" | "md" | "lg" | "xl", number>>

/** 单个 item 的布局元信息 */
export interface MasonryItemMeta {
  /** 占用列数，默认 1 */
  colSpan?: number
  /** 占用行数（基准行高 rowHeight），默认 1；被 aspect/height 覆盖 */
  rowSpan?: number
  /** 宽高比，如 "16:9" / "9:16" / "1:1" */
  aspect?: string
  /** 显式高度（px），优先级最高 */
  height?: number
  /** 进入视窗才渲染内容（懒加载），默认 false */
  lazy?: boolean
}

export interface MasonrySortOption<T> {
  /** 取排序值，访问 item 自定义属性 */
  by: (item: T) => string | number | undefined
  /** 升序 / 降序，默认 asc */
  order?: "asc" | "desc"
}

export interface MasonryProps<T> {
  /** 数据数组 */
  data: T[]
  /** 渲染 item 内容 */
  renderItem: (item: T, index: number) => React.ReactNode
  /** 稳定 key 提取（推荐用 id，排序/动画依赖它） */
  getKey?: (item: T, index: number) => string | number
  /** 提取 item 布局元信息 */
  getMeta?: (item: T, index: number) => MasonryItemMeta | undefined

  /** 列数，默认 3 */
  columns?: MasonryColumns
  /** item 间距 px，默认 16 */
  gap?: number
  /** 基准行高 px，默认 80 */
  rowHeight?: number

  /** 容器 className */
  className?: string
  /** 容器 style */
  style?: React.CSSProperties

  /** 排序（单字段或多字段） */
  sortBy?: MasonrySortOption<T> | MasonrySortOption<T>[]

  /** 入场动画；true 用默认，或自定义 from/duration */
  enterAnimation?: boolean | { from?: Record<string, number>; duration?: number }
  /** 出场动画 */
  exitAnimation?: boolean | { duration?: number }
  /** 每个 item 入场延迟（stagger），默认 0.05s */
  staggerDelay?: number
  /** 排序/列数变化时是否平滑过渡位置（layout 动画），默认 true */
  layoutTransition?: boolean

  /** 是否还有更多 */
  hasMore?: boolean
  /** 是否加载中（防止重复触发） */
  loading?: boolean
  /** 加载更多回调 */
  onLoadMore?: () => void
  /** 距底部多少 px 触发，默认 240 */
  loadMoreThreshold?: number
  /** 自定义滚动容器；不传则监听 window 滚动 */
  scrollContainerRef?: React.RefObject<HTMLElement | null>
  /** 加载占位节点 */
  loader?: React.ReactNode

  /** 懒加载触发的 rootMargin，默认 "300px" */
  lazyRootMargin?: string
}

/* --------------------------------------------------------------- helpers */

/** 宽高比字符串 -> height/width 比例 */
function aspectToRatio(aspect?: string): number | null {
  if (!aspect) return null
  const parts = aspect.split(/[:xX]/).map((n) => Number(n))
  if (parts.length !== 2 || parts.some((v) => !isFinite(v) || v <= 0)) return null
  const [w, h] = parts
  return h / w
}

const TAILWIND_BP = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const

/** 按容器宽度解析列数（移动优先） */
function resolveColumns(width: number, cols: MasonryColumns): number {
  if (typeof cols === "number") return Math.max(1, Math.floor(cols))
  const w = width
  if (w >= TAILWIND_BP.xl && cols.xl) return cols.xl
  if (w >= TAILWIND_BP.lg && cols.lg) return cols.lg
  if (w >= TAILWIND_BP.md && cols.md) return cols.md
  if (w >= TAILWIND_BP.sm && cols.sm) return cols.sm
  return cols.base ?? 1
}

interface PlacedItem<T> {
  key: string | number
  item: T
  index: number
  left: number
  top: number
  width: number
  height: number
  lazy: boolean
}

/** 贪心布局：每个 item 放到连续 colSpan 列中"当前最矮"的位置 */
function layout<T>(
  data: T[],
  columns: number,
  colWidth: number,
  gap: number,
  rowHeight: number,
  getMeta: ((item: T, i: number) => MasonryItemMeta | undefined) | undefined,
  getKey: (item: T, i: number) => string | number
): { items: PlacedItem<T>[]; totalHeight: number } {
  const items: PlacedItem<T>[] = []
  if (columns <= 0 || colWidth <= 0) return { items, totalHeight: 0 }

  // bottoms[k] = 第 k 列"下一个可用 top"（已含上方 gap）
  const bottoms = new Array(columns).fill(0)

  data.forEach((item, index) => {
    const meta = getMeta?.(item, index) ?? {}
    const cs = Math.min(Math.max(Math.floor(meta.colSpan ?? 1), 1), columns)

    // 在 [0, columns-cs] 内找 max(bottoms) 最小的起始列
    let bestStart = 0
    let minTop = Infinity
    for (let s = 0; s <= columns - cs; s++) {
      let top = 0
      for (let k = s; k < s + cs; k++) top = Math.max(top, bottoms[k])
      if (top < minTop) {
        minTop = top
        bestStart = s
      }
    }
    const top = minTop

    const width = cs * colWidth + (cs - 1) * gap
    let height: number
    if (typeof meta.height === "number") {
      height = meta.height
    } else {
      const ratio = aspectToRatio(meta.aspect)
      height = ratio != null ? width * ratio : (meta.rowSpan ?? 1) * rowHeight
    }

    for (let k = bestStart; k < bestStart + cs; k++) {
      bottoms[k] = top + height + gap
    }

    items.push({
      key: getKey(item, index),
      item,
      index,
      left: bestStart * (colWidth + gap),
      top,
      width,
      height,
      lazy: !!meta.lazy,
    })
  })

  const totalHeight = Math.max(0, Math.max(...bottoms, 0) - gap)
  return { items, totalHeight }
}

/* ----------------------------------------------------------------- hooks */

function useResizeWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

function useInView(rootMargin: string) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          ob.disconnect() // once: 出现即加载并常驻
        }
      },
      { rootMargin }
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [rootMargin])
  return { ref, inView }
}

/* --------------------------------------------------------------- LazyCell */

function LazyCell({
  lazy,
  rootMargin,
  children
}: {
  lazy: boolean
  rootMargin: string
  children: React.ReactNode
}) {
  // hook 必须无条件调用：lazy=false 时忽略 inView、直接渲染
  const { ref, inView } = useInView(rootMargin)
  return (
    <div ref={ref} className="h-full w-full">
      {!lazy || inView ? children : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Masonry */

export function Masonry<T>(props: MasonryProps<T>) {
  const {
    data,
    renderItem,
    getKey,
    getMeta,
    columns = 3,
    gap = 16,
    rowHeight = 80,
    className,
    style,
    sortBy,
    enterAnimation = true,
    exitAnimation = true,
    staggerDelay = 0.05,
    layoutTransition = true,
    hasMore = false,
    loading = false,
    onLoadMore,
    loadMoreThreshold = 240,
    scrollContainerRef,
    loader,
    lazyRootMargin = "300px"
  } = props

  const { ref: containerRef, width } = useResizeWidth<HTMLDivElement>()

  const keyExtractor = React.useCallback<MasonryProps<T>["getKey"]>(
    (item, index) =>
      getKey ? getKey(item, index) : (item as any)?.id ?? index,
    [getKey]
  )

  // 1. 排序（不修改原数组）
  const sorted = React.useMemo(() => {
    if (!sortBy) return data
    const opts = Array.isArray(sortBy) ? sortBy : [sortBy]
    if (opts.length === 0) return data
    const arr = [...data]
    arr.sort((a, b) => {
      for (const o of opts) {
        const va = o.by(a)
        const vb = o.by(b)
        if (va === vb) continue
        const dir = o.order === "desc" ? -1 : 1
        // undefined 排到末尾
        if (va == null) return 1
        if (vb == null) return -1
        if (va < vb) return -1 * dir
        if (va > vb) return 1 * dir
      }
      return 0
    })
    return arr
  }, [data, sortBy])

  // 2. 列数
  const colCount = resolveColumns(width, columns)
  const colWidth = width > 0 ? (width - (colCount - 1) * gap) / colCount : 0

  // 3. 布局
  const { items: placed, totalHeight } = React.useMemo(
    () =>
      layout(sorted, colCount, colWidth, gap, rowHeight, getMeta, keyExtractor),
    [sorted, colCount, colWidth, gap, rowHeight, getMeta, keyExtractor]
  )

  // 4. 动画配置
  const enterOpt = typeof enterAnimation === "object" ? enterAnimation : {}
  const enterEnabled = enterAnimation !== false
  const exitOpt = typeof exitAnimation === "object" ? exitAnimation : {}
  const exitEnabled = exitAnimation !== false

  const enterFrom = {
    opacity: 0,
    y: 24,
    scale: 0.96,
    ...(enterOpt.from ?? {})
  }
  const enterTransition: Transition = {
    duration: enterOpt.duration ?? 0.4,
    delay: staggerDelay,
    ease: "easeOut"
  }
  const exitTransition: Transition = {
    duration: exitOpt.duration ?? 0.25,
    ease: "easeIn"
  }

  // 5. 滚动加载更多
  React.useEffect(() => {
    if (!hasMore || !onLoadMore) return
    const target: Element | Window =
      scrollContainerRef?.current ?? window

    const onScroll = () => {
      let remaining: number
      if (target instanceof Window) {
        remaining =
          document.documentElement.scrollHeight -
          window.scrollY -
          window.innerHeight
      } else {
        remaining =
          target.scrollHeight - target.scrollTop - target.clientHeight
      }
      if (remaining <= loadMoreThreshold && !loading) onLoadMore()
    }

    target.addEventListener("scroll", onScroll, { passive: true })
    onScroll() // 首屏不足一屏时也触发一次
    return () => target.removeEventListener("scroll", onScroll)
  }, [hasMore, loading, onLoadMore, loadMoreThreshold, scrollContainerRef])

  return (
    <>
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={{ height: totalHeight, ...style }}
    >
      <AnimatePresence>
        {placed.map((p, i) => (
          <motion.div
            key={p.key}
            layout={layoutTransition}
            initial={enterEnabled ? enterFrom : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              exitEnabled
                ? { opacity: 0, y: -20, scale: 0.96, transition: exitTransition }
                : { opacity: 0 }
            }
            transition={
              i < colCount
                ? { ...enterTransition, delay: i * staggerDelay }
                : enterTransition
            }
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              width: p.width,
              height: p.height
            }}
          >
            <LazyCell lazy={p.lazy} rootMargin={lazyRootMargin}>
              {renderItem(p.item, p.index)}
            </LazyCell>
          </motion.div>
        ))}
      </AnimatePresence>

    </div>

    {loading && (
      <div className="flex w-full justify-center py-4">
        {loader ?? <DefaultLoader />}
      </div>
    )}
    </>
  )
}

function DefaultLoader() {
  return (
    <div className="flex items-center gap-2 rounded-full bg-muted/80 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      加载中...
    </div>
  )
}

export default Masonry
