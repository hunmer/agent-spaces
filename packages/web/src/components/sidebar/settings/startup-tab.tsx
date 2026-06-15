"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { isNativeEnvironment } from "@/lib/native-notification";

export function StartupTab() {
  const t = useTranslations("settings");

  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 100;
    const saved = localStorage.getItem("pageZoom");
    const value = saved ? Number(saved) : 100;
    return value >= 50 && value <= 200 ? value : 100;
  });
  const [showZoomSetting, setShowZoomSetting] = useState(false);
  const [showTabs, setShowTabs] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("showWorkspaceTabs");
    return saved === null ? false : saved !== "false";
  });
  const [autoActivate, setAutoActivate] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("autoActivateWorkspace") === "true";
  });
  const [showConsoleBall, setShowConsoleBall] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("showConsoleBall");
    return saved === null ? false : saved !== "false";
  });

  const applyZoom = useCallback((value: number) => {
    localStorage.setItem("pageZoom", String(value));
    setZoom(value);
    window.dispatchEvent(new CustomEvent("zoom-change", { detail: value }));
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShowZoomSetting(isNativeEnvironment());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t("showWorkspaceTabs")}
        </label>
        <Switch
          size="sm"
          checked={showTabs}
          onCheckedChange={(checked) => {
            setShowTabs(checked);
            localStorage.setItem("showWorkspaceTabs", String(checked));
            window.dispatchEvent(new CustomEvent("workspace-tabs-visibility", { detail: checked }));
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t("autoActivateWorkspace")}
        </label>
        <Switch
          size="sm"
          checked={autoActivate}
          onCheckedChange={(checked) => {
            setAutoActivate(checked);
            localStorage.setItem("autoActivateWorkspace", String(checked));
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t("showConsoleBall")}
        </label>
        <Switch
          size="sm"
          checked={showConsoleBall}
          onCheckedChange={(checked) => {
            setShowConsoleBall(checked);
            localStorage.setItem("showConsoleBall", String(checked));
            window.dispatchEvent(new CustomEvent("console-ball-visibility", { detail: checked }));
          }}
        />
      </div>

      {showZoomSetting && (
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
            {t("zoom")}
          </label>
          <div className="flex items-center gap-3">
            <Slider
              min={50}
              max={200}
              step={10}
              value={zoom}
              onValueChange={(v) => applyZoom(Array.isArray(v) ? v[0] : v)}
              className="flex-1"
            />
            <span className="text-xs font-mono tabular-nums w-10 text-right">{zoom}%</span>
            <button
              type="button"
              onClick={() => applyZoom(100)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title={t("zoomReset")}
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          {t("layout")}
        </label>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => window.dispatchEvent(new CustomEvent("reset-layout"))}
        >
          <RotateCcw className="size-3.5" />
          {t("resetLayout")}
        </Button>
      </div>
    </div>
  );
}
