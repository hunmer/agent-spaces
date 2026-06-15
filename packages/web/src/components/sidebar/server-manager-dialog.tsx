"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Pencil, Plus, Server, Trash2, Wifi } from "lucide-react";
import { normalizeServerUrl, type ServerConfig } from "@/lib/server";
import { sdk } from "@/lib/sdk";
import { useTranslations } from "next-intl";

interface ServerManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servers: ServerConfig[];
  activeId: string;
  onUpdate: (updated: ServerConfig[]) => void;
  onRemove: (id: string) => void;
  onSwitch: (server: ServerConfig) => void;
}

export function ServerManagerDialog({ open, onOpenChange, servers, activeId, onUpdate, onRemove, onSwitch }: ServerManagerDialogProps) {
  const t = useTranslations("sidebar");
  const tc = useTranslations("common");
  // New / edit server fields
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [newUrl, setNewUrl] = React.useState("");
  const [newSecret, setNewSecret] = React.useState("");
  const [diagnostics, setDiagnostics] = React.useState("");
  const [diagOpen, setDiagOpen] = React.useState(false);
  const [diagServerName, setDiagServerName] = React.useState("");

  const openAddForm = () => {
    setEditingId(null);
    setNewName("");
    setNewUrl("");
    setNewSecret("");
    setFormOpen(true);
  };

  const openEditForm = (server: ServerConfig) => {
    setEditingId(server.id);
    setNewName(server.name);
    setNewUrl(server.url);
    setNewSecret(server.secret || "");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setNewName("");
    setNewUrl("");
    setNewSecret("");
  };

  const submitServer = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    const u = normalizeServerUrl(newUrl);
    if (editingId) {
      const updated = servers.map((s) =>
        s.id === editingId ? { ...s, name: newName.trim(), url: u, secret: newSecret.trim() || undefined } : s
      );
      onUpdate(updated);
    } else {
      const server: ServerConfig = { id: Date.now().toString(), name: newName.trim(), url: u, secret: newSecret.trim() || undefined };
      onUpdate([...servers, server]);
    }
    closeForm();
  };

  const appendDiagnostic = React.useCallback((line: string) => {
    console.log(`[server-diagnostic] ${line}`);
    setDiagnostics((prev) => `${prev}${prev ? "\n" : ""}${line}`);
  }, []);

  const runDiagnostics = async (server: ServerConfig) => {
    setDiagnostics("");
    setDiagServerName(server.name);
    setDiagOpen(true);

    const baseUrl = server.url.replace(/\/$/, "");
    const healthUrl = `${baseUrl}/api/health`;
    const wsUrl = new URL("/ws", baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.searchParams.set("workspaceId", "__diagnostic__");
    wsUrl.searchParams.set("token", server.secret || "__diagnostic__");

    appendDiagnostic(`time: ${new Date().toISOString()}`);
    appendDiagnostic(`window.origin: ${window.location.origin}`);
    appendDiagnostic(`window.href: ${window.location.href}`);
    appendDiagnostic(`navigator.onLine: ${navigator.onLine}`);
    appendDiagnostic(`target: ${baseUrl}`);
    appendDiagnostic(`health: ${healthUrl}`);

    const startedAt = performance.now();
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 10000);
      const res = await sdk.http.raw(healthUrl, {
        method: "GET",
        cache: "no-store",
        mode: "cors",
        signal: controller.signal,
        noAuth: true,
        absoluteUrl: true,
      });
      window.clearTimeout(timer);
      const text = await res.text();
      appendDiagnostic(`fetch /api/health: OK ${res.status} ${res.statusText} (${Math.round(performance.now() - startedAt)}ms)`);
      appendDiagnostic(`fetch response: ${text.slice(0, 500) || "<empty>"}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      appendDiagnostic(`fetch /api/health: FAILED ${err.name}: ${err.message} (${Math.round(performance.now() - startedAt)}ms)`);
    }

    appendDiagnostic(`websocket: ${wsUrl.toString()}`);
    await new Promise<void>((resolve) => {
      const wsStartedAt = performance.now();
      let settled = false;
      const finish = (line: string, ws?: WebSocket) => {
        if (settled) return;
        settled = true;
        appendDiagnostic(`${line} (${Math.round(performance.now() - wsStartedAt)}ms)`);
        try { ws?.close(); } catch {}
        resolve();
      };

      try {
        const ws = new WebSocket(wsUrl.toString());
        const timer = window.setTimeout(() => finish("websocket: TIMEOUT", ws), 10000);
        ws.onopen = () => {
          window.clearTimeout(timer);
          finish("websocket: OPEN", ws);
        };
        ws.onerror = () => {
          window.clearTimeout(timer);
          finish("websocket: ERROR", ws);
        };
        ws.onclose = (event) => {
          window.clearTimeout(timer);
          finish(`websocket: CLOSE code=${event.code} reason=${event.reason || "<empty>"}`, ws);
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        finish(`websocket: FAILED ${err.name}: ${err.message}`);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) closeForm(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("server.manageServers")}</DialogTitle>
          <DialogDescription>{t("server.manageDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {servers.map((server) => (
            <div key={server.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Server className="size-4 shrink-0 text-muted-foreground" />
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => { if (server.id !== activeId) onSwitch(server); }}
              >
                <div className="text-sm font-medium truncate">{server.name}</div>
                <div className="text-xs text-muted-foreground truncate">{server.url}</div>
              </div>
              {server.id === activeId ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onSwitch(server)} className="h-7 px-2 text-xs shrink-0">
                  {t("server.switch")}
                </Button>
              )}
              <Wifi
                className="size-3.5 shrink-0 text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => runDiagnostics(server)}
              />
              <Pencil
                className="size-3.5 shrink-0 text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => openEditForm(server)}
              />
              {server.id !== "default" && (
                <Trash2 className="size-3.5 shrink-0 text-muted-foreground cursor-pointer hover:text-destructive" onClick={() => onRemove(server.id)} />
              )}
            </div>
          ))}
        </div>
        {formOpen ? (
          <div className="border-t pt-3 mt-2 space-y-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {editingId ? t("server.editServer") : t("server.newServer")}
            </div>
            <div className="flex items-center gap-2">
              <Input className="h-8 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" autoFocus />
              <Button size="sm" onClick={submitServer} disabled={!newName.trim() || !newUrl.trim()}>
                {editingId ? tc("save") : <Plus className="size-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeForm} className="h-8 px-2">
                {tc("cancel")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input className="h-8 text-sm flex-1" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="192.168.1.100" />
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 text-sm flex-1"
                type="password"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder={t("server.secretOptionalPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full mt-2" onClick={openAddForm}>
            <Plus className="size-4 mr-1" /> {t("server.newServer")}
          </Button>
        )}
        {diagOpen && (
          <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Network diagnostics</DialogTitle>
                <DialogDescription>{diagServerName}</DialogDescription>
              </DialogHeader>
              <Textarea
                readOnly
                value={diagnostics || "Running..."}
                className="h-64 resize-none font-mono text-[11px]"
              />
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
