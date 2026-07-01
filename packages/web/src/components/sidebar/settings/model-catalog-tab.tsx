"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RefreshCw, ImageDown, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sdk } from "@/lib/sdk";
import { useLLMStore, type CatalogModel, type CatalogProvider, type ModelCatalog } from "@/stores/llm";
import { getProviderIconUrlById } from "@/lib/provider-icon";

interface CatalogMeta {
  updatedAt: string | null;
  providers: number;
  models: number;
}

export function ModelCatalogTab() {
  const t = useTranslations("settings");
  const setCatalog = useLLMStore(s => s.setCatalog);
  const catalog = useLLMStore(s => s.catalog);
  const loadCatalog = useLLMStore(s => s.loadCatalog);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [iconing, setIconing] = useState(false);
  const [activeTab, setActiveTab] = useState<"models" | "providers">("models");
  const [modelQuery, setModelQuery] = useState("");
  const [providerQuery, setProviderQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    sdk.llm.getCatalogMeta()
      .then(m => { if (!cancelled) setMeta(m); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // 确保 catalog 已加载（用于列表展示）
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const m = await sdk.llm.refreshCatalog();
      setMeta(m);
      // 重新拉取最新 catalog 到 store（用于模型选择自动填充）
      const fresh = await sdk.llm.getCatalog() as ModelCatalog;
      setCatalog(fresh);
      toast.success(t("catalogUpdated", { providers: m.providers, models: m.models }));
    } catch {
      toast.error(t("catalogUpdateFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [t, setCatalog]);

  const handleRefreshIcons = useCallback(async () => {
    setIconing(true);
    try {
      const result = await sdk.llm.refreshProviderIcons();
      const savedCount = result.saved?.length ?? 0;
      const failedCount = result.failed?.length ?? 0;
      const removedCount = result.removed?.length ?? 0;
      if (failedCount > 0) {
        toast.success(t("iconsUpdatedPartial", { saved: savedCount, failed: failedCount, removed: removedCount }));
      } else {
        toast.success(t("iconsUpdated", { count: savedCount, removed: removedCount }));
      }
    } catch {
      toast.error(t("iconsUpdateFailed"));
    } finally {
      setIconing(false);
    }
  }, [t]);

  const updatedAtLabel = meta?.updatedAt
    ? new Date(meta.updatedAt).toLocaleString()
    : "-";

  const providerList = useMemo<Array<[string, CatalogProvider]>>(() => {
    if (!catalog?.providers) return [];
    const q = providerQuery.trim().toLowerCase();
    const entries = Object.entries(catalog.providers) as Array<[string, CatalogProvider]>;
    if (!q) return entries;
    return entries.filter(([id, p]) =>
      id.toLowerCase().includes(q) || (p.name ?? "").toLowerCase().includes(q)
    );
  }, [catalog, providerQuery]);

  const modelList = useMemo<Array<[string, CatalogModel]>>(() => {
    if (!catalog?.models) return [];
    const q = modelQuery.trim().toLowerCase();
    const entries = Object.entries(catalog.models) as Array<[string, CatalogModel]>;
    if (!q) return entries;
    return entries.filter(([id, m]) =>
      id.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q)
    );
  }, [catalog, modelQuery]);

  const formatCost = (cost?: number) => (cost == null ? "-" : `$${cost}`);
  const formatContext = (limit?: number) => (limit == null ? "-" : `${limit}`);

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          {t("modelCatalog")}
        </label>
        <p className="text-sm text-muted-foreground mb-3">{t("modelCatalogDesc")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || iconing}>
            {refreshing ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5 mr-1.5" />
            )}
            {refreshing ? t("catalogUpdating") : t("updateCatalog")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefreshIcons} disabled={refreshing || iconing}>
            {iconing ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <ImageDown className="size-3.5 mr-1.5" />
            )}
            {iconing ? t("iconsUpdating") : t("updateCatalogIcons")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {loading
            ? t("catalogLoading")
            : t("catalogMeta", { providers: meta?.providers ?? 0, models: meta?.models ?? 0, date: updatedAtLabel })}
        </p>
      </div>

      <Tabs defaultValue="models" value={activeTab} onValueChange={(value) => setActiveTab(value as "models" | "providers")} className="block w-full">
        <div className="w-full">
          <TabsList variant="line" className="grid h-9 w-full grid-cols-2 rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="models"
              className="rounded-none data-[active]:border-b-2 data-[active]:border-primary"
            >
              {t("catalogTabModels", { count: meta?.models ?? 0 })}
            </TabsTrigger>
            <TabsTrigger
              value="providers"
              className="rounded-none data-[active]:border-b-2 data-[active]:border-primary"
            >
              {t("catalogTabProviders", { count: meta?.providers ?? 0 })}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="models" className="mt-0 space-y-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder={t("catalogSearchModels")}
              className="h-8 pl-8 text-xs"
            />
          </div>
          {modelList.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {t("catalogEmpty")}
            </div>
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {modelList.map(([id, m]) => {
                const providerId = id.split("/")[0]?.toLowerCase();
                const iconUrl = providerId ? getProviderIconUrlById(providerId) : "";
                return (
                  <div key={id} className="flex items-center gap-2.5 rounded-md border px-2.5 py-2">
                    <img
                      src={iconUrl}
                      alt=""
                      className="size-4 shrink-0 rounded-sm object-contain"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{m.name ?? id}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{id}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                      <span title={t("catalogColContext")}>{formatContext(m.limit?.context)}</span>
                      <span title={t("catalogColInput")}>{formatCost(m.cost?.input)}</span>
                      <span title={t("catalogColOutput")}>{formatCost(m.cost?.output)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="providers" className="mt-0 space-y-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={providerQuery}
              onChange={(e) => setProviderQuery(e.target.value)}
              placeholder={t("catalogSearchProviders")}
              className="h-8 pl-8 text-xs"
            />
          </div>
          {providerList.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {t("catalogEmpty")}
            </div>
          ) : (
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {providerList.map(([id, p]) => {
                const iconUrl = getProviderIconUrlById(id);
                const count = p.models ? Object.keys(p.models).length : 0;
                return (
                  <div key={id} className="flex items-center gap-2 rounded-md border px-2.5 py-2">
                    <img
                      src={iconUrl}
                      alt=""
                      className="size-5 shrink-0 rounded-sm object-contain"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{p.name ?? id}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {count > 0 ? t("catalogProviderModels", { count }) : id}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
