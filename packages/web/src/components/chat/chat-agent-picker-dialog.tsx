"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreTabPanel } from "@/components/common/store-tab-panel";
import { Switch } from "@/components/ui/switch";
import { Bot, Download, FileText, Store, Plus, WandSparkles, Trash2, Pencil, Star } from "lucide-react";
import { fetchStoreIndex } from "@/lib/agent-store";
import { sdk } from "@/lib/sdk";
import type { AgentPreset } from "@/components/sidebar/agent-shared";
import type { StoreAgentItem, TabType } from "@/components/sidebar/agent-dialog-data";
import type { ChatAgent } from "@agent-spaces/sdk";
import { AgentCard } from "@/components/sidebar/agent-card";

interface ChatAgentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatAgents: ChatAgent[];
  selectedAgentIds?: Set<string>;
  onAdd: (preset: AgentPreset) => void;
  onAddToChat?: (id: string) => void;
  onRemoveAgent?: (id: string) => void;
  onRemoveFromChat?: (id: string) => void;
  onEditAgent?: (agent: ChatAgent) => void;
  onCreate?: () => void;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
}

export function ChatAgentPickerDialog({
  open,
  onOpenChange,
  chatAgents,
  selectedAgentIds,
  onAdd,
  onAddToChat,
  onRemoveAgent,
  onRemoveFromChat,
  onEditAgent,
  onCreate,
  favoriteIds,
  onToggleFavorite,
}: ChatAgentPickerDialogProps) {
  const t = useTranslations("agent");
  const tc = useTranslations("common");

  // ── Local tab ──
  const [localSearch, setLocalSearch] = useState("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // ── Store tab ──
  const [storeAgents, setStoreAgents] = useState<StoreAgentItem[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());

  // ── Smart create ──
  const [smartCreateOpen, setSmartCreateOpen] = useState(false);
  const [smartCreatePrompt, setSmartCreatePrompt] = useState("");
  const [smartCreating, setSmartCreating] = useState(false);

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<TabType>("local");

  // Track selected agents from the channel chat list
  useEffect(() => {
    if (!open) return;
    setLocalSearch("");
    setActiveTab("local");
    setAddedIds(new Set(selectedAgentIds ?? chatAgents.map((a) => a.id)));
  }, [open, selectedAgentIds, chatAgents]);

  // Fetch store agents on open
  useEffect(() => {
    if (!open) return;
    setStoreLoading(true);
    fetchStoreIndex<StoreAgentItem>("agents/index.json")
      .then(setStoreAgents)
      .catch(() => setStoreAgents([]))
      .finally(() => setStoreLoading(false));
  }, [open]);

  // ── Local filtering ──
  const filteredAgents = useMemo(() => {
    if (!localSearch) return chatAgents;
    const q = localSearch.toLowerCase();
    return chatAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q),
    );
  }, [chatAgents, localSearch]);

  // ── Handlers ──
  const handleAdd = useCallback(
    (agent: ChatAgent) => {
      setAddedIds((prev) => new Set(prev).add(agent.id));
      if (onAddToChat) {
        onAddToChat(agent.id);
        return;
      }
      onAdd({
        id: agent.id,
        name: agent.name,
        role: "agent",
        description: agent.description || "",
        avatarUrl: agent.avatarUrl || agent.avatar || "",
        icon: agent.icon || "",
        backgroundUrl: agent.backgroundUrl || "",
        runtimeKind: "langchain",
        modelProvider: (agent.modelProvider || agent.provider || "") as AgentPreset["modelProvider"],
        providerId: agent.providerId || "",
        modelId: agent.modelId || agent.model || "",
        apiBase: agent.apiBase || agent.baseURL || "",
        apiKey: agent.apiKey || "",
        workingDir: agent.workingDir || "",
        mcps: agent.mcps || {},
        skills: (agent.skills ?? []).map((skill) => (
          typeof skill === "string" ? { name: skill } : { name: skill.name, content: skill.content }
        )),
        tools: agent.tools || [],
        systemPrompt: agent.systemPrompt || "",
        outputStyle: agent.outputStyle || "",
        temperature: agent.temperature ?? 0.3,
        maxTokens: agent.maxTokens ?? 4096,
        enabled: agent.enabled ?? true,
      });
    },
    [onAdd, onAddToChat],
  );

  const handleImportFromStore = useCallback(
    async (storeAgent: StoreAgentItem) => {
      if (importingIds.has(storeAgent.id)) return;
      setImportingIds((prev) => new Set(prev).add(storeAgent.id));
      try {
        const base = (() => {
          const stored = localStorage.getItem("agent-spaces:store-api-base");
          return stored ? stored.replace(/\/+$/, "") : "/agents-store";
        })();
        const res = await fetch(`${base}/agents/${storeAgent.path}.md`);
        if (!res.ok) throw new Error("fetch failed");
        const content = await res.text();
        const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const body = content.slice(fm ? fm[0].length : 0).trim();
        let name = storeAgent.name;
        let description = storeAgent.description;
        if (fm) {
          for (const line of fm[1].split(/\r?\n/)) {
            const m = line.match(/^\s*(\w+)\s*:\s*(.+)/);
            if (!m) continue;
            if (m[1] === "name") name = m[2].trim();
            else if (m[1] === "description") description = m[2].trim();
          }
        }
        onAdd({
          id: `store-${storeAgent.id}`,
          name,
          role: "agent",
          description: description || "",
          avatarUrl: "",
          icon: storeAgent.emoji || "",
          backgroundUrl: "",
          runtimeKind: "langchain",
          modelProvider: "",
          providerId: "",
          modelId: "",
          apiBase: "",
          apiKey: "",
          workingDir: "",
          mcps: {},
          skills: [],
          tools: [],
          systemPrompt: body,
          outputStyle: "",
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
        });
      } catch { /* ignore */ }
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(storeAgent.id);
        return next;
      });
    },
    [importingIds, onAdd],
  );

  const handleSmartCreate = useCallback(async () => {
    const prompt = smartCreatePrompt.trim();
    if (!prompt) return;
    setSmartCreating(true);
    try {
      const data = await sdk.agent.generateFromPrompt(prompt) as Partial<Pick<AgentPreset, "name" | "description" | "systemPrompt">> & { error?: string };
      if (data.error) throw new Error(data.error);
      onAdd({
        id: `smart-${Date.now()}`,
        name: data.name?.trim() || "New Agent",
        role: "agent",
        description: data.description?.trim() || "",
        avatarUrl: "",
        icon: "",
        backgroundUrl: "",
        runtimeKind: "langchain",
        modelProvider: "",
        providerId: "",
        modelId: "",
        apiBase: "",
        apiKey: "",
        workingDir: "",
        mcps: {},
        skills: [],
        tools: [],
        systemPrompt: data.systemPrompt?.trim() || "",
        outputStyle: "",
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
      });
      setSmartCreateOpen(false);
      setSmartCreatePrompt("");
    } catch { /* ignore */ }
    setSmartCreating(false);
  }, [smartCreatePrompt, onAdd]);

  // ── Tabs ──
  const tabs = (
    <div className="flex items-center gap-1 rounded-md bg-muted/50 p-0.5">
      {(
        [
          ["local", FileText, t("dialog.tabLocal")],
          ["store", Store, t("dialog.tabStore")],
        ] as [TabType, typeof FileText, string][]
      ).map(([key, Icon, label]) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            activeTab === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  // ── Local list (data from chat store via chatAgents prop) ──
  const localView = (
    <div className="flex flex-1 min-h-0 flex-col pt-2">
      <div className="relative mb-3 px-2">
        <Bot className="size-3.5 absolute left-4.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder={t("dialog.searchLocal")}
          className="pl-8"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bot className="size-10 mb-2 opacity-30" />
            <p className="text-sm">{t("dialog.noAgentsAvailable")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2">
            {filteredAgents.map((agent) => {
              const added = addedIds.has(agent.id);
              return (
                <AgentCard
                  key={agent.id}
                  agentId={agent.id}
                  name={agent.name}
                  description={agent.description || t("dialog.noDescription")}
                  avatarUrl={agent.avatar}
                  icon={agent.icon}
                  onContentClick={onEditAgent ? () => onEditAgent(agent) : undefined}
                  meta={
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {agent.model}
                    </span>
                  }
                  corner={
                    <Switch
                      size="sm"
                      checked={added}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          handleAdd(agent);
                        } else {
                          setAddedIds((prev) => {
                            const next = new Set(prev);
                            next.delete(agent.id);
                            return next;
                          });
                          onRemoveFromChat?.(agent.id);
                        }
                      }}
                    />
                  }
                  actions={
                    <>
                      {onToggleFavorite && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`size-7 opacity-0 group-hover:opacity-100 transition-opacity ${favoriteIds?.has(agent.id) ? '!opacity-100 text-yellow-500' : ''}`}
                          onClick={() => onToggleFavorite(agent.id)}
                        >
                          <Star className={`size-3.5 ${favoriteIds?.has(agent.id) ? 'fill-current' : ''}`} />
                        </Button>
                      )}
                      {onEditAgent && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity"
                          onClick={() => onEditAgent(agent)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {onRemoveAgent && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          onClick={() => {
                            setAddedIds((prev) => {
                              const next = new Set(prev);
                              next.delete(agent.id);
                              return next;
                            });
                            onRemoveAgent(agent.id);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ── Store list ──
  const chatAgentNames = new Set(chatAgents.map((a) => a.name));
  const storeView = (
    <StoreTabPanel<StoreAgentItem>
      items={storeAgents}
      loading={storeLoading}
      getGroup={(a) => a.group}
      getId={(a) => a.id}
      allFilterText={t("dialog.filterAll")}
      searchPlaceholder={t("dialog.searchStore")}
      emptyText={t("dialog.storeEmpty")}
      loadingText={tc("loading")}
      gridClassName="grid-cols-2 lg:grid-cols-3"
      renderItem={(agent) => {
        const isImported = chatAgentNames.has(agent.name);
        const isImporting = importingIds.has(agent.id);
        return (
          <AgentCard
            agentId={agent.id}
            icon={agent.emoji || "🤖"}
            name={agent.name}
            description={agent.description}
            meta={
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {agent.group}
              </span>
            }
            actions={
              <Button
                variant={isImported ? "ghost" : "outline"}
                size="sm"
                className="shrink-0"
                disabled={isImported || isImporting}
                onClick={() => handleImportFromStore(agent)}
              >
                {isImported ? (
                  t("dialog.imported")
                ) : isImporting ? (
                  t("dialog.importing")
                ) : (
                  <>
                    <Download className="size-3.5 mr-1" />
                    {t("dialog.importTo")}
                  </>
                )}
              </Button>
            }
          />
        );
      }}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[80vw] h-[70vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-5 pr-12 py-4">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="size-4 text-primary" />
            </div>
            <DialogHeader className="flex-1 space-y-0">
              <DialogTitle className="text-base">{t("dialog.addToChatTitle")}</DialogTitle>
              <DialogDescription className="text-xs">
                {t("dialog.addToChatDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              {tabs}
              {onCreate && (
                <Button variant="outline" size="sm" onClick={onCreate}>
                  <Plus className="size-3.5" />
                  {t("dialog.add")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setSmartCreateOpen(true)}>
                <WandSparkles className="size-3.5" />
                {t('agentPicker.smartCreate')}
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            {activeTab === "local" ? localView : storeView}
          </div>
        </DialogContent>
      </Dialog>

      {/* Smart Create Dialog */}
      <Dialog open={smartCreateOpen} onOpenChange={setSmartCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('agentPicker.smartCreateTitle')}</DialogTitle>
            <DialogDescription>{t('agentPicker.smartCreateDesc')}</DialogDescription>
          </DialogHeader>
          <Input
            value={smartCreatePrompt}
            onChange={(e) => setSmartCreatePrompt(e.target.value)}
            placeholder={t('agentPicker.smartCreatePlaceholder')}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSmartCreate(); } }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSmartCreateOpen(false)}>{t('agentPicker.cancel')}</Button>
            <Button onClick={handleSmartCreate} disabled={smartCreating || !smartCreatePrompt.trim()}>
              {smartCreating ? t('agentPicker.generating') : t('agentPicker.generate')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
