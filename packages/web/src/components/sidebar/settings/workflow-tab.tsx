"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sdk } from "@/lib/sdk";
import type { WorkflowFaultTolerance } from "@agent-spaces/sdk";

type FaultTolerance = WorkflowFaultTolerance;

export function WorkflowTab() {
  const t = useTranslations("settings");
  const [faultTolerance, setFaultTolerance] = useState<FaultTolerance>("ignore");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sdk.workflowSettings
      .get()
      .then((settings) => {
        if (cancelled) return;
        setFaultTolerance(settings.faultTolerance === "stop" ? "stop" : "ignore");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async (value: FaultTolerance) => {
    setFaultTolerance(value);
    setSaving(true);
    setSaved(false);
    try {
      await sdk.workflowSettings.update({ faultTolerance: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("workflowFaultTolerance")}
        </label>
        <Select value={faultTolerance} onValueChange={(v) => handleChange(v as FaultTolerance)} disabled={loading || saving}>
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ignore">{t("workflowFaultToleranceIgnore")}</SelectItem>
            <SelectItem value="stop">{t("workflowFaultToleranceStop")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {faultTolerance === "stop" ? t("workflowFaultToleranceStopDesc") : t("workflowFaultToleranceIgnoreDesc")}
        </p>
        {saving && <p className="mt-1 text-xs text-muted-foreground">{t("workflowSaving")}</p>}
        {saved && <p className="mt-1 text-xs text-primary">{t("workflowSaved")}</p>}
      </div>
    </div>
  );
}
