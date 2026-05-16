"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIframeTabs, type IframeSize } from "@/stores/iframe-tabs";
import { useCommandPalette } from "@/stores/command-palette";
import { Globe, X, Home, Plus, Trash2, Bookmark, Monitor, Smartphone, Pencil } from "lucide-react";
import { FloatingBall } from "./floating-ball";
import { FloatingPanel } from "./floating-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SIZE_OPTIONS: { value: IframeSize; label: string; icon: React.ReactNode }[] = [
  { value: "full", label: "全屏", icon: <Monitor size={14} /> },
  { value: "4:3", label: "4:3", icon: <Monitor size={14} /> },
  { value: "9:16", label: "9:16", icon: <Smartphone size={14} /> },
];

const SIZE_DEFAULTS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 375, h: 667 },
  "4:3": { w: 640, h: 480 },
};

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
  const {
    tabs,
    activeId,
    setActive,
    remove,
    ballVisible,
    bookmarks,
    loadBookmarks,
    addBookmark,
    updateBookmark,
    removeBookmark,
    add,
  } = useIframeTabs();
  const register = useCommandPalette((s) => s.register);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [size, setSize] = useState<IframeSize>("full");
  const [saving, setSaving] = useState(false);
  const ballRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const count = tabs.length;

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

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

  const handleAddBookmark = async () => {
    if (!title.trim() || !url.trim()) return;
    setSaving(true);

    if (editingId) {
      const updated = await updateBookmark(editingId, { title: title.trim(), url: url.trim(), size });
      setSaving(false);
      if (updated) {
        setEditingId(null);
        setTitle("");
        setUrl("");
        setSize("full");
        setDialogOpen(false);
      }
      return;
    }

    const bookmark = await addBookmark(title.trim(), url.trim(), size);
    setSaving(false);
    if (bookmark) {
      const tabId = add(bookmark.url, bookmark.title, bookmark.size);
      setActive(tabId);
      setTitle("");
      setUrl("");
      setSize("full");
      setDialogOpen(false);
      setOpen(false);
    }
  };

  const openEditDialog = (bm: { id: string; title: string; url: string; size: IframeSize }) => {
    setEditingId(bm.id);
    setTitle(bm.title);
    setUrl(bm.url);
    setSize(bm.size);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setTitle("");
    setUrl("");
    setSize("full");
  };

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
          style={{
            left: menuPos.x,
            top: menuPos.y,
            width: MENU_WIDTH,
            maxHeight: "calc(100vh - 80px)",
          }}
        >
          <div className="p-1.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
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

            {bookmarks.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                  <Bookmark size={10} />
                  书签
                </div>
                {bookmarks.map((bm) => (
                  <TabItem
                    key={bm.id}
                    icon={<Bookmark size={14} />}
                    label={`${bm.title}${bm.size !== "full" ? ` (${bm.size})` : ""}`}
                    active={false}
                    onClick={() => {
                      const tabId = add(bm.url, bm.title, bm.size);
                      setActive(tabId);
                      setOpen(false);
                    }}
                    onDelete={() => removeBookmark(bm.id)}
                    onEdit={() => openEditDialog(bm)}
                  />
                ))}
              </>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-zinc-800 p-1.5">
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center justify-center gap-1.5 w-full px-2.5 py-1.5 rounded-md text-sm text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              <Plus size={14} />
              添加 Iframe
            </button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑 Iframe" : "添加 Iframe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="iframe-title">标题</Label>
              <Input
                id="iframe-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：Google"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iframe-url">URL</Label>
              <Input
                id="iframe-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>尺寸</Label>
              <div className="flex gap-2">
                {SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSize(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      size === opt.value
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                        : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={handleAddBookmark} disabled={!title.trim() || !url.trim() || saving}>
              {saving ? (editingId ? "保存中..." : "添加中...") : editingId ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TabItem({
  icon,
  label,
  active,
  onClick,
  onClose,
  onEdit,
  onDelete,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
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
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded p-0.5 transition-opacity"
        >
          <Pencil size={12} />
        </button>
      )}
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
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded p-0.5 transition-opacity"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// ---------- Iframe Overlay ----------
export function IframeOverlay() {
  const { tabs, activeId, setActive } = useIframeTabs();
  const activeTab = tabs.find((t) => t.id === activeId) ?? null;
  const [minimizedId, setMinimizedId] = useState<string | null>(null);

  // When active tab changes, clear minimized state
  useEffect(() => {
    if (activeId !== minimizedId) {
      setMinimizedId(null);
    }
  }, [activeId]);

  if (!activeTab) return null;

  const size = activeTab.size || "full";

  // Minimized: show floating ball, click to restore
  if (minimizedId === activeTab.id) {
    return (
      <FloatingBall
        lsKey={`iframe-panel-ball:${activeTab.id}`}
        size={40}
        onClick={() => setMinimizedId(null)}
        className="bg-gradient-to-br from-violet-500 to-violet-400 text-white shadow-lg hover:shadow-xl transition-shadow"
      >
        <Globe size={18} />
      </FloatingBall>
    );
  }

  // Full screen mode
  if (size === "full") {
    return (
      <div className="fixed inset-0 z-[99990] bg-white dark:bg-zinc-900">
        <iframe
          src={activeTab.url}
          className="w-full h-full border-none"
          title={activeTab.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    );
  }

  // Floating panel mode
  const defaults = SIZE_DEFAULTS[size] || SIZE_DEFAULTS["4:3"]!;

  return (
    <FloatingPanel
      id={`iframe-overlay:${activeTab.id}`}
      title={activeTab.title}
      defaultWidth={defaults.w}
      defaultHeight={defaults.h}
      onClose={() => setActive(null)}
      onMinimize={() => setMinimizedId(activeTab.id)}
    >
      <iframe
        src={activeTab.url}
        className="w-full h-full border-none"
        title={activeTab.title}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </FloatingPanel>
  );
}
