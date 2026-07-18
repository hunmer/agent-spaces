"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpCircle, Check, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sdk } from "@/lib/sdk";
import {
  saveRuntimeCliDiscovery,
  setRuntimeCliEnabled,
  useRuntimeCliSettings,
  type RuntimeCliDiscoveryItem,
} from "@/lib/runtime-cli-settings";
import { getCliIconUrl } from "@/lib/cli-icons";

function CliIcon({ id, className }: { id: string; className?: string }) {
  const url = getCliIconUrl(id);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} />;
}

interface DiscoverRuntimeCliResponse {
  items: Array<Omit<RuntimeCliDiscoveryItem, "enabled">>;
}

interface InstallRuntimeCliResponse extends DiscoverRuntimeCliResponse {
  ok: boolean;
  runtimeId: "claude-code" | "codex" | "grok" | "gemini-cli" | "hermes" | "pi" | "claude-code-sdk" | "codex-sdk" | "open-agent-sdk";
  packageManager: string;
  packages: string[];
  stdout: string;
  stderr: string;
}

interface CheckSdkUpdatesResponse {
  updates: Array<{
    runtimeId: "claude-code" | "codex" | "grok" | "gemini-cli" | "hermes" | "pi" | "claude-code-sdk" | "codex-sdk" | "open-agent-sdk";
    latestVersion: string | null;
    debug: {
      packageName: string | null;
      command: string | null;
      cwd: string;
      stdout: string;
      stderr: string;
      error: string | null;
    };
  }>;
}

type InstallableRuntimeId = "claude-code" | "codex" | "grok" | "gemini-cli" | "hermes" | "claude-code-sdk" | "codex-sdk" | "open-agent-sdk";
const INSTALLABLE_CLI_IDS = new Set<InstallableRuntimeId>(["claude-code", "codex", "grok", "gemini-cli", "hermes"]);

