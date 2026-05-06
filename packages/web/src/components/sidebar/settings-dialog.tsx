"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Sun, Moon, Monitor, Languages } from "lucide-react";
import { UserIcon } from "@/components/common/user-icon";
import { getToken, removeToken } from "@/lib/auth";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);

  const themeOptions = [
    { value: "light" as const, label: t("themeLight"), icon: Sun },
    { value: "dark" as const, label: t("themeDark"), icon: Moon },
    { value: "system" as const, label: t("themeSystem"), icon: Monitor },
  ];

  useEffect(() => {
    setUserAvatarUrl(localStorage.getItem("userAvatarUrl"));
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
        }
      } catch { /* ignore */ }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemove = () => {
    localStorage.removeItem("userAvatarUrl");
    setUserAvatarUrl(null);
  };

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
        setTimeout(() => router.push("/login"), 800);
      }
    } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="text-base">{t('title')}</DialogTitle>
          <DialogDescription className="text-xs">{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="p-5 flex flex-col gap-5">
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
                onKeyDown={(e) => e.key === "Enter" && handleChangeSecret()}
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
      </DialogContent>
    </Dialog>
  );
}
