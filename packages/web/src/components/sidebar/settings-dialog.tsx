"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
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
import { Sun, Moon, Monitor } from "lucide-react";
import { UserIcon } from "@/components/common/user-icon";
import { getToken, removeToken } from "@/lib/auth";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);

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
          <DialogTitle className="text-base">Settings</DialogTitle>
          <DialogDescription className="text-xs">Customize your workspace appearance</DialogDescription>
        </DialogHeader>
        <div className="p-5 flex flex-col gap-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
              User Avatar
            </label>
            <div className="flex items-center gap-3">
              <UserIcon size="lg" />
              <div className="flex items-center gap-2">
                <label className="text-xs text-primary cursor-pointer hover:underline">
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                </label>
                {userAvatarUrl && (
                  <button type="button" className="text-xs text-destructive hover:underline" onClick={handleRemove}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
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
              Security
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                className="h-8 text-sm flex-1"
                placeholder="New secret key (leave empty to remove)"
                value={newSecret}
                onChange={(e) => { setNewSecret(e.target.value); setSecretSaved(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleChangeSecret()}
              />
              <Button size="sm" onClick={handleChangeSecret} disabled={secretSaved}>
                {secretSaved ? "Saved" : "Save"}
              </Button>
            </div>
            {secretSaved && (
              <p className="text-xs text-muted-foreground mt-1">Redirecting to login...</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
