"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X, Minimize2 } from "lucide-react";

interface FloatingPanelProps {
  id: string;
  title: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
  onClose: () => void;
  onMinimize?: () => void;
  children: ReactNode;
  className?: string;
  zIndex?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Corner = "nw" | "ne" | "sw" | "se";

const LS_PREFIX = "floating-panel:";
const DEFAULT_MIN_W = 280;
const DEFAULT_MIN_H = 200;

function loadRect(id: string, fallback: Rect): Rect {
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    if (raw) {
      const r = JSON.parse(raw) as Rect;
      if (r.w > 0 && r.h > 0) return r;
    }
  } catch {}
  return fallback;
}

function saveRect(id: string, rect: Rect) {
  try {
    localStorage.setItem(LS_PREFIX + id, JSON.stringify(rect));
  } catch {}
}

export function FloatingPanel({
  id,
  title,
  defaultWidth,
  defaultHeight,
  minWidth = DEFAULT_MIN_W,
  minHeight = DEFAULT_MIN_H,
  onClose,
  onMinimize,
  children,
  className,
  zIndex = 99991,
}: FloatingPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const dragMoved = useRef(false);
  const rectRef = useRef<Rect>({
    x: Math.max(20, (typeof window !== "undefined" ? window.innerWidth : 1200) - defaultWidth) / 2,
    y: Math.max(40, (typeof window !== "undefined" ? window.innerHeight : 800) - defaultHeight) / 2,
    w: defaultWidth,
    h: defaultHeight,
  });
  const [rect, setRect] = useState<Rect>(() => {
    const fallback: Rect = {
      x: Math.max(20, (window.innerWidth - defaultWidth) / 2),
      y: Math.max(40, (window.innerHeight - defaultHeight) / 2),
      w: defaultWidth,
      h: defaultHeight,
    };
    const loaded = loadRect(id, fallback);
    rectRef.current = loaded;
    return loaded;
  });

  const dragStart = useRef<{ mx: number; my: number; r: Rect } | null>(null);
  const resizeStart = useRef<{ corner: Corner; mx: number; my: number; r: Rect } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Clamp on resize
  useEffect(() => {
    const handle = () => {
      const prev = rectRef.current;
      const next: Rect = {
        x: Math.max(0, Math.min(prev.x, window.innerWidth - prev.w)),
        y: Math.max(0, Math.min(prev.y, window.innerHeight - prev.h)),
        w: Math.min(prev.w, window.innerWidth - 20),
        h: Math.min(prev.h, window.innerHeight - 20),
      };
      rectRef.current = next;
      setRect(next);
      saveRect(id, next);
    };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [id]);

  // Global move/up
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragStart.current) {
        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;

        const { mx, my, r } = dragStart.current;
        const next: Rect = {
          ...r,
          x: Math.max(0, Math.min(r.x + e.clientX - mx, window.innerWidth - r.w)),
          y: Math.max(0, Math.min(r.y + e.clientY - my, window.innerHeight - r.h)),
        };
        rectRef.current = next;
        setRect(next);
        return;
      }
      if (resizeStart.current) {
        const { corner, mx, my, r } = resizeStart.current;
        const dx = e.clientX - mx;
        const dy = e.clientY - my;

        let { x, y, w, h } = r;

        if (corner.includes("e")) {
          w = Math.max(minWidth, r.w + dx);
        } else {
          const nw = Math.max(minWidth, r.w - dx);
          x = r.x + (r.w - nw);
          w = nw;
        }

        if (corner.includes("s")) {
          h = Math.max(minHeight, r.h + dy);
        } else {
          const nh = Math.max(minHeight, r.h - dy);
          y = r.y + (r.h - nh);
          h = nh;
        }

        const next: Rect = { x: Math.max(0, x), y: Math.max(0, y), w, h };
        rectRef.current = next;
        setRect(next);
      }
    };

    const onUp = () => {
      if (dragStart.current) {
        if (!dragMoved.current) {
          setCollapsed((c) => !c);
        } else {
          saveRect(id, rectRef.current);
        }
      }
      if (resizeStart.current) {
        saveRect(id, rectRef.current);
      }
      dragStart.current = null;
      resizeStart.current = null;
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [id, minWidth, minHeight]);

  const onDragDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragMoved.current = false;
      dragStart.current = { mx: e.clientX, my: e.clientY, r: { ...rectRef.current } };
    },
    [],
  );

  const onResizeDown = useCallback(
    (corner: Corner) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStart.current = { corner, mx: e.clientX, my: e.clientY, r: { ...rectRef.current } };
    },
    [],
  );

  if (!mounted) return null;

  const positions: Record<Corner, React.CSSProperties> = {
    nw: { top: -4, left: -4, cursor: "nwse-resize" },
    ne: { top: -4, right: -4, cursor: "nesw-resize" },
    sw: { bottom: -4, left: -4, cursor: "nesw-resize" },
    se: { bottom: -4, right: -4, cursor: "nwse-resize" },
  };

  return (
    <div
      className={`fixed flex flex-col bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-2xl overflow-hidden ${
        className ?? ""
      }`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: collapsed ? undefined : rect.h, zIndex }}
    >
      {/* Title bar */}
      <div
        onPointerDown={onDragDown}
        className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 cursor-move select-none shrink-0"
        style={{ touchAction: "none" }}
      >
        <span className="text-sm font-medium truncate text-gray-700 dark:text-gray-300">{title}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {onMinimize && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onMinimize}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-gray-500 dark:text-gray-400"
              title="最小化为悬浮球"
            >
              <Minimize2 size={13} />
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-gray-500 dark:text-gray-400"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && <div className="flex-1 overflow-hidden">{children}</div>}

      {/* Corner resize handles */}
      {!collapsed &&
        (["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
          <div
            key={c}
            onPointerDown={onResizeDown(c)}
            className="absolute"
            style={{
              ...positions[c],
              width: 14,
              height: 14,
              touchAction: "none",
              zIndex: 10,
            }}
          />
        ))}
    </div>
  );
}
