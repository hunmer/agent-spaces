"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIframeTabs, type IframeTab } from "@/stores/iframe-tabs";
import { Globe, X, Home, ChevronUp } from "lucide-react";

// ---------- Link Interceptor ----------
export function IframeLinkInterceptor() {
  const add = useIframeTabs((s) => s.add);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
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

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [add]);

  return null;
}

// ---------- Floating Ball ----------
const BALL_SIZE = 40;

export function IframeFloatingBall() {
  const { tabs, activeId, setActive, remove } = useIframeTabs();
  const [open, setOpen] = useState(false);
  const ballRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const count = tabs.length;
  const show = count > 1;

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

  if (!show) return null;

  return (
    <>
      <div
        ref={ballRef}
        onClick={() => setOpen((v) => !v)}
        className="fixed z-[99998] flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer select-none"
        style={{ right: 16, top: 12, width: BALL_SIZE, height: BALL_SIZE }}
      >
        <Globe size={18} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count}
          </span>
        )}
      </div>

      {open && (
        <div
          ref={menuRef}
          className="fixed z-[99999] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-2xl overflow-hidden"
          style={{ right: 16, top: 12 + BALL_SIZE + 6, width: 260, maxHeight: "calc(100vh - 80px)" }}
        >
          <div className="p-1.5">
            {/* Main page */}
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
