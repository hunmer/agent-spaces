'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommandPalette } from '@/stores/command-palette';
import { Terminal } from 'lucide-react';

const SIZE = 44;
const SNAP_THRESHOLD = 60;
const MINIMIZE_DELAY = 2000;
const UNHOVER_DELAY = 2000;
const HALF_SIZE = SIZE / 2;
const LS_KEY = "console-panel:pos";

interface SavedPos { x: number; y: number }

function loadPos(): SavedPos | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePos(pos: SavedPos) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(pos)); } catch {}
}

export function ConsolePanel() {
  const toggle = useCommandPalette((s) => s.toggle);
  const open = useCommandPalette((s) => s.open);
  const posRef = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const [snapping, setSnapping] = useState(false);
  const minimizeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unhoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const edgeRef = useRef<'left' | 'right'>('right');
  const [hovered, setHovered] = useState(false);
  const snappedEdge = useRef<'left' | 'right' | null>(null);

  useEffect(() => {
    const saved = loadPos();
    const fallback = { x: window.innerWidth - SIZE - 20, y: window.innerHeight - SIZE - 28 };
    const initial = saved
      ? { x: Math.min(saved.x, window.innerWidth - SIZE), y: Math.min(saved.y, window.innerHeight - SIZE) }
      : fallback;
    posRef.current = initial;
    setPos(initial);
    setMounted(true);
  }, []);

  const doMinimize = useCallback((edge: 'left' | 'right') => {
    setMinimized(true);
    posRef.current = { x: edge === 'left' ? -HALF_SIZE : window.innerWidth - HALF_SIZE, y: posRef.current.y };
    setPos(posRef.current);
  }, []);

  const cancelMinimize = useCallback(() => {
    if (minimizeTimer.current) {
      clearTimeout(minimizeTimer.current);
      minimizeTimer.current = undefined;
    }
    if (unhoverTimer.current) {
      clearTimeout(unhoverTimer.current);
      unhoverTimer.current = undefined;
    }
  }, []);

  const restoreFromMinimize = useCallback(() => {
    cancelMinimize();
    setMinimized(false);
    const w = window.innerWidth;
    const isLeft = posRef.current.x < w / 2;
    const restored = { x: isLeft ? 12 : w - SIZE - 12, y: posRef.current.y };
    posRef.current = restored;
    setPos(restored);
    savePos(restored);
  }, [cancelMinimize]);

  const onHoverIn = useCallback(() => {
    setHovered(true);
    if (minimized) restoreFromMinimize();
    if (unhoverTimer.current) {
      clearTimeout(unhoverTimer.current);
      unhoverTimer.current = undefined;
    }
  }, [minimized, restoreFromMinimize]);

  const onHoverOut = useCallback(() => {
    setHovered(false);
    if (snappedEdge.current) {
      unhoverTimer.current = setTimeout(() => doMinimize(edgeRef.current), UNHOVER_DELAY);
    }
  }, [doMinimize]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    moved.current = false;
    setSnapping(false);
    snappedEdge.current = null;
    cancelMinimize();
    if (minimized) restoreFromMinimize();
    offset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [cancelMinimize, minimized, restoreFromMinimize]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    moved.current = true;
    const nx = Math.max(0, Math.min(window.innerWidth - SIZE, e.clientX - offset.current.x));
    const ny = Math.max(0, Math.min(window.innerHeight - SIZE, e.clientY - offset.current.y));
    posRef.current = { x: nx, y: ny };
    setPos({ x: nx, y: ny });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    const { x, y } = posRef.current;
    const w = window.innerWidth;
    const nearLeft = x < SNAP_THRESHOLD;
    const nearRight = x > w - SIZE - SNAP_THRESHOLD;
    const clampedY = Math.max(12, Math.min(window.innerHeight - SIZE - 12, y));

    if (nearLeft || nearRight) {
      const edge: 'left' | 'right' = nearLeft ? 'left' : 'right';
      edgeRef.current = edge;
      snappedEdge.current = edge;
      const snappedX = nearLeft ? 12 : w - SIZE - 12;
      const snapped = { x: snappedX, y: clampedY };
      posRef.current = snapped;
      setSnapping(true);
      setPos(snapped);
      savePos(snapped);
      minimizeTimer.current = setTimeout(() => doMinimize(edge), MINIMIZE_DELAY);
    } else {
      snappedEdge.current = null;
      posRef.current = { x, y: clampedY };
      setPos(posRef.current);
      savePos({ x, y: clampedY });
    }

    if (!moved.current) {
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener('click', swallow, true);
      };
      document.addEventListener('click', swallow, true);
      toggle();
    }
  }, [toggle, doMinimize]);

  // Keep position within viewport on resize
  useEffect(() => {
    const onResize = () => {
      cancelMinimize();
      const w = window.innerWidth;
      if (minimized) {
        const isLeft = posRef.current.x < w / 2;
        posRef.current = { x: isLeft ? -HALF_SIZE : w - HALF_SIZE, y: Math.min(posRef.current.y, window.innerHeight - SIZE - 12) };
      } else {
        posRef.current = { x: Math.min(posRef.current.x, w - SIZE - 12), y: Math.min(posRef.current.y, window.innerHeight - SIZE - 12) };
      }
      setPos(posRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [cancelMinimize, minimized]);

  useEffect(() => cancelMinimize, [cancelMinimize]);

  if (open || !mounted) return null;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        background: '#3b82f6',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
        zIndex: 99999,
        touchAction: 'none',
        userSelect: 'none',
        overflow: 'hidden',
        transition: dragging.current
          ? 'none'
          : 'left 0.3s ease-out, top 0.3s ease-out, box-shadow 0.2s',
      }}
    >
      <Terminal size={18} />
    </div>
  );
}