export function RuntimeTab() {
  const t = useTranslations("settings");
  const { items, updatedAt } = useRuntimeCliSettings();
  const [activeTab, setActiveTab] = useState<"cli" | "sdk">("cli");
  const [refreshingTab, setRefreshingTab] = useState<"cli" | "sdk" | null>(null);
  const [installingId, setInstallingId] = useState<InstallableRuntimeId | null>(null);
  const [checkingUpdateId, setCheckingUpdateId] = useState<InstallableRuntimeId | "all" | null>(null);
  const cliItems = items.filter((item) => item.category === "cli");
  const sdkItems = items.filter((item) => item.category === "sdk");

  const refreshRuntimeItems = useCallback(async (tab: "cli" | "sdk") => {
    setRefreshingTab(tab);
    try {
      const data = await sdk.http.post<DiscoverRuntimeCliResponse>("/api/runtime/discover-cli", {});
      saveRuntimeCliDiscovery(data.items);
    } catch (error) {
      toast.error(t("runtimeDiscoverFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRefreshingTab(null);
    }
  }, [t]);

  useEffect(() => {
    void refreshRuntimeItems(activeTab);
  }, [activeTab, refreshRuntimeItems]);

  const handleInstall = async (runtimeId: InstallableRuntimeId) => {
    setInstallingId(runtimeId);
    try {
      const data = await sdk.http.post<InstallRuntimeCliResponse>("/api/runtime/install-cli", { runtimeId });
      const next = saveRuntimeCliDiscovery(data.items);
      const installedItem = next.items.find((item) => item.id === runtimeId);
      toast.success(t("runtimeInstallSuccess", {
        runtime: installedItem?.label ?? runtimeId,
        packageManager: data.packageManager,
      }));
    } catch (error) {
      toast.error(t("runtimeInstallFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setInstallingId(null);
    }
  };

  const handleCheckUpdates = async (runtimeId?: InstallableRuntimeId) => {
    setCheckingUpdateId(runtimeId ?? "all");
    try {
      const data = await sdk.http.post<CheckSdkUpdatesResponse>("/api/runtime/check-sdk-updates", runtimeId ? { runtimeId } : {});
      console.debug("[runtime] check-sdk-updates response", data);
      const latestById = new Map(data.updates.map((item) => [item.runtimeId, item.latestVersion]));
      const next = {
        items: items.map((item) => ({
          ...item,
          latestVersion: latestById.get(item.id as InstallableRuntimeId) ?? item.latestVersion ?? null,
        })),
        updatedAt: new Date().toISOString(),
      };
      if (typeof window !== "undefined") {
        localStorage.setItem("agent-spaces:runtime-cli-settings", JSON.stringify(next));
        window.dispatchEvent(new Event("agent-spaces:runtime-cli-settings-change"));
      }
      toast.success(t("runtimeCheckUpdateSuccess"));
    } catch (error) {
      toast.error(t("runtimeCheckUpdateFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCheckingUpdateId(null);
    }
  };

  const renderStatusBadge = (item: RuntimeCliDiscoveryItem) => {
    const installing = installingId === item.id;
    const statusLabel = installing
      ? t("runtimeInstalling")
      : item.found
        ? t("runtimeInstalled")
        : t("runtimeNotInstalled");
    const statusClassName = installing
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : item.found
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

    return (
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClassName}`}>
        {statusLabel}
      </span>
    );
  };

  const hasUpdate = (item: RuntimeCliDiscoveryItem) => (
    Boolean(item.found && item.version && item.latestVersion && item.version !== item.latestVersion)
  );

  const isUpToDate = (item: RuntimeCliDiscoveryItem) => (
    Boolean(item.found && item.version && item.latestVersion && item.version === item.latestVersion)
  );

  const getInstallableAction = (item: RuntimeCliDiscoveryItem) => {
    if (!item.found) {
      return {
        icon: Download,
        label: t("runtimeInstall"),
        onClick: () => handleInstall(item.id as InstallableRuntimeId),
        disabled: installingId !== null || checkingUpdateId !== null,
      };
    }
    if (item.id === "grok") {
      return {
        icon: Download,
        label: t("runtimeUpdate"),
        onClick: () => handleInstall("grok"),
        disabled: installingId !== null || checkingUpdateId !== null,
      };
    }
    if (hasUpdate(item)) {
      return {
        icon: Download,
        label: t("runtimeUpdate"),
        onClick: () => handleInstall(item.id as InstallableRuntimeId),
        disabled: installingId !== null || checkingUpdateId !== null,
      };
    }
    if (isUpToDate(item)) {
      return {
        icon: Check,
        label: t("runtimeUpToDate"),
        onClick: () => handleCheckUpdates(item.id as InstallableRuntimeId),
        disabled: checkingUpdateId !== null || installingId !== null,
      };
    }
    return {
      icon: ArrowUpCircle,
      label: t("runtimeCheckUpdate"),
      onClick: () => handleCheckUpdates(item.id as InstallableRuntimeId),
      disabled: checkingUpdateId !== null || installingId !== null,
    };
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="mb-0.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("runtimeTitle")}
        </label>
        <p className="text-xs text-muted-foreground">{t("runtimeDescription")}</p>
        {updatedAt ? <span className="text-xs text-muted-foreground">{t("runtimeUpdatedAt", { date: new Date(updatedAt).toLocaleString() })}</span> : null}
      </div>

      <Tabs defaultValue="cli" value={activeTab} onValueChange={(value) => setActiveTab(value as "cli" | "sdk")} className="block w-full">
        <div className="w-full">
          <TabsList variant="line" className="grid h-9 w-full grid-cols-2 rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="cli"
              className="rounded-none data-[active]:border-b-2 data-[active]:border-primary"
            >
              CLI
            </TabsTrigger>
            <TabsTrigger
              value="sdk"
              className="rounded-none data-[active]:border-b-2 data-[active]:border-primary"
            >
              SDK
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cli" className="mt-0 space-y-3 pt-3">
          <div className="space-y-2">
            {refreshingTab === "cli" ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <Loader2 className="mr-1.5 inline size-3.5 animate-spin" />
                {t("runtimeDiscovering")}
              </div>
            ) : null}
            {cliItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                {t("runtimeEmpty")}
              </div>
            ) : (
              cliItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-3 pr-4">
                    <CliIcon id={item.id} className="mt-0.5 size-6 shrink-0 rounded-sm" />
                    <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {renderStatusBadge(item)}
                      <span>{item.label}</span>
                      {!item.supportedRuntime ? (
                        <span className="rounded border border-dashed px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {t("runtimeUnsupported")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 break-all text-xs text-muted-foreground">
                      {item.found ? item.path : t("runtimeNotFound")}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {item.found && item.version ? `${t("runtimeVersion")}: ${item.version}` : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {item.latestVersion ? `${t("runtimeLatestVersion")}: ${item.latestVersion}` : null}
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {INSTALLABLE_CLI_IDS.has(item.id as InstallableRuntimeId) ? (() => {
                      const action = getInstallableAction(item);
                      const Icon = action.icon;
                      const spinning = installingId === item.id || checkingUpdateId === item.id;
                      return (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={action.onClick}
                          disabled={action.disabled}
                        >
                          {spinning ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Icon className="mr-1.5 size-3.5" />}
                          {spinning ? t("runtimeProcessing") : action.label}
                        </Button>
                      );
                    })() : null}
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
        </TabsContent>

        <TabsContent value="sdk" className="mt-0 space-y-2 pt-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCheckUpdates()}
              disabled={checkingUpdateId !== null}
            >
              {checkingUpdateId === "all" ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <ArrowUpCircle className="mr-1.5 size-3.5" />}
              {t("runtimeCheckUpdates")}
            </Button>
          </div>
          {refreshingTab === "sdk" ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 inline size-3.5 animate-spin" />
              {t("runtimeDiscovering")}
            </div>
          ) : null}
          {sdkItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {t("runtimeEmpty")}
            </div>
          ) : (
            sdkItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="flex min-w-0 items-start gap-3 pr-4">
                  <CliIcon id={item.id} className="mt-0.5 size-6 shrink-0 rounded-sm" />
                  <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {renderStatusBadge(item)}
                    <span>{item.label}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {item.found ? `${t("runtimeVersion")}: ${item.version ?? t("runtimeVersionUnknown")}` : t("runtimeNotFound")}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {item.latestVersion ? `${t("runtimeLatestVersion")}: ${item.latestVersion}` : null}
                  </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.id !== "pi" ? (() => {
                    const action = getInstallableAction(item);
                    const Icon = action.icon;
                    const spinning = installingId === item.id || checkingUpdateId === item.id;
                    return (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={action.onClick}
                        disabled={action.disabled}
                      >
                        {spinning ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Icon className="mr-1.5 size-3.5" />}
                        {installingId === item.id || checkingUpdateId === item.id ? t("runtimeProcessing") : action.label}
                      </Button>
                    );
                  })() : null}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
