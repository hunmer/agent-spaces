'use client';

import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface FloatingBallProps {
  size?: number;
  lsKey: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  visible?: boolean;
  snapThreshold?: number;
  minimizeDelay?: number;
  unhoverDelay?: number;
  defaultPosition?: { x?: number; y?: number };
}

interface Pos { x: number; y: number }

function loadPos(key: string): Pos | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePos(key: string, pos: Pos) {
  try { localStorage.setItem(key, JSON.stringify(pos)); } catch {}
}

export const FloatingBall = forwardRef<HTMLDivElement, FloatingBallProps>(
  function FloatingBall({
    size = 44,
    lsKey,
    onClick,
    children,
    className,
    style,
    visible = true,
    snapThreshold = 60,
    minimizeDelay = 2000,
    unhoverDelay = 2000,
    defaultPosition,
  }, ref) {
    const posRef = useRef<Pos>({ x: 0, y: 0 });
    const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
    const [mounted, setMounted] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const dragging = useRef(false);
    const offset = useRef<Pos>({ x: 0, y: 0 });
    const moved = useRef(false);
    const minimizeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const unhoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const edgeRef = useRef<'left' | 'right'>('right');
    const snappedEdge = useRef<'left' | 'right' | null>(null);

    const halfSize = size / 2;

    useEffect(() => {
      const saved = loadPos(lsKey);
      const fallback: Pos = {
        x: defaultPosition?.x ?? window.innerWidth - size - 20,
        y: defaultPosition?.y ?? window.innerHeight - size - 28,
      };
      const initial = saved
        ? { x: Math.min(saved.x, window.innerWidth - size), y: Math.min(saved.y, window.innerHeight - size) }
        : fallback;
      posRef.current = initial;
      setPos(initial);
      setMounted(true);
    }, [lsKey, size, defaultPosition]);

    const doMinimize = useCallback((edge: 'left' | 'right') => {
      setMinimized(true);
      posRef.current = { x: edge === 'left' ? -halfSize : window.innerWidth - halfSize, y: posRef.current.y };
      setPos(posRef.current);
    }, [halfSize]);

    const cancelTimers = useCallback(() => {
      clearTimeout(minimizeTimer.current);
      minimizeTimer.current = undefined;
      clearTimeout(unhoverTimer.current);
      unhoverTimer.current = undefined;
    }, []);

    const restore = useCallback(() => {
      cancelTimers();
      setMinimized(false);
      const w = window.innerWidth;
      const isLeft = posRef.current.x < w / 2;
      const restored: Pos = { x: isLeft ? 12 : w - size - 12, y: posRef.current.y };
      posRef.current = restored;
      setPos(restored);
      savePos(lsKey, restored);
    }, [cancelTimers, size, lsKey]);

    const onHoverIn = useCallback(() => {
      if (minimized) restore();
      clearTimeout(unhoverTimer.current);
      unhoverTimer.current = undefined;
    }, [minimized, restore]);

    const onHoverOut = useCallback(() => {
      if (snappedEdge.current) {
        unhoverTimer.current = setTimeout(() => doMinimize(edgeRef.current), unhoverDelay);
      }
    }, [doMinimize, unhoverDelay]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      moved.current = false;
      snappedEdge.current = null;
      cancelTimers();
      if (minimized) restore();
      offset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [cancelTimers, minimized, restore]);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      moved.current = true;
      const nx = Math.max(0, Math.min(window.innerWidth - size, e.clientX - offset.current.x));
      const ny = Math.max(0, Math.min(window.innerHeight - size, e.clientY - offset.current.y));
      posRef.current = { x: nx, y: ny };
      setPos({ x: nx, y: ny });
    }, [size]);

    const onPointerUp = useCallback(() => {
      dragging.current = false;
      const { x, y } = posRef.current;
      const w = window.innerWidth;
      const nearLeft = x < snapThreshold;
      const nearRight = x > w - size - snapThreshold;
      const clampedY = Math.max(12, Math.min(window.innerHeight - size - 12, y));

      if (nearLeft || nearRight) {
        const edge: 'left' | 'right' = nearLeft ? 'left' : 'right';
        edgeRef.current = edge;
        snappedEdge.current = edge;
        const snapped: Pos = { x: nearLeft ? 12 : w - size - 12, y: clampedY };
        posRef.current = snapped;
        setPos(snapped);
        savePos(lsKey, snapped);
        minimizeTimer.current = setTimeout(() => doMinimize(edge), minimizeDelay);
      } else {
        snappedEdge.current = null;
        posRef.current = { x, y: clampedY };
        setPos(posRef.current);
        savePos(lsKey, { x, y: clampedY });
      }

      if (!moved.current && onClick) {
        const swallow = (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          document.removeEventListener('click', swallow, true);
        };
        document.addEventListener('click', swallow, true);
        onClick();
      }
    }, [onClick, doMinimize, size, snapThreshold, minimizeDelay, lsKey]);

    useEffect(() => {
      const onResize = () => {
        cancelTimers();
        const w = window.innerWidth;
        if (minimized) {
          const isLeft = posRef.current.x < w / 2;
          posRef.current = { x: isLeft ? -halfSize : w - halfSize, y: Math.min(posRef.current.y, window.innerHeight - size - 12) };
        } else {
          posRef.current = { x: Math.min(posRef.current.x, w - size - 12), y: Math.min(posRef.current.y, window.innerHeight - size - 12) };
        }
        setPos(posRef.current);
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [cancelTimers, minimized, halfSize, size]);

    useEffect(() => cancelTimers, [cancelTimers]);

    if (!visible || !mounted) return null;

    return (
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={onHoverIn}
        onMouseLeave={onHoverOut}
        className={className}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 99999,
          touchAction: 'none',
          userSelect: 'none',
          transition: dragging.current ? 'none' : 'left 0.3s ease-out, top 0.3s ease-out',
          ...style,
        }}
      >
        {children}
      </div>
    );
  },
);
