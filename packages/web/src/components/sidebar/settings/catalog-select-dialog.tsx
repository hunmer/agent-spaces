"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getProviderIconUrlById } from "@/lib/provider-icon";
import { getDefaultCatalogSelection } from "@/lib/model-catalog";
import type { CatalogModel, CatalogProvider, ModelCatalog } from "@/stores/llm";

interface Props {
  open: boolean;
  catalog: ModelCatalog | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (selection: Record<string, string[]>) => void;
}

/**
 * 刷新模型目录后的导入选择对话框：按服务商分组勾选模型，
 * 默认勾选知名头部服务商及其前沿模型，确认后仅导入所选子集。
 */
export function CatalogSelectDialog({ open, catalog, saving, onCancel, onConfirm }: Props) {
  const t = useTranslations("settings");
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  // 打开对话框时用头部服务商 + 前沿模型作为默认勾选
  useEffect(() => {
    if (!open) return;
    const defaults = getDefaultCatalogSelection(catalog);
    setSelection(defaults);
    setExpanded(new Set(Object.keys(defaults)));
  }, [open, catalog]);

  const providerEntries = useMemo<Array<[string, CatalogProvider]>>(() => {
    if (!catalog?.providers) return [];
    const entries = Object.entries(catalog.providers) as Array<[string, CatalogProvider]>;
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(([id, p]) => {
      if (id.toLowerCase().includes(q) || (p.name ?? "").toLowerCase().includes(q)) return true;
      return Object.entries(p.models ?? {}).some(
        ([mid, m]) => mid.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q),
      );
    });
  }, [catalog, query]);

  const toggleModel = (providerId: string, modelId: string) => {
    setSelection((prev) => {
      const list = prev[providerId] ?? [];
      return {
        ...prev,
        [providerId]: list.includes(modelId) ? list.filter((id) => id !== modelId) : [...list, modelId],
      };
    });
  };

  const toggleProvider = (providerId: string, models: Record<string, CatalogModel>) => {
    setSelection((prev) => {
      const allIds = Object.keys(models);
      const list = prev[providerId] ?? [];
      const allSelected = allIds.length > 0 && allIds.every((id) => list.includes(id));
      return { ...prev, [providerId]: allSelected ? [] : allIds };
    });
  };

  const toggleExpand = (providerId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const selectedCount = Object.values(selection).reduce((sum, list) => sum + list.length, 0);

  const confirm = () => {
    // 过滤空列表后提交
    const payload: Record<string, string[]> = {};
    for (const [pid, list] of Object.entries(selection)) {
      if (list.length > 0) payload[pid] = list;
    }
    onConfirm(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onCancel(); }}>
      <DialogContent className="max-h-[85vh] w-[min(680px,95vw)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("catalogSelectTitle")}</DialogTitle>
          <DialogDescription>{t("catalogSelectDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("catalogSearchProviders")}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("catalogSelectedCount", { count: selectedCount })}
          </span>
        </div>

        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {providerEntries.map(([providerId, p]) => {
            const models = p.models ?? {};
            const modelIds = Object.keys(models);
            const selected = selection[providerId] ?? [];
            const allSelected = modelIds.length > 0 && modelIds.every((id) => selected.includes(id));
            const isExpanded = expanded.has(providerId) || (query.trim().length > 0);
            const iconUrl = getProviderIconUrlById(providerId);
            return (
              <div key={providerId} className="rounded-md border">
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <Checkbox
                    checked={selected.length > 0}
                    indeterminate={selected.length > 0 && !allSelected}
                    onCheckedChange={() => toggleProvider(providerId, models)}
                    aria-label={p.name ?? providerId}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => toggleExpand(providerId)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <img
                      src={iconUrl}
                      alt=""
                      className="size-4 shrink-0 rounded-sm object-contain"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    />
                    <span className="truncate text-xs font-medium">{p.name ?? providerId}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {selected.length}/{modelIds.length}
                    </span>
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t px-2.5 py-1.5">
                    {modelIds.map((modelId) => (
                      <label
                        key={modelId}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selected.includes(modelId)}
                          onCheckedChange={() => toggleModel(providerId, modelId)}
                        />
                        <span className="truncate text-xs">{models[modelId]?.name ?? modelId}</span>
                        <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">{modelId}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            {t("catalogSelectCancel")}
          </Button>
          <Button size="sm" onClick={confirm} disabled={saving || selectedCount === 0}>
            {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
            {t("catalogSelectConfirm", { count: selectedCount })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
