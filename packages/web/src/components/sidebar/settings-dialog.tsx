"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { tauriNavigate } from "@/lib/navigate";
import { useTheme } from "@/components/theme-provider";
import { useLocale, type Locale } from "@/components/locale-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Sun, Moon, Monitor, Languages, RotateCcw, User, Palette, Globe, Shield } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { UserIcon } from "@/components/common/user-icon";
import { getToken, removeToken } from "@/lib/auth";
import { isTauriEnvironment } from "@/lib/native-notification";

const tabs = [
  { key: "appearance", icon: Palette },
  { key: "language", icon: Globe },
  { key: "account", icon: User },
  { key: "security", icon: Shield },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function SettingsDialog({
  open,
  onOpenChange,
  standalone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("appearance");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("userAvatarUrl");
  });
  const [newSecret, setNewSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 100;
    const saved = localStorage.getItem("pageZoom");
    const value = saved ? Number(saved) : 100;
    return value >= 50 && value <= 200 ? value : 100;
  });
  const [showZoomSetting, setShowZoomSetting] = useState(false);
  const [showTabs, setShowTabs] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("showWorkspaceTabs");
    return saved === null ? true : saved !== "false";
  });

  const applyZoom = useCallback((value: number) => {
    localStorage.setItem("pageZoom", String(value));
    setZoom(value);
    window.dispatchEvent(new CustomEvent("zoom-change", { detail: value }));
  }, []);

  const themeOptions = [
    { value: "light" as const, label: t("themeLight"), icon: Sun },
    { value: "dark" as const, label: t("themeDark"), icon: Moon },
    { value: "system" as const, label: t("themeSystem"), icon: Monitor },
  ];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setUserAvatarUrl(localStorage.getItem("userAvatarUrl"));
      setShowZoomSetting(isTauriEnvironment());
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/upload/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: reader.result, filename: "user.jpg" }),
        });
        const data = await res.json();
        if (data.url) {
          localStorage.setItem("userAvatarUrl", data.url);
          setUserAvatarUrl(data.url);
          fetch("/api/user/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatarUrl: data.url }),
          }).catch(() => {});
        }
      } catch { /* ignore */ }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemove = () => {
    localStorage.removeItem("userAvatarUrl");
    setUserAvatarUrl(null);
    fetch("/api/user/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: null }),
    }).catch(() => {});

  const handleChangeSecret = async () => {
    const token = getToken();
    try {
      const res = await fetch("/api/auth/change-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ newSecret, currentToken: token }),
      });
      if (res.ok) {
        setSecretSaved(true);
        removeToken();
        setTimeout(() => tauriNavigate(router, "/login"), 800);
      }
    } catch { /* ignore */ }
  };

  const tabLabels: Record<TabKey, string> = {
    appearance: t('theme'),
    language: t('language'),
    account: t('userAvatar'),
    security: t('security'),
  };

  const renderContent = () => {
    switch (activeTab) {
      case "appearance":
        return (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
                {t('theme')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {themeOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50",
                      theme === value && "border-primary bg-primary/5 text-primary",
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('showWorkspaceTabs')}
              </label>
              <Switch
                size="sm"
                checked={showTabs}
                onCheckedChange={(checked) => {
                  setShowTabs(checked);
                  localStorage.setItem("showWorkspaceTabs", String(checked));
                  window.dispatchEvent(new CustomEvent("workspace-tabs-visibility", { detail: checked }));
                }}
              />
            </div>

            {showZoomSetting && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
                  {t('zoom')}
                </label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={50}
                    max={200}
                    step={10}
                    value={zoom}
                    onValueChange={(v) => applyZoom(Array.isArray(v) ? v[0] : v)}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono tabular-nums w-10 text-right">{zoom}%</span>
                  <button
                    type="button"
                    onClick={() => applyZoom(100)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={t('zoomReset')}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
                {t('layout')}
              </label>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => window.dispatchEvent(new CustomEvent("reset-layout"))}
              >
                <RotateCcw className="size-3.5" />
                {t('resetLayout')}
              </Button>
            </div>
          </div>
        );

      case "language":
        return (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
                {t('language')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'zh' as Locale, label: t('languageZh') },
                  { value: 'en' as Locale, label: t('languageEn') },
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocale(value)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50",
                      locale === value && "border-primary bg-primary/5 text-primary",
                    )}
                  >
                    <Languages className="size-4" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "account":
        return (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
                {t('userAvatar')}
              </label>
              <div className="flex items-center gap-3">
                <UserIcon size="lg" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-primary cursor-pointer hover:underline">
                    {tc('upload')}
                    <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                  </label>
                  {userAvatarUrl && (
                    <button type="button" className="text-xs text-destructive hover:underline" onClick={handleRemove}>
                      {tc('remove')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case "security":
        return (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
                {t('security')}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  className="h-8 text-sm flex-1"
                  placeholder={t('newSecretPlaceholder')}
                  value={newSecret}
                  onChange={(e) => { setNewSecret(e.target.value); setSecretSaved(false); }}
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                />
                <Button size="sm" onClick={handleChangeSecret} disabled={secretSaved}>
                  {secretSaved ? tc('saved') : tc('save')}
                </Button>
              </div>
              {secretSaved && (
                <p className="text-xs text-muted-foreground mt-1">{t('redirecting')}</p>
              )}
            </div>
          </div>
        );
    }
  };

  const sidebar = (
    <div className="flex h-full">
      <div className="w-36 border-r flex flex-col py-3 px-2 shrink-0">
        {tabs.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition-colors text-left",
              activeTab === key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {tabLabels[key]}
          </button>
        ))}
      </div>
      <div className="flex-1 p-5 min-w-0 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );

  if (standalone) return sidebar;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <DialogTitle className="text-base">{t('title')}</DialogTitle>
          <DialogDescription className="text-xs">{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">{sidebar}</div>
      </DialogContent>
    </Dialog>
  );
}
