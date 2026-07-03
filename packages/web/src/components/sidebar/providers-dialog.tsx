"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { LLMProvider, LLMModel } from "@agent-spaces/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchSelect } from "@/components/ui/search-select";
import { AgentIcon } from "@/components/common/agent-icon";
import {
  ArrowLeft,
  Server,
  Plus,
  Trash2,
  Brain,
  ExternalLink,
} from "lucide-react";
import { useLLMStore } from "@/stores/llm";
import type { ModelCatalog } from "@/stores/llm";
import { sdk } from "@/lib/sdk";
import { findCatalogProviderByApiBase, inferApiMessageTypeFromCatalogProvider } from "@/lib/model-catalog";
import { PROVIDER_OPTIONS } from "./agent-shared";
import { CAP_CLS, getModelCapabilities } from "./model-capabilities";

export function ProvidersDialog({
  open,
  onOpenChange,
  onAddModel,
  standalone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddModel: (providerName: string) => void;
  standalone?: boolean;
}) {
  const t = useTranslations("providers");
  const tc = useTranslations("common");
  const {
    models: allModels,
    providers,
    catalog,
    ensure,
    loadCatalog,
    addProvider,
    updateProvider,
    removeProvider,
  } = useLLMStore();
  const [selected, setSelected] = useState<LLMProvider | null>(null);
  const [draft, setDraft] = useState<Partial<LLMProvider> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    ensure().finally(() => setLoading(false));
    void loadCatalog();
  }, [open, ensure, loadCatalog]);

  const handleBack = () => { setSelected(null); setDraft(null); };

  const handleAdd = () => {
    setSelected(null);
    setDraft({ name: "", apiBase: "", apiKey: "" });
  };

  const handleEdit = (p: LLMProvider) => {
    setSelected(p);
    setDraft({ ...p });
  };

  const handleSave = async () => {
    if (!draft || !draft.name) return;
    setSaving(true);
    setError(null);
    try {
      const isNew = !selected;
      const saved: LLMProvider = isNew
        ? await sdk.llm.createProvider(draft)
        : await sdk.llm.updateProvider(selected!.id, draft);
      if (isNew) addProvider(saved); else updateProvider(saved);
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
      await sdk.llm.deleteProvider(id);
      removeProvider(id);
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

  const getModelsForProvider = (providerName: string) =>
    allModels.filter(m => m.provider === providerName);

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
            <Button variant="outline" size="sm" onClick={handleAdd} className="mr-6">
              <Plus className="size-3.5" />
              {t("dialog.add")}
            </Button>
          )}
        </div>
      )}
      {standalone && !draft && (
        <div className="flex items-center justify-end px-5 py-3 border-b">
          <Button variant="outline" size="sm" onClick={handleAdd}>
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
          <ProviderForm draft={draft} catalog={catalog} onChange={updateDraft} />
        ) : (
          <ProviderList
            providers={providers}
            providerModels={providers.map(p => ({ id: p.id, models: getModelsForProvider(p.name) }))}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddModel={(providerName) => { if (!standalone) onOpenChange(false); onAddModel(providerName); }}
          />
        )}
      </div>

      {draft && (
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>{tc("cancel")}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !draft.name}>
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
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        {content}
      </DialogContent>
    </Dialog>
  );
}

