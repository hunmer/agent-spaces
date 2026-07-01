"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { sdk } from "@/lib/sdk";
import {
  saveRuntimeCliDiscovery,
  setRuntimeCliEnabled,
  useRuntimeCliSettings,
  type RuntimeCliDiscoveryItem,
} from "@/lib/runtime-cli-settings";

interface DiscoverRuntimeCliResponse {
  items: Array<Omit<RuntimeCliDiscoveryItem, "enabled">>;
}

export function RuntimeTab() {
  const t = useTranslations("settings");
  const { items, updatedAt } = useRuntimeCliSettings();
  const [discovering, setDiscovering] = useState(false);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const data = await sdk.http.post<DiscoverRuntimeCliResponse>("/api/runtime/discover-cli", {});
      const next = saveRuntimeCliDiscovery(data.items);
      const foundCount = next.items.filter((item) => item.found).length;
      toast.success(t("runtimeDiscoverSuccess", { count: foundCount }));
    } catch (error) {
      toast.error(t("runtimeDiscoverFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="mb-0.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("runtimeTitle")}
        </label>
        <p className="text-xs text-muted-foreground">{t("runtimeDescription")}</p>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={handleDiscover} disabled={discovering}>
            {discovering ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
            {discovering ? t("runtimeDiscovering") : t("runtimeDiscover")}
          </Button>
          {updatedAt ? <span className="text-xs text-muted-foreground">{t("runtimeUpdatedAt", { date: new Date(updatedAt).toLocaleString() })}</span> : null}
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            {t("runtimeEmpty")}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{item.label}</span>
                  {!item.supportedRuntime ? (
                    <span className="rounded border border-dashed px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                      {t("runtimeUnsupported")}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {item.found ? item.path : t("runtimeNotFound")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {item.found ? t("runtimeFound") : t("runtimeMissing")}
                </span>
                <Switch
                  checked={item.enabled}
                  onCheckedChange={(checked) => setRuntimeCliEnabled(item.id, checked)}
                  disabled={!item.found}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
