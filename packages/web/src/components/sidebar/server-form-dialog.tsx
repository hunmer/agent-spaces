"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeServerUrl, type ServerConfig } from "@/lib/server";
import { useTranslations } from "next-intl";

interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  servers: ServerConfig[];
  onSave: (updated: ServerConfig[]) => void;
}

export function ServerFormDialog({ open, onOpenChange, editingId, servers, onSave }: ServerFormDialogProps) {
  const t = useTranslations("sidebar");
  const tc = useTranslations("common");
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");

  React.useEffect(() => {
    if (open && editingId) {
      const server = servers.find((s) => s.id === editingId);
      if (server) {
        setName(server.name);
        setUrl(server.url);
        setSecret(server.secret || "");
      }
    } else if (open) {
      setName("");
      setUrl("");
      setSecret("");
    }
  }, [open, editingId, servers]);

  const saveForm = () => {
    if (!name.trim() || !url.trim()) return;
    const u = normalizeServerUrl(url);
    if (editingId) {
      const updated = servers.map((s) =>
        s.id === editingId ? { ...s, name: name.trim(), url: u, secret: secret.trim() || undefined } : s
      );
      onSave(updated);
    } else {
      const server: ServerConfig = { id: Date.now().toString(), name: name.trim(), url: u, secret: secret.trim() || undefined };
      onSave([...servers, server]);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingId ? t("server.editServer") : t("server.addServer")}</DialogTitle>
          <DialogDescription>
            {editingId ? t("server.editDescription") : t("server.addDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">{tc("name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("server.url")}</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="192.168.1.100"
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("server.secret")}</label>
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={t("server.secretPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={saveForm} disabled={!name.trim() || !url.trim()}>
            {editingId ? tc("save") : tc("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
