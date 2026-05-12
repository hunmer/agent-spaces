"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const BALL_SIZE = 44;
const BALL_SNAP_THRESHOLD = 40;
const BALL_HIDE_RATIO = 0.6;
const LS_PREFIX = "floating-panel:";

interface FloatingPanelProps {
  id: string;
  title?: string;
  visible?: boolean;
  defaultX?: number;
  defaultY?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  zIndex?: number;
  initialMinimized?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  children: React.ReactNode;
}

interface SavedState {
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  minimized: boolean;
  ballX: number;
  ballY: number;
}

function loadState(id: string): SavedState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(LS_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(id: string, state: SavedState) {
  if (!id || typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_PREFIX + id, JSON.stringify(state));
  } catch {}
}

export function FloatingPanel({
  id,
  title = "悬浮面板",
  visible = true,
  defaultX = 100,
  defaultY = 100,
  defaultWidth = 320,
  defaultHeight = 220,
  zIndex = 9999,
  initialMinimized = false,
  onVisibleChange,
  children,
}: FloatingPanelProps) {
  const [mounted, setMounted] = useState(false);

  const initRef = useRef<SavedState | null>(null);
  if (!initRef.current && typeof window !== "undefined") {
    initRef.current = loadState(id);
  }
  const saved = initRef.current;

  const [curX, setCurX] = useState(saved?.x ?? defaultX);
  const [curY, setCurY] = useState(saved?.y ?? defaultY);
  const [curW, setCurW] = useState(saved?.width ?? defaultWidth);
  const [curH, setCurH] = useState(saved?.height ?? defaultHeight);
  const [collapsed, setCollapsed] = useState(saved?.collapsed ?? false);
  const [minimized, setMinimized] = useState(saved?.minimized ?? initialMinimized);

  // 球初始位置：右上角
  const [ballX, setBallX] = useState(saved?.ballX ?? -1);
  const [ballY, setBallY] = useState(saved?.ballY ?? -1);
  const [ballSnapX, setBallSnapX] = useState(0);
  const [ballHidden, setBallHidden] = useState(false);
  const [ballSnapSide, setBallSnapSide] = useState<"left" | "right">("right");

  const savedPanelPos = useRef({ x: defaultX, y: defaultY });
  const ballDragging = useRef(false);
  const ballMoved = useRef(false);

  const stateRef = useRef({ curX, curY, curW, curH, collapsed, minimized, ballX, ballY });
  stateRef.current = { curX, curY, curW, curH, collapsed, minimized, ballX, ballY };

  useEffect(() => {
    setMounted(true);
  }, []);

  // init ball position
  useEffect(() => {
    if (!minimized) return;
    const vw = window.innerWidth;
    const bx = saved?.ballX ?? (vw - BALL_SIZE - 20);
    const by = saved?.ballY ?? 100;
    setBallX(bx);
    setBallY(by);

    const distLeft = bx;
    const distRight = vw - (bx + BALL_SIZE);
    if (distLeft <= BALL_SNAP_THRESHOLD) {
      setBallSnapX(-BALL_SIZE * BALL_HIDE_RATIO);
      setBallSnapSide("left");
      setBallHidden(true);
    } else if (distRight <= BALL_SNAP_THRESHOLD) {
      setBallSnapX(vw - BALL_SIZE * (1 - BALL_HIDE_RATIO));
      setBallSnapSide("right");
      setBallHidden(true);
    } else {
      setBallSnapX(bx);
      setBallHidden(false);
    }
    savedPanelPos.current = { x: curX, y: curY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist
  useEffect(() => {
    if (!mounted) return;
    const s = stateRef.current;
    saveState(id, {
      x: s.curX, y: s.curY,
      width: s.curW, height: s.curH,
      collapsed: s.collapsed, minimized: s.minimized,
      ballX: s.ballX, ballY: s.ballY,
    });
  }, [curX, curY, curW, curH, collapsed, minimized, ballX, ballY, id, mounted]);

  const snapBallToEdge = useCallback((x: number, y: number) => {
    const vw = window.innerWidth;
    const distLeft = x;
    const distRight = vw - (x + BALL_SIZE);
    if (distLeft <= BALL_SNAP_THRESHOLD) {
      setBallSnapX(-BALL_SIZE * BALL_HIDE_RATIO);
      setBallSnapSide("left");
      setBallHidden(true);
    } else if (distRight <= BALL_SNAP_THRESHOLD) {
      setBallSnapX(vw - BALL_SIZE * (1 - BALL_HIDE_RATIO));
      setBallSnapSide("right");
      setBallHidden(true);
    } else {
      setBallSnapX(x);
      setBallHidden(false);
    }
  }, []);

  const clampBallY = useCallback((y: number) => {
    return Math.max(0, Math.min(y, window.innerHeight - BALL_SIZE));
  }, []);

  const dragRef = useRef({ moving: false, resizing: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, startWidth: 0, startHeight: 0 });

  const startDrag = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    d.moving = true;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.startLeft = curX;
    d.startTop = curY;
    const onMove = (ev: MouseEvent) => {
      if (!d.moving) return;
      setCurX(d.startLeft + (ev.clientX - d.startX));
      setCurY(d.startTop + (ev.clientY - d.startY));
    };
    const onUp = () => { d.moving = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [curX, curY]);

  const startResize = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    d.resizing = true;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.startWidth = curW;
    d.startHeight = curH;
    const onMove = (ev: MouseEvent) => {
      if (!d.resizing) return;
      setCurW(Math.max(200, d.startWidth + (ev.clientX - d.startX)));
      setCurH(Math.max(120, d.startHeight + (ev.clientY - d.startY)));
    };
    const onUp = () => { d.resizing = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [curW, curH]);

  const minimize = useCallback(() => {
    savedPanelPos.current = { x: curX, y: curY };
    const bx = curX + curW - BALL_SIZE - 10;
    const by = curY + 10;
    setBallX(bx);
    setBallY(by);
    snapBallToEdge(bx, by);
    setMinimized(true);
  }, [curX, curY, curW, snapBallToEdge]);

  const restore = useCallback(() => {
    if (ballMoved.current) return;
    setMinimized(false);
    setCurX(savedPanelPos.current.x);
    setCurY(savedPanelPos.current.y);
  }, []);

  const startBallDrag = useCallback((e: React.MouseEvent) => {
    ballDragging.current = true;
    ballMoved.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = ballSnapX;
    const originY = ballY;
    const onMove = (ev: MouseEvent) => {
      const nx = originX + (ev.clientX - startX);
      const ny = clampBallY(originY + (ev.clientY - startY));
      setBallX(nx); setBallY(ny); setBallSnapX(nx); setBallHidden(false);
      ballMoved.current = true;
    };
    const onUp = () => {
      ballDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (ballMoved.current) setTimeout(() => { ballMoved.current = false; }, 50);
      setBallX((x) => { snapBallToEdge(x, stateRef.current.ballY); return x; });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [ballSnapX, ballY, clampBallY, snapBallToEdge]);

  // window resize
  useEffect(() => {
    const onResize = () => {
      if (stateRef.current.minimized) snapBallToEdge(stateRef.current.ballX, stateRef.current.ballY);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [snapBallToEdge]);

  if (!mounted || !visible) return null;

  if (minimized) {
    return (
      <div
        data-console-panel
        className={[
          "fixed rounded-full flex items-center justify-center cursor-grab select-none",
          "bg-gradient-to-br from-blue-500 to-blue-400 text-white",
          "shadow-[0_4px_12px_rgba(59,130,246,0.5)]",
          "hover:shadow-[0_4px_20px_rgba(59,130,246,0.7)]",
          "active:cursor-grabbing transition-shadow",
          ballHidden ? "opacity-85 hover:opacity-100" : "",
        ].join(" ")}
        style={{
          left: ballSnapX,
          top: ballY,
          width: BALL_SIZE,
          height: BALL_SIZE,
          zIndex,
          transition: ballDragging.current ? "none" : "left 0.3s ease, opacity 0.3s ease",
        }}
        onMouseDown={startBallDrag}
        onClick={restore}
      >
        <span className="text-base font-bold pointer-events-none">{title.charAt(0)}</span>
      </div>
    );
  }

  return (
    <div
      data-console-panel
      className="fixed bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-2xl select-none"
      style={{ left: curX, top: curY, width: curW, height: collapsed ? 40 : curH, zIndex }}
    >
      <div
        className="h-10 bg-blue-600 text-white flex items-center justify-between px-2.5 cursor-move rounded-t-lg"
        onMouseDown={startDrag}
      >
        <div className="text-sm font-semibold">{title}</div>
        <div className="flex gap-2">
          <button className="border-none bg-white/20 text-white px-2 py-0.5 rounded cursor-pointer hover:bg-white/35 text-xs" onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}>
            {collapsed ? "展开" : "折叠"}
          </button>
          <button className="border-none bg-white/20 text-white px-2 py-0.5 rounded cursor-pointer hover:bg-white/35 text-xs" onClick={(e) => { e.stopPropagation(); minimize(); }} title="最小化为悬浮球">
            ◯
          </button>
          <button className="border-none bg-white/20 text-white px-2 py-0.5 rounded cursor-pointer hover:bg-white/35 text-xs" onClick={(e) => { e.stopPropagation(); onVisibleChange?.(false); }}>
            ×
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="h-[calc(100%-40px)] p-3 overflow-auto bg-gray-50 dark:bg-zinc-800">
          {children}
        </div>
      )}
      {!collapsed && (
        <div
          className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize"
          style={{ background: "linear-gradient(135deg, transparent 50%, #3b82f6 50%)" }}
          onMouseDown={startResize}
        />
      )}
    </div>
  );
}
