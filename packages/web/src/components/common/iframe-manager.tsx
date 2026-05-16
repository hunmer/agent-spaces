"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIframeTabs } from "@/stores/iframe-tabs";
import { useCommandPalette } from "@/stores/command-palette";
import { Globe, X, Home } from "lucide-react";
import { FloatingBall } from "./floating-ball";

// ---------- Link Interceptor ----------
export function IframeLinkInterceptor() {
  const add = useIframeTabs((s) => s.add);

  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor || !anchor.href || anchor.target !== "_blank") return;

      try {
        const link = new URL(anchor.href, window.location.href);
        if (link.origin === window.location.origin) return;
      } catch {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      add(anchor.href, anchor.textContent || undefined);
    };

    const originalOpen = window.open;
    window.open = function (url?: string | URL, target?: string, features?: string): Window | null {
      if (url) {
        try {
          const resolved = typeof url === "string" ? new URL(url, window.location.href) : url;
          if (resolved.origin !== window.location.origin) {
            add(resolved.href);
            return null;
          }
        } catch {}
      }
      return originalOpen.call(this, url, target, features);
    };

    document.addEventListener("click", clickHandler, true);
    return () => {
      document.removeEventListener("click", clickHandler, true);
      window.open = originalOpen;
    };
  }, [add]);

  return null;
}

// ---------- Floating Ball ----------
const BALL_SIZE = 40;
const MENU_WIDTH = 260;

export function IframeFloatingBall() {
  const { tabs, activeId, setActive, remove, ballVisible } = useIframeTabs();
  const register = useCommandPalette((s) => s.register);
  const [open, setOpen] = useState(false);
  const ballRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const count = tabs.length;

  useEffect(() => {
    return register({
      id: "iframe-toggle-ball",
      label: ballVisible ? "隐藏 Iframe 悬浮球" : "显示 Iframe 悬浮球",
      group: "视图",
      icon: Globe,
      action: () => useIframeTabs.getState().toggleBall(),
    });
  }, [register, ballVisible]);

  const handleClick = useCallback(() => {
    if (ballRef.current) {
      const rect = ballRef.current.getBoundingClientRect();
      setMenuPos({
        x: Math.max(12, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 12)),
        y: rect.bottom + 6,
      });
    }
    setOpen((v) => !v);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (ballRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!ballVisible) return null;

  return (
    <>
      <FloatingBall
        ref={ballRef}
        lsKey="iframe-ball:pos"
        size={BALL_SIZE}
        onClick={handleClick}
        className="bg-gradient-to-br from-violet-500 to-violet-400 text-white shadow-lg hover:shadow-xl transition-shadow"
      >
        <Globe size={18} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count}
          </span>
        )}
      </FloatingBall>

      {open && (
        <div
          ref={menuRef}
          className="fixed z-[99999] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-2xl overflow-hidden"
          style={{ left: menuPos.x, top: menuPos.y, width: MENU_WIDTH, maxHeight: "calc(100vh - 80px)" }}
        >
          <div className="p-1.5">
            <TabItem
              icon={<Home size={14} />}
              label="主页面"
              active={activeId === null}
              onClick={() => {
                setActive(null);
                setOpen(false);
              }}
            />

            {tabs.map((tab) => (
              <TabItem
                key={tab.id}
                icon={<Globe size={14} />}
                label={tab.title}
                active={activeId === tab.id}
                onClick={() => {
                  setActive(tab.id);
                  setOpen(false);
                }}
                onClose={() => remove(tab.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function TabItem({
  icon,
  label,
  active,
  onClick,
  onClose,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-sm group ${
        active
          ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
          : "hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300"
      }`}
    >
      <span className="shrink-0 opacity-60">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded p-0.5 transition-opacity"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ---------- Iframe Overlay ----------
export function IframeOverlay() {
  const { tabs, activeId } = useIframeTabs();
  const activeTab = tabs.find((t) => t.id === activeId) ?? null;

  if (!activeTab) return null;

  return (
    <div className="fixed inset-0 z-[99990] bg-white dark:bg-zinc-900" style={{ paddingTop: 0 }}>
      <iframe
        src={activeTab.url}
        className="w-full h-full border-none"
        title={activeTab.title}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
