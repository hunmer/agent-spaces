"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RefreshCw, ImageDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sdk } from "@/lib/sdk";
import { useLLMStore } from "@/stores/llm";

interface CatalogMeta {
  updatedAt: string | null;
  providers: number;
  models: number;
}

export function ModelCatalogTab() {
  const t = useTranslations("settings");
  const setCatalog = useLLMStore(s => s.setCatalog);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [iconing, setIconing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sdk.llm.getCatalogMeta()
      .then(m => { if (!cancelled) setMeta(m); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const m = await sdk.llm.refreshCatalog();
      setMeta(m);
      // 重新拉取最新 catalog 到 store（用于模型选择自动填充）
      const catalog = await sdk.llm.getCatalog();
      setCatalog(catalog as any);
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
      if (failedCount > 0) {
        toast.success(t("iconsUpdatedPartial", { saved: savedCount, failed: failedCount }));
      } else {
        toast.success(t("iconsUpdated", { count: savedCount }));
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
    </div>
  );
}
