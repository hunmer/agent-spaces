"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Package, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sdk } from "@/lib/sdk";
import { fetchStoreIndex, getStoreApiBase } from "@/lib/agent-store";
import type { AgentConfig } from "@agent-spaces/shared";

interface StoreSkillsPackage {
  id: string;
  name: string;
  summary: string;
  skillSlugs: string[];
  skillCount: number;
  zipUrl: string;
  md5: string;
  updatedAt: string;
}

interface SkillsPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SkillsPackageDialog({ open, onOpenChange }: SkillsPackageDialogProps) {
  const t = useTranslations("skillsPackages");
  const tc = useTranslations("common");
  const [items, setItems] = useState<StoreSkillsPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [installedTemplateIds, setInstalledTemplateIds] = useState<Set<string>>(new Set());

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStoreIndex<StoreSkillsPackage>("skillspackage/index.json");
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  const refreshInstalled = useCallback(async () => {
    try {
      const agents = await sdk.agent.listPresets();
      setInstalledTemplateIds(
        new Set(
          (agents as AgentConfig[])
            .map((a) => a.templateId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchPackages();
    refreshInstalled();
  }, [open, fetchPackages, refreshInstalled]);

  const filtered = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
    );
  });

  const handleInstall = async (item: StoreSkillsPackage) => {
    if (importingIds.has(item.id)) return;
    setImportingIds((prev) => new Set(prev).add(item.id));
    try {
      const base = getStoreApiBase();
      const fullUrl = base
        ? `${base.replace(/\/+$/, "")}/${item.zipUrl.replace(/^\/+/, "")}`
        : `/agents-store/${item.zipUrl.replace(/^\/+/, "")}`;
      const result = await sdk.skillsPackage.install(fullUrl);
      await refreshInstalled();
      toast.success(
        t("installSuccess", { name: item.name }),
      );
      // 安装成功后可顺便刷新 agent 列表 store（如有全局 store 监听）
      void result;
    } catch (err) {
      toast.error(
        t("installFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-3 pt-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="pl-8"
            />
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {t("loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {t("empty")}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-2">
                {filtered.map((item) => {
                  const isInstalled = installedTemplateIds.has(item.id);
                  const isImporting = importingIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Store className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{item.name}</span>
                        </div>
                        <Button
                          variant={isInstalled ? "ghost" : "outline"}
                          size="sm"
                          className="h-6 px-1.5 text-xs shrink-0"
                          disabled={isImporting}
                          onClick={() => handleInstall(item)}
                        >
                          {isImporting ? (
                            t("installing")
                          ) : isInstalled ? (
                            t("update")
                          ) : (
                            <>
                              <Download className="size-3 mr-0.5" />
                              {t("install")}
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {item.summary}
                      </p>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                        <Package className="size-3" />
                        {t("skillsCount", { count: item.skillCount })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
