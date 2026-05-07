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
import { Check, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { type ServerConfig } from "@/lib/server";
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
  const [editId, setEditId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");
  // New server fields
  const [newName, setNewName] = React.useState("");
  const [newUrl, setNewUrl] = React.useState("");
  const [newSecret, setNewSecret] = React.useState("");

  const startEdit = (server: ServerConfig) => {
    setEditId(server.id);
    setName(server.name);
    setUrl(server.url);
    setSecret(server.secret || "");
  };

  const cancelEdit = () => {
    setEditId(null);
    setName("");
    setUrl("");
    setSecret("");
  };

  const saveEdit = () => {
    if (!name.trim() || !url.trim()) return;
    let u = url.trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(u)) u = "http://" + u;
    const updated = servers.map((s) =>
      s.id === editId ? { ...s, name: name.trim(), url: u, secret: secret.trim() || undefined } : s
    );
    onUpdate(updated);
    cancelEdit();
  };

  const addServer = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    let u = newUrl.trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(u)) u = "http://" + u;
    const server: ServerConfig = { id: Date.now().toString(), name: newName.trim(), url: u, secret: newSecret.trim() || undefined };
    onUpdate([...servers, server]);
    setNewName("");
    setNewUrl("");
    setNewSecret("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) cancelEdit(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("server.manageServers")}</DialogTitle>
          <DialogDescription>{t("server.manageDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {servers.map((server) => (
            <div key={server.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Server className="size-4 shrink-0 text-muted-foreground" />
              {editId === server.id ? (
                <>
                  <Input className="h-7 text-sm flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
                  <Input className="h-7 text-sm flex-[1.5]" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://..." onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
                  <Button size="sm" variant="ghost" onClick={saveEdit} className="h-7 px-2">{tc("save")}</Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">{tc("cancel")}</Button>
                </>
              ) : (
                <>
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
                  <>
                    <Pencil className="size-3.5 shrink-0 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => startEdit(server)} />
                    {server.id !== "default" && (
                      <Trash2 className="size-3.5 shrink-0 text-muted-foreground cursor-pointer hover:text-destructive" onClick={() => onRemove(server.id)} />
                    )}
                  </>
                </>
              )}
            </div>
          ))}
        </div>
        {editId === null && (
          <div className="border-t pt-3 mt-2 space-y-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">{t("server.newServer")}</div>
            <div className="flex items-center gap-2">
              <Input className="h-8 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
              <Button size="sm" onClick={addServer} disabled={!newName.trim() || !newUrl.trim()}>
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input className="h-8 text-sm flex-1" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="http://..." />
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
        )}
      </DialogContent>
    </Dialog>
  );
}
