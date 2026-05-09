"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings2 } from "lucide-react";
import { setToken } from "@/lib/auth";
import { tauriNavigate } from "@/lib/navigate";
import { type ServerConfig, loadServers, saveServers, loadActiveId, saveActiveId, setActiveServerCookie } from "@/lib/server";
import { ServerManagerDialog } from "@/components/sidebar/server-manager-dialog";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('login');
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<ServerConfig[]>(loadServers);
  const [activeId, setActiveId] = useState(loadActiveId);
  const [managerOpen, setManagerOpen] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('loginFailed'));
        return;
      }

      setToken(data.token);
      tauriNavigate(router, "/");
    } catch {
      setError(t('networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Agent Spaces</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="space-y-4">
          <Input
            type="password"
            placeholder={t('secretPlaceholder')}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? t('verifying') : t('login')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setManagerOpen(true)}>
            <Settings2 className="size-4 mr-2" />
            {t('manageServers')}
          </Button>
        </div>
      </div>

      <ServerManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        servers={servers}
        activeId={activeId}
        onUpdate={(updated) => { setServers(updated); saveServers(updated); }}
        onRemove={(id) => {
          if (id === "default") return;
          const updated = servers.filter((s) => s.id !== id);
          setServers(updated);
          saveServers(updated);
          if (activeId === id) {
            const fallback = updated.find((s) => s.id === "default") || updated[0];
            if (fallback) {
              setActiveId(fallback.id);
              saveActiveId(fallback.id);
              setActiveServerCookie(fallback.url);
            }
          }
        }}
        onSwitch={(server) => {
          setActiveId(server.id);
          saveActiveId(server.id);
          setActiveServerCookie(server.url);
        }}
      />
    </div>
  );
}
