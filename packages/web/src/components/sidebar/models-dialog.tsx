"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { LLMModel } from "@agent-spaces/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Brain,
  Plus,
  Trash2,
} from "lucide-react";
import { useLLMStore } from "@/stores/llm";

const CAP_CLS: Record<string, string> = {
  vision: "bg-blue-500/10 text-blue-600 border-blue-200",
  reasoning: "bg-purple-500/10 text-purple-600 border-purple-200",
  embedding: "bg-green-500/10 text-green-600 border-green-200",
};

const CONTEXT_OPTIONS = [
  { label: "8K", value: 8_192 },
  { label: "16K", value: 16_384 },
  { label: "32K", value: 32_768 },
  { label: "64K", value: 65_536 },
  { label: "128K", value: 128_000 },
  { label: "200K", value: 200_000 },
  { label: "256K", value: 256_000 },
  { label: "1M", value: 1_000_000 },
];

const THINKING_EFFORT_OPTIONS = ["low", "medium", "high"] as const;

function groupByProvider(models: LLMModel[]): Record<string, LLMModel[]> {
  const groups: Record<string, LLMModel[]> = {};
  for (const m of models) {
    const p = m.provider || "Other";
    (groups[p] ??= []).push(m);
  }
  return groups;
}

export function ModelsDialog({
  open,
  onOpenChange,
  initialProvider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProvider?: string;
}) {
  const t = useTranslations("models");
  const tc = useTranslations("common");
  const { models, providers, ensure, addModel, updateModel, removeModel } = useLLMStore();
  const providerNames = providers.map(p => p.name);
  const [selected, setSelected] = useState<LLMModel | null>(null);
  const [draft, setDraft] = useState<Partial<LLMModel> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialProviderHandled = useRef(false);

  useEffect(() => {
    if (!open) {
      initialProviderHandled.current = false;
      return;
    }
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    ensure().finally(() => setLoading(false));
  }, [open, ensure]);

  useEffect(() => {
    if (open && initialProvider && !draft && !initialProviderHandled.current) {
      initialProviderHandled.current = true;
      queueMicrotask(() => {
        setSelected(null);
        setDraft({
          modelId: "",
          name: "",
          provider: initialProvider,
          cost: { inputPerMillion: 0, outputPerMillion: 0 },
          maxContextTokens: 128_000,
          thinkingEnabled: true,
          thinkingEffort: "medium",
          vision: false,
          reasoning: false,
          embedding: false,
        });
      });
    }
  }, [open, initialProvider, draft]);

  const handleBack = () => { setSelected(null); setDraft(null); };

  const handleAdd = () => {
    setSelected(null);
    setDraft({
      modelId: "",
      name: "",
      provider: "Other",
      cost: { inputPerMillion: 0, outputPerMillion: 0 },
      maxContextTokens: 128_000,
      thinkingEnabled: true,
      thinkingEffort: "medium",
      vision: false,
      reasoning: false,
      embedding: false,
    });
  };

  const handleEdit = (m: LLMModel) => {
    setSelected(m);
    setDraft({
      ...m,
      thinkingEnabled: m.thinkingEnabled ?? true,
      thinkingEffort: m.thinkingEffort ?? "medium",
    });
  };

  const handleSave = async () => {
    if (!draft || !draft.modelId || !draft.name) return;
    setSaving(true);
    setError(null);
    try {
      const isNew = !selected;
      const res = await fetch(isNew ? "/api/models" : `/api/models/${selected!.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error();
      const saved: LLMModel = await res.json();
      if (isNew) addModel(saved); else updateModel(saved);
      handleBack();
    } catch {
      setError(t("error.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirm.delete"))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      removeModel(id);
      if (selected?.id === id) handleBack();
    } catch {
      setError(t("error.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (key: string, value: unknown) => {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const groups = groupByProvider(models);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleBack(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          {draft && (
            <Button variant="ghost" size="icon-sm" onClick={handleBack}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <DialogHeader className="flex-1 space-y-0">
            <DialogTitle className="text-base">
              {draft ? (selected ? t("dialog.editTitle") : t("dialog.addTitle")) : t("dialog.title")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {draft ? t("dialog.editDescription") : t("dialog.listDescription")}
            </DialogDescription>
          </DialogHeader>
          {!draft && (
            <Button variant="outline" size="sm" onClick={handleAdd} className="mr-6">
              <Plus className="size-3.5" />
              {t("dialog.add")}
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("dialog.loading")}</div>
          ) : draft ? (
            <ModelForm draft={draft} providerNames={providerNames} onChange={updateDraft} />
          ) : (
            <ModelList groups={groups} providerNames={providerNames} onEdit={handleEdit} onDelete={handleDelete} />
          )}
        </div>

        {draft && (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>{tc("cancel")}</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !draft.modelId || !draft.name}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModelList({
  groups,
  providerNames,
  onEdit,
  onDelete,
}: {
  groups: Record<string, LLMModel[]>;
  providerNames: string[];
  onEdit: (m: LLMModel) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("models");
  const order = providerNames.length > 0 ? providerNames : ["Other"];
  const sorted = Object.keys(groups).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col p-4 gap-4">
      {sorted.map(provider => (
        <div key={provider}>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {provider}
          </div>
          <div className="flex flex-col gap-0.5">
            {groups[provider].map(model => (
              <div
                key={model.id}
                className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => onEdit(model)}
              >
                <Brain className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{model.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono ml-2">{model.modelId}</span>
                  {model.cost ? (
                    <span className="ml-2 text-[11px] text-muted-foreground font-mono">
                      ${formatCost(model.cost.inputPerMillion)}/${formatCost(model.cost.outputPerMillion)}
                    </span>
                  ) : null}
                  {model.maxContextTokens ? (
                    <span className="ml-2 text-[11px] text-muted-foreground font-mono">
                      {formatTokenLimit(model.maxContextTokens)} {t("list.contextAbbr")}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {(["vision", "reasoning", "embedding"] as const).map(cap =>
                    model[cap] ? (
                      <Badge key={cap} variant="outline" className={`text-[10px] h-5 px-1.5 ${CAP_CLS[cap]}`}>
                        {t(`capability.${cap}`)}
                      </Badge>
                    ) : null
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); onDelete(model.id); }}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Brain className="size-10 mb-2 opacity-30" />
          <p className="text-sm">{t("list.empty")}</p>
        </div>
      )}
    </div>
  );
}

function ModelForm({
  draft,
  providerNames,
  onChange,
}: {
  draft: Partial<LLMModel>;
  providerNames: string[];
  onChange: (key: string, value: unknown) => void;
}) {
  const t = useTranslations("models");
  const nameEditedByUser = useRef(false);
  const [contextIdx, setContextIdx] = useState(() => getContextSliderIndex(draft.maxContextTokens));
  const options = providerNames.length > 0 ? providerNames : ["Other"];
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.details")}</div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.modelId")}</label>
          <Input value={draft.modelId || ""} onChange={e => {
            const val = e.target.value;
            onChange("modelId", val);
            if (!nameEditedByUser.current) onChange("name", val);
          }} placeholder={t("form.modelIdPlaceholder")} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.displayName")}</label>
          <Input value={draft.name || ""} onChange={e => { nameEditedByUser.current = true; onChange("name", e.target.value); }} placeholder={t("form.displayNamePlaceholder")} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.provider")}</label>
          <select
            value={draft.provider || "Other"}
            onChange={e => onChange("provider", e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
          >
            {options.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.context")}</div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.maxContextTokens")}</label>
          <div className="flex items-center gap-3">
            <Slider
              min={0}
              max={CONTEXT_OPTIONS.length}
              step={1}
              value={contextIdx}
              onValueChange={(idx) => {
                const i = idx as number;
                setContextIdx(i);
                if (i < CONTEXT_OPTIONS.length) {
                  onChange("maxContextTokens", CONTEXT_OPTIONS[i].value);
                }
              }}
              className="flex-1"
            />
            {contextIdx < CONTEXT_OPTIONS.length ? (
              <span className="text-sm tabular-nums min-w-[3.5rem] text-right">
                {CONTEXT_OPTIONS[contextIdx].label}
              </span>
            ) : (
              <Input
                type="number"
                min="1"
                step="1"
                value={draft.maxContextTokens ?? ""}
                onChange={e => onChange("maxContextTokens", parseOptionalTokenLimit(e.target.value))}
                placeholder={t("form.customContextPlaceholder")}
                className="h-7 w-24 text-sm tabular-nums"
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.thinking")}</div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-input px-3 py-2">
          <div className="min-w-0">
            <label className="text-sm font-medium">{t("form.enableThinking")}</label>
            <p className="text-xs text-muted-foreground">{t("form.enableThinkingHelper")}</p>
          </div>
          <Switch
            checked={draft.thinkingEnabled ?? true}
            onCheckedChange={(checked) => onChange("thinkingEnabled", checked)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.effort")}</label>
          <select
            value={draft.thinkingEffort || "medium"}
            onChange={e => onChange("thinkingEffort", e.target.value)}
            disabled={!(draft.thinkingEnabled ?? true)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          >
            {THINKING_EFFORT_OPTIONS.map(effort => (
              <option key={effort} value={effort}>{effort}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.cost")}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("form.inputPerMillion")}</label>
            <Input
              type="number"
              min="0"
              step="0.0001"
              value={draft.cost?.inputPerMillion ?? 0}
              onChange={e => onChange("cost", {
                inputPerMillion: parseCost(e.target.value),
                outputPerMillion: draft.cost?.outputPerMillion ?? 0,
              })}
              placeholder={t("form.costPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("form.outputPerMillion")}</label>
            <Input
              type="number"
              min="0"
              step="0.0001"
              value={draft.cost?.outputPerMillion ?? 0}
              onChange={e => onChange("cost", {
                inputPerMillion: draft.cost?.inputPerMillion ?? 0,
                outputPerMillion: parseCost(e.target.value),
              })}
              placeholder={t("form.costPlaceholder")}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.capabilities")}</div>
        <div className="flex items-center gap-1.5">
          {(["vision", "reasoning", "embedding"] as const).map(cap => {
            const active = Boolean(draft[cap]);
            return (
              <button
                key={cap}
                type="button"
                onClick={() => onChange(cap, !active)}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors cursor-pointer
                  ${active
                    ? CAP_CLS[cap]
                    : "text-muted-foreground border-input hover:bg-muted/50"
                  }`}
              >
                {t(`capability.${cap}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function parseCost(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseOptionalTokenLimit(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function getContextSliderIndex(value?: number): number {
  if (!value) return CONTEXT_OPTIONS.length;
  const idx = CONTEXT_OPTIONS.findIndex(o => o.value === value);
  return idx >= 0 ? idx : CONTEXT_OPTIONS.length;
}

function formatCost(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatTokenLimit(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
