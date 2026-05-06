"use client";

import { useEffect, useState } from "react";
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
import {
  ArrowLeft,
  Server,
  Plus,
  Trash2,
  Brain,
  ExternalLink,
} from "lucide-react";
import { useLLMStore } from "@/stores/llm";

const CAP_CLS: Record<string, string> = {
  vision: "bg-blue-500/10 text-blue-600 border-blue-200",
  reasoning: "bg-purple-500/10 text-purple-600 border-purple-200",
  embedding: "bg-green-500/10 text-green-600 border-green-200",
};

export function ProvidersDialog({
  open,
  onOpenChange,
  onAddModel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddModel: (providerName: string) => void;
}) {
  const { models: allModels, providers, ensure, addProvider, updateProvider, removeProvider } = useLLMStore();
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
  }, [open, ensure]);

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
      const res = await fetch(isNew ? "/api/providers" : `/api/providers/${selected!.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error();
      const saved: LLMProvider = await res.json();
      if (isNew) addProvider(saved); else updateProvider(saved);
      handleBack();
    } catch {
      setError("Failed to save provider");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this provider?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      removeProvider(id);
      if (selected?.id === id) handleBack();
    } catch {
      setError("Failed to delete provider");
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (key: string, value: unknown) => {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const getModelsForProvider = (providerName: string) =>
    allModels.filter(m => m.provider === providerName);

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
              {draft ? (selected ? "Edit Provider" : "Add Provider") : "Providers"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {draft ? "Configure provider connection settings" : "Manage LLM API providers"}
            </DialogDescription>
          </DialogHeader>
          {!draft && (
            <Button variant="outline" size="sm" onClick={handleAdd} className="mr-6">
              <Plus className="size-3.5" />
              Add
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
            <div className="py-12 text-center text-sm text-muted-foreground">Loading providers...</div>
          ) : draft ? (
            <ProviderForm draft={draft} onChange={updateDraft} />
          ) : (
            <ProviderList
              providers={providers}
              providerModels={providers.map(p => ({ id: p.id, models: getModelsForProvider(p.name) }))}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAddModel={(providerName) => { onOpenChange(false); onAddModel(providerName); }}
            />
          )}
        </div>

        {draft && (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !draft.name}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
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
  return (
    <div className="flex flex-col p-2">
      {providers.map(provider => {
        const pm = providerModels.find(p => p.id === provider.id);
        const models = pm?.models ?? [];
        return (
          <div
            key={provider.id}
            className="group rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => onEdit(provider)}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <Server className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{provider.name}</span>
                <p className="text-xs text-muted-foreground truncate">{provider.apiBase || "No API base configured"}</p>
              </div>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {models.length} models
              </Badge>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); onDelete(provider.id); }}
              >
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </div>
            {models.length > 0 && (
              <div className="mt-2 ml-11 flex flex-wrap gap-1">
                {models.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <Brain className="size-3" />
                    {m.name}
                    {(["vision", "reasoning", "embedding"] as const).map(cap =>
                      m[cap] ? (
                        <span key={cap} className={`inline-block rounded px-1 text-[9px] font-medium border ${CAP_CLS[cap]}`}>
                          {cap[0].toUpperCase()}
                        </span>
                      ) : null
                    )}
                  </span>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="xs"
              className="mt-1 ml-11 h-6 text-[11px] text-muted-foreground"
              onClick={e => { e.stopPropagation(); onAddModel(provider.name); }}
            >
              <ExternalLink className="size-3" />
              Add model
            </Button>
          </div>
        );
      })}
      {providers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Server className="size-10 mb-2 opacity-30" />
          <p className="text-sm">No providers yet</p>
        </div>
      )}
    </div>
  );
}

function ProviderForm({
  draft,
  onChange,
}: {
  draft: Partial<LLMProvider>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection</div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Name</label>
          <Input value={draft.name || ""} onChange={e => onChange("name", e.target.value)} placeholder="e.g. Anthropic" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">API Base</label>
          <Input value={draft.apiBase || ""} onChange={e => onChange("apiBase", e.target.value)} placeholder="https://api.anthropic.com" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">API Key</label>
          <Input type="password" value={draft.apiKey || ""} onChange={e => onChange("apiKey", e.target.value)} placeholder="sk-..." />
        </div>
      </div>
    </div>
  );
}