function ProviderList({
  providers,
  providerModels,
  onEdit,
  onDelete,
  onAddModel,
}: {
  providers: LLMProvider[];
  providerModels: Array<{ id: string; models: LLMModel[] }>;
  onEdit: (p: LLMProvider) => void;
  onDelete: (id: string) => void;
  onAddModel: (providerName: string) => void;
}) {
  const t = useTranslations("providers");
  return (
    <div className="flex flex-col p-2">
      {providers.map(provider => {
        const pm = providerModels.find(p => p.id === provider.id);
        const models = pm?.models ?? [];
        const capabilities = getModelCapabilities(provider.modelProvider);
        return (
          <div
            key={provider.id}
            className="group rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => onEdit(provider)}
          >
            <div className="flex items-center gap-3">
              <AgentIcon
                name={provider.name}
                apiBase={provider.apiBase}
                className="size-8 rounded-lg"
                bordered={false}
                textSize="text-[10px]"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{provider.name}</span>
                <p className="text-xs text-muted-foreground truncate">{provider.apiBase || t("list.noApiBase")}</p>
              </div>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {models.length} {t("list.modelsCount")}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); onDelete(provider.id); }}
              >
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </div>
            {models.length > 0 && (
              <div className="mt-2 ml-11 flex flex-wrap gap-1">
                {models.map(m => (
                  <Badge key={m.id} variant="secondary" className="text-[11px] h-5 gap-1 px-1.5 font-normal">
                    <span className="max-w-[120px] truncate">{m.name}</span>
                    {capabilities.map(cap =>
                      m[cap] ? (
                        <span key={cap} className={`inline-block rounded px-1 text-[9px] font-medium border ${CAP_CLS[cap]}`}>
                          {cap[0].toUpperCase()}
                        </span>
                      ) : null
                    )}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 ml-11 h-6 text-[11px] text-muted-foreground"
              onClick={e => { e.stopPropagation(); onAddModel(provider.name); }}
            >
              <ExternalLink className="size-3" />
              {t("list.addModel")}
            </Button>
          </div>
        );
      })}
      {providers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Server className="size-10 mb-2 opacity-30" />
          <p className="text-sm">{t("list.empty")}</p>
        </div>
      )}
    </div>
  );
}

function ProviderForm({
  draft,
  catalog,
  onChange,
}: {
  draft: Partial<LLMProvider>;
  catalog: ModelCatalog | null;
  onChange: (key: string, value: unknown) => void;
}) {
  const t = useTranslations("providers");
  const ta = useTranslations("agent");
  const selectedCatalogProviderId = useMemo(
    () => {
      const byApiBase = findCatalogProviderByApiBase(catalog, draft.apiBase)?.id;
      if (byApiBase) return byApiBase;
      if (!catalog?.providers || !draft.name) return "";
      const lowerName = draft.name.toLowerCase();
      return Object.entries(catalog.providers).find(([, provider]) => String(provider.name ?? "").toLowerCase() === lowerName)?.[0] ?? "";
    },
    [catalog, draft.apiBase, draft.name],
  );
  const catalogOptions = useMemo(() => {
    if (!catalog?.providers) return [];
    return Object.entries(catalog.providers).map(([id, provider]) => {
      const modelProvider = inferApiMessageTypeFromCatalogProvider(provider);
      const group = modelProvider
        ? ta(`provider.${PROVIDER_OPTIONS.find((option) => option.value === modelProvider)?.labelKey ?? "openaiChatCompletions"}`)
        : undefined;
      return {
        value: id,
        label: provider.name ?? id,
        description: provider.api ?? provider.npm ?? id,
        keywords: [id, provider.name ?? "", provider.api ?? "", provider.npm ?? ""],
        group,
      };
    });
  }, [catalog, ta]);

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("form.connection")}</div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.vendor")}</label>
          <SearchSelect
            value={selectedCatalogProviderId}
            onChange={(providerId) => {
              const provider = catalog?.providers?.[providerId];
              if (!provider) return;
              onChange("name", provider.name || draft.name || "");
              onChange("apiBase", provider.api || "");
              onChange("modelProvider", inferApiMessageTypeFromCatalogProvider(provider) || undefined);
            }}
            options={catalogOptions}
            placeholder={t("form.vendorPlaceholder")}
            searchPlaceholder={t("form.vendorPlaceholder")}
            allowCustom={false}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.name")}</label>
          <Input value={draft.name || ""} onChange={e => onChange("name", e.target.value)} placeholder={t("form.namePlaceholder")} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.apiBase")}</label>
          <Input value={draft.apiBase || ""} onChange={e => onChange("apiBase", e.target.value)} placeholder={t("form.apiBasePlaceholder")} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.apiKey")}</label>
          <Input type="password" value={draft.apiKey || ""} onChange={e => onChange("apiKey", e.target.value)} placeholder={t("form.apiKeyPlaceholder")} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.apiMessageType")}</label>
          <SearchSelect
            value={(draft.modelProvider as string) || ""}
            onChange={v => onChange("modelProvider", v || undefined)}
            options={PROVIDER_OPTIONS.map(option => ({ value: option.value, label: ta(`provider.${option.labelKey}`) }))}
            placeholder={t("form.apiMessageTypePlaceholder")}
            searchPlaceholder={t("form.apiMessageTypePlaceholder")}
            allowCustom={false}
          />
        </div>
      </div>
    </div>
  );
}
