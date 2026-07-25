"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { LLMModel, AgentConfig } from "@agent-spaces/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Brain,
  Plus,
  Trash2,
  MoreVertical,
  DollarSign,
} from "lucide-react";
import { useLLMStore } from "@/stores/llm";
import type { CatalogModel } from "@/stores/llm";
import { sdk } from "@/lib/sdk";
import { SearchSelect } from "@/components/ui/search-select";
import { useResolvedAgentIcon } from "@/hooks/use-resolved-agent-icon";
import { resolveServerAssetUrl } from "@/lib/server";
import { getProviderIconUrlById } from "@/lib/provider-icon";
import { CAP_CLS, getModelCapabilities, isOpenAIResponsesModelProvider, supportsCatalogImageCapability } from "./model-capabilities";

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

// 提取 url 的 host（含端口），用于按 baseUrl 匹配相同 host 的模型列表
function normalizeHost(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `http://${url}`);
    return u.host.toLowerCase();
  } catch {
    return "";
  }
}

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
  focusProvider,
  standalone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProvider?: string;
  // 打开列表时滚动定位到该服务商分组（不进入新增表单）
  focusProvider?: string;
  standalone?: boolean;
}) {
  const t = useTranslations("models");
  const tc = useTranslations("common");
  const { models, providers, ensure, addModel, updateModel, removeModel, setModels, catalog, loadCatalog } = useLLMStore();
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
    loadCatalog();
  }, [open, ensure, loadCatalog]);

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
          image: false,
        });
      });
    }
  }, [open, initialProvider, draft]);

  const handleBack = () => { setSelected(null); setDraft(null); };

  // 仅定位到服务商分组（不进入新增表单）：打开且未进入 draft 时滚动到对应分组
  const focusHandled = useRef(false);
  useEffect(() => {
    if (!open || !focusProvider || draft) {
      if (!open) focusHandled.current = false;
      return;
    }
    if (focusHandled.current) return;
    focusHandled.current = true;
    const el = document.getElementById(`models-group-${focusProvider}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open, focusProvider, draft]);

  const handleAdd = (provider?: string) => {
    setSelected(null);
    const fallback = providerNames.length > 0 ? providerNames[0] : "Other";
    setDraft({
      modelId: "",
      name: "",
      provider: provider || fallback,
      cost: { inputPerMillion: 0, outputPerMillion: 0 },
      maxContextTokens: 128_000,
      thinkingEnabled: true,
      thinkingEffort: "medium",
      vision: false,
      reasoning: false,
      embedding: false,
      image: false,
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
      const isMulti = draft.modelId.includes(",");
      if (isNew) {
        // 多选：仅传必要字段，其余由后端按 catalog 自动填充
        const payload = isMulti
          ? { modelId: draft.modelId, name: draft.name, provider: draft.provider, autoFill: true }
          : draft;
        const saved = await sdk.llm.createModel(payload);
        // 后端按 modelId 逗号拆分，可能返回单个或数组
        const list: LLMModel[] = Array.isArray(saved) ? saved : [saved];
        list.forEach((m) => addModel(m));
      } else {
        const saved: LLMModel = await sdk.llm.updateModel(selected!.id, draft);
        updateModel(saved);
      }
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
      await sdk.llm.deleteModel(id);
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

  const [syncing, setSyncing] = useState(false);

  const handleSyncPrices = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await sdk.llm.syncModelPrices();
      // 重新拉取最新模型列表以反映价格更新
      const latest = await sdk.llm.listModels();
      setModels(latest);
      const msg = t("dialog.syncResult", { updated: result.updated, total: result.total });
      window.alert(msg);
    } catch {
      setError(t("error.syncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  const groups = groupByProvider(models);

  const content = (
    <>
      {!standalone && (
        <div className="flex items-center gap-3 border-b px-5 py-4">
          {draft && (
            <Button variant="ghost" size="icon" onClick={handleBack}>
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
            <div className="flex items-center gap-1 mr-6">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7" disabled={syncing} />}>
                  <MoreVertical className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSyncPrices} disabled={syncing}>
                    <DollarSign className="size-3.5 mr-1.5" />
                    {syncing ? t("dialog.syncing") : t("dialog.syncPrices")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => handleAdd()}>
                <Plus className="size-3.5" />
                {t("dialog.add")}
              </Button>
            </div>
          )}
        </div>
      )}
      {standalone && !draft && (
        <div className="flex items-center justify-end gap-1 px-5 py-3 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7" disabled={syncing} />}>
              <MoreVertical className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSyncPrices} disabled={syncing}>
                <DollarSign className="size-3.5 mr-1.5" />
                {syncing ? t("dialog.syncing") : t("dialog.syncPrices")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => handleAdd()}>
            <Plus className="size-3.5" />
            {t("dialog.add")}
          </Button>
        </div>
      )}
      {standalone && draft && (
        <div className="flex items-center gap-3 px-5 py-3 border-b">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-medium truncate">
              {selected ? t("dialog.editTitle") : t("dialog.addTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("dialog.editDescription")}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("dialog.loading")}</div>
        ) : draft ? (
          <ModelForm draft={draft} providerNames={providerNames} providers={providers} editing={!!selected} onChange={updateDraft} catalog={catalog} />
        ) : (
          <ModelList groups={groups} providers={providers} providerNames={providerNames} onEdit={handleEdit} onDelete={handleDelete} onAdd={handleAdd} />
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
    </>
  );

  if (standalone) {
    return <div className="h-full flex flex-col">{content}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleBack(); onOpenChange(o); }}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col p-0 gap-0">
        {content}
      </DialogContent>
    </Dialog>
  );
}

function ProviderIcon({
  apiBase,
  modelProvider,
  modelId,
  className,
}: {
  apiBase?: string;
  modelProvider?: AgentConfig["modelProvider"];
  modelId?: string;
  className?: string;
}) {
  const { remoteResolved } = useResolvedAgentIcon({ apiBase, modelProvider, modelId });
  const iconUrl = remoteResolved?.kind === "image"
    ? resolveServerAssetUrl(remoteResolved.value)
    : remoteResolved?.providerId
      ? getProviderIconUrlById(remoteResolved.providerId)
      : "";
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={`shrink-0 rounded-sm object-contain ${className ?? ""}`}
        loading="lazy"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
      />
    );
  }
  return <span className={`shrink-0 rounded-sm bg-muted text-[9px] font-semibold flex items-center justify-center ${className ?? ""}`} />;
}

function ModelList({
  groups,
  providers,
  providerNames,
  onEdit,
  onDelete,
  onAdd,
}: {
  groups: Record<string, LLMModel[]>;
  providers: { id: string; name: string; apiBase?: string; modelProvider?: string }[];
  providerNames: string[];
  onEdit: (m: LLMModel) => void;
  onDelete: (id: string) => void;
  onAdd: (provider?: string) => void;
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
      {sorted.map(provider => {
        const entity = providers.find(p => p.name === provider);
        const capabilities = getModelCapabilities(entity?.modelProvider);
        return (
        <div key={provider} id={`models-group-${provider}`}>
          <div className="group flex items-center gap-2 mb-2 px-1">
            <ProviderIcon
              apiBase={entity?.apiBase}
              modelProvider={entity?.modelProvider as never}
              modelId={groups[provider][0]?.modelId}
              className="size-4"
            />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {provider}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onAdd(provider)}
              title={t("dialog.add")}
            >
              <Plus className="size-3" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {groups[provider].map(model => (
              <div
                key={model.id}
                className="group flex items-start gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 hover:bg-muted/50 hover:border-border cursor-pointer transition-colors"
                onClick={() => onEdit(model)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium truncate">{model.name}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[11px] text-muted-foreground font-mono truncate">{model.modelId}</span>
                    {model.cost ? (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        ${formatCost(model.cost.inputPerMillion)}/${formatCost(model.cost.outputPerMillion)}
                      </span>
                    ) : null}
                    {model.maxContextTokens ? (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {formatTokenLimit(model.maxContextTokens)} {t("list.contextAbbr")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                    {capabilities.map(cap =>
                      model[cap] ? (
                        <Badge key={cap} variant="outline" className={`text-[10px] h-5 px-1.5 ${CAP_CLS[cap]}`}>
                          {t(`capability.${cap}`)}
                        </Badge>
                      ) : null
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={e => { e.stopPropagation(); onDelete(model.id); }}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        );
      })}
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
  providers,
  editing,
  onChange,
  catalog,
}: {
  draft: Partial<LLMModel>;
  providerNames: string[];
  providers: { id: string; name: string; apiBase?: string; modelProvider?: string }[];
  editing: boolean;
  onChange: (key: string, value: unknown) => void;
  catalog: ReturnType<typeof useLLMStore.getState>["catalog"];
}) {
  const t = useTranslations("models");
  const nameEditedByUser = useRef(false);
  const [contextIdx, setContextIdx] = useState(() => getContextSliderIndex(draft.maxContextTokens));
  const [showAllModels, setShowAllModels] = useState(false);
  const options = providerNames.length > 0 ? [...providerNames, "Other"] : ["Other"];
  // 多选模式：modelId 含逗号，隐藏表单细节字段，交由后端按 catalog 自动填充
  const isMulti = (draft.modelId ?? "").includes(",");
  // 当前模型是否支持 reasoning（不支持时禁用 thinking 开关）
  const supportsReasoning = draft.reasoning === true;

  const catalogModels = catalog?.models ?? {};
  const catalogProviders = catalog?.providers ?? {};
  const currentProvider = useMemo(
    () => providers.find((provider) => provider.name === draft.provider),
    [providers, draft.provider],
  );
  const currentModelProvider = currentProvider?.modelProvider;
  const availableCapabilities = getModelCapabilities(currentModelProvider);
  const resolvedCurrentApiBase = currentProvider?.apiBase ?? "";

  // 当前 provider 对应的 apiBase（用于按 host 匹配 catalog 模型）

  // catalog 是否存在任何模型（用于决定渲染 SearchSelect 还是 Input）
  const hasCatalogModels = useMemo(() => {
    for (const pid of Object.keys(catalogProviders)) {
      const pModels = catalogProviders[pid]?.models;
      if (pModels && Object.keys(pModels).length > 0) return true;
    }
    return false;
  }, [catalogProviders]);

  // 选项为去重的模型名称列表（不分组）：遍历 providers.models（含 cost）
  // showAllModels 关闭时仅展示与当前 provider 同 host 的模型
  const modelOptions = useMemo(() => {
    const targetHost = resolvedCurrentApiBase ? normalizeHost(resolvedCurrentApiBase) : "";
    const seen = new Set<string>();
    const opts: { value: string; label?: string }[] = [];
    for (const pid of Object.keys(catalogProviders)) {
      const p = catalogProviders[pid];
      if (!showAllModels && targetHost) {
        const host = normalizeHost(p.api ?? "");
        if (host !== targetHost) continue;
      }
      const pModels = p.models ?? {};
      for (const mid of Object.keys(pModels)) {
        if (seen.has(mid)) continue;
        seen.add(mid);
        const m = pModels[mid];
        opts.push({ value: mid, label: m.name || mid });
      }
    }
    return opts.sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value));
  }, [catalogProviders, showAllModels, resolvedCurrentApiBase]);

  // 从 catalog 查模型：优先在 providers.models 里查（含 cost），其次顶层 models
  const findCatalogModel = useCallback((modelId: string): { model?: CatalogModel; providerName?: string } => {
    for (const pid of Object.keys(catalogProviders)) {
      const p = catalogProviders[pid];
      const m = p?.models?.[modelId];
      if (m) return { model: m, providerName: p.name || pid };
    }
    const top = catalogModels[modelId];
    return top ? { model: top } : {};
  }, [catalogModels, catalogProviders]);

  useEffect(() => {
    if (!isOpenAIResponsesModelProvider(currentModelProvider) && draft.image) {
      onChange("image", false);
    }
  }, [currentModelProvider, draft.image, onChange]);

  // 选择 modelId（含自定义输入）后自动填充属性
  // 多选时 value 为逗号拼接，属性交由后端按 catalog 自动填充，前端仅回退名称
  const handleModelIdChange = useCallback((value: string) => {
    onChange("modelId", value);
    const ids = value.split(",").map((s) => s.trim()).filter(Boolean);
    const firstId = ids[0] ?? value;
    if (!nameEditedByUser.current) {
      const { model } = findCatalogModel(firstId);
      onChange("name", model?.name || firstId);
    }
    // 多选：其余字段由后端按 catalog 自动填充
    if (value.includes(",")) return;
    const { model, providerName } = findCatalogModel(firstId);
    if (!model) return;
    if (typeof model.limit?.context === "number" && model.limit.context > 0) {
      onChange("maxContextTokens", model.limit.context);
      setContextIdx(getContextSliderIndex(model.limit.context));
    }
    if (model.cost) {
      // catalog 价格优先；缺失项回退到 0（而非旧 draft，避免显示陈旧值）
      onChange("cost", {
        inputPerMillion: typeof model.cost.input === "number" ? model.cost.input : 0,
        outputPerMillion: typeof model.cost.output === "number" ? model.cost.output : 0,
      });
    }
    const inputs = model.modalities?.input ?? [];
    const outputs = model.modalities?.output ?? [];
    const supportsVision = model.attachment === true || inputs.includes("image");
    const supportsReasoning = model.reasoning === true;
    const supportsImage = supportsCatalogImageCapability(currentModelProvider, outputs);
    onChange("vision", supportsVision);
    onChange("reasoning", supportsReasoning);
    onChange("image", supportsImage);
    // thinking 仅在模型支持 reasoning 时启用；不支持则关闭并禁用开关
    onChange("thinkingEnabled", supportsReasoning);
    // 仅在未选择 provider 时回填 catalog 的 providerName，避免覆盖用户已选的本地 provider
    // 覆盖会导致 provider 名与本地 provider 不匹配，进而 host 过滤失效（回退展示全部）
    if (providerName && !draft.provider) onChange("provider", providerName);
  }, [onChange, findCatalogModel, currentModelProvider, draft.cost]);
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.details")}</div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">{t("form.modelId")}</label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox checked={showAllModels} onCheckedChange={v => setShowAllModels(v === true)} />
              <span className="text-xs text-muted-foreground">{t("form.showAllModels")}</span>
            </label>
          </div>
          {hasCatalogModels ? (
            <SearchSelect
              value={draft.modelId || ""}
              onChange={handleModelIdChange}
              options={modelOptions}
              placeholder={t("form.modelIdPlaceholder")}
              searchPlaceholder={t("form.modelIdSearch")}
              allowCustom
              multiple={!editing}
            />
          ) : (
            <Input value={draft.modelId || ""} onChange={e => {
              const val = e.target.value;
              onChange("modelId", val);
              if (!nameEditedByUser.current) onChange("name", val);
            }} placeholder={t("form.modelIdPlaceholder")} />
          )}
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

      {!isMulti && (
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
      )}

      {!isMulti && (
      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.thinking")}</div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-input px-3 py-2">
          <div className="min-w-0">
            <label className="text-sm font-medium">{t("form.enableThinking")}</label>
            <p className="text-xs text-muted-foreground">
              {supportsReasoning ? t("form.enableThinkingHelper") : t("form.thinkingNotSupported")}
            </p>
          </div>
          <Switch
            checked={supportsReasoning ? (draft.thinkingEnabled ?? true) : false}
            disabled={!supportsReasoning}
            onCheckedChange={(checked) => onChange("thinkingEnabled", checked)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.effort")}</label>
          <select
            value={draft.thinkingEffort || "medium"}
            onChange={e => onChange("thinkingEffort", e.target.value)}
            disabled={!supportsReasoning || !(draft.thinkingEnabled ?? true)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          >
            {THINKING_EFFORT_OPTIONS.map(effort => (
              <option key={effort} value={effort}>{effort}</option>
            ))}
          </select>
        </div>
      </div>
      )}

      {!isMulti && (
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
      )}

      {!isMulti && (
      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.capabilities")}</div>
        <div className="flex items-center gap-1.5">
          {availableCapabilities.map(cap => {
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
      )}
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
