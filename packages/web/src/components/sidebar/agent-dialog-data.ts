import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { type AgentConfig } from "@agent-spaces/shared";
import { sdk } from "@/lib/sdk";
import { useAgentStore } from "@/stores/agent";
import { fetchStoreIndex } from "@/lib/agent-store";
import {
  type AgentPreset,
  type AgentRole,
  type BuiltInRole,
  ROLE_OPTIONS,
  normalizeAgent,
  newAgentDraft,
  newEmptyAgent,
} from "./agent-shared";
import { type AgentEditorHandle } from "./agent-editor";

export const AGENT_GENERATOR_PRESET_ID = "agent-generator";
export const AGENT_COMMIT_PRESET_ID = "commit-agent";
export const AGENT_TITLE_GENERATOR_PRESET_ID = "title-generator";
export const FIXED_AGENT_IDS = new Set([
  AGENT_GENERATOR_PRESET_ID,
  AGENT_COMMIT_PRESET_ID,
  AGENT_TITLE_GENERATOR_PRESET_ID,
]);

export type TabType = "local" | "store";

export interface StoreAgentItem {
  id: string;
  name: string;
  group: string;
  path: string;
  description: string;
  emoji: string;
}

export function useAgentDialogData({
  open,
  initialAgentId,
  presetBasePath,
  singleAgent,
  roleFilter,
  onOpenChange,
}: {
  open: boolean;
  initialAgentId?: string;
  presetBasePath: string;
  singleAgent: boolean;
  roleFilter?: AgentRole | AgentRole[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("agent");
  const tc = useTranslations("common");
  const editorRef = useRef<AgentEditorHandle>(null);
  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentPreset | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("local");
  const [roleFilterLocal, setRoleFilterLocal] = useState<string>("");
  const [localSearch, setLocalSearch] = useState("");
  const [storeAgents, setStoreAgents] = useState<StoreAgentItem[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  const roleFilterSet = roleFilter
    ? new Set(Array.isArray(roleFilter) ? roleFilter : [roleFilter])
    : null;

  const visibleAgents = (
    roleFilterSet
      ? agents.filter((agent) => FIXED_AGENT_IDS.has(agent.id) || roleFilterSet.has(agent.role))
      : agents
  ).filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index);

  const addRoleOptions = Array.from(
    new Set(roleFilterSet ? ROLE_OPTIONS.filter((role) => roleFilterSet.has(role)) : ROLE_OPTIONS),
  );

  const filteredAgents = visibleAgents.filter((agent) => {
    if (roleFilterLocal && agent.role !== roleFilterLocal) {
      if (!(roleFilterLocal === "system" && FIXED_AGENT_IDS.has(agent.id))) return false;
    }
    if (localSearch) {
      const q = localSearch.toLowerCase();
      if (!agent.name.toLowerCase().includes(q) && !(agent.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const uniqueRoles = Array.from(new Set(visibleAgents.map((a) => a.role)));
  const hasSystemAgents = visibleAgents.some((a) => FIXED_AGENT_IDS.has(a.id));
  const localAgentNames = new Set(agents.map((a) => a.name));

  const fetchStoreAgents = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await fetchStoreIndex<StoreAgentItem>("agents/index.json");
      setStoreAgents(data);
    } catch { /* ignore */ }
    setStoreLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    sdk.agent.listPresets()
      .then((data) => {
        const list = data as AgentConfig[];
        const normalized = list.map(normalizeAgent);
        setAgents(normalized);
        if (initialAgentId) {
          const target = normalized.find((a) => a.id === initialAgentId);
          if (target) setSelectedAgent(target);
        } else if (singleAgent && normalized[0]) {
          setSelectedAgent(normalized[0]);
        }
      })
      .catch((err) => {
        setError(t("error.loadFailed"));
      })
      .finally(() => setLoading(false));
    fetchStoreAgents();
  }, [open, initialAgentId, presetBasePath, singleAgent, t, fetchStoreAgents]);

  const handleSelectAgent = (agent: AgentPreset) => {
    setSelectedAgent(agent);
  };

  const handleBack = () => {
    setSelectedAgent(null);
    setAutoGenerate(false);
  };

  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Parse a JSON string (single object or array) into AgentConfig-ish presets.
  const parseAgentsJson = (text: string): Partial<AgentConfig>[] | null => {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed as Partial<AgentConfig>[];
      if (parsed && typeof parsed === "object") {
        // support { agents: [...] } wrapper
        if (Array.isArray((parsed as any).agents)) return (parsed as any).agents;
        return [parsed as Partial<AgentConfig>];
      }
      return null;
    } catch {
      return null;
    }
  };

  const runAgentImport = async (text: string) => {
    setImportError("");
    const configs = parseAgentsJson(text);
    if (!configs) {
      setImportError(t("dialog.importInvalidJson"));
      return;
    }
    let count = 0;
    for (const cfg of configs) {
      try {
        await sdk.agent.createPreset(cfg);
        count++;
      } catch { /* skip invalid */ }
    }
    setImportText("");
    setImportOpen(false);
    setTextDialogOpen(false);
    if (count > 0) {
      const list = await sdk.agent.listPresets();
      setAgents(list.map(normalizeAgent));
      setError(null);
    } else {
      setImportError(t("dialog.importFailed"));
    }
  };

  const handleImportAgentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await runAgentImport(text);
    e.target.value = "";
  };

  const handleAddAgent = (role: BuiltInRole | "empty") => {
    const draft = role === "empty" ? newEmptyAgent() : newAgentDraft(role);
    setError(null);
    setSelectedAgent(draft);
  };

  const handleToggleEnabled = async (id: string) => {
    if (FIXED_AGENT_IDS.has(id)) return;
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
    await useAgentStore.getState().toggleEnabled(id);
  };

  const handleDeleteAgent = async (id: string) => {
    if (FIXED_AGENT_IDS.has(id)) return;
    if (id.startsWith("draft-")) {
      setSelectedAgent(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await sdk.agent.deletePreset(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      useAgentStore.setState((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
      }));
      if (selectedAgent?.id === id) setSelectedAgent(null);
    } catch {
      setError(t("error.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleEditorSaved = (saved: AgentPreset) => {
    setAgents((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      return exists ? prev.map((agent) => (agent.id === saved.id ? saved : agent)) : [...prev, saved];
    });
    if (singleAgent) {
      onOpenChange(false);
      return;
    }
    setSelectedAgent(null);
    setAutoGenerate(false);
  };

  const handleSyncTemplates = async () => {
    setSyncingTemplates(true);
    setError(null);
    try {
      await sdk.agent.syncWorkspaces();
    } catch {
      setError(t("error.syncFailed"));
    } finally {
      setSyncingTemplates(false);
    }
  };

  const importFromStore = async (storeAgent: StoreAgentItem) => {
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
      const payload = {
        name,
        role: "agent" as const,
        description,
        runtimeKind: "claude-code" as const,
        modelProvider: "anthropic-messages" as const,
        modelId: "claude-sonnet-4-6",
        systemPrompt: body,
        icon: storeAgent.emoji || "",
        enabled: true,
      };
      await sdk.agent.createPreset(payload);
      const list = await sdk.agent.listPresets();
      setAgents(list.map(normalizeAgent));
    } catch { /* ignore */ }
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(storeAgent.id);
      return next;
    });
  };

  return {
    agents, selectedAgent, autoGenerate, loading, saving, syncingTemplates, error,
    activeTab, roleFilterLocal, localSearch,
    storeAgents, storeLoading, importingIds,
    visibleAgents, filteredAgents, addRoleOptions, uniqueRoles, hasSystemAgents, localAgentNames,
    roleFilterSet,
    editorRef,
    setSelectedAgent, setAutoGenerate, setActiveTab, setRoleFilterLocal, setLocalSearch,
    handleSelectAgent, handleBack, handleAddAgent, handleToggleEnabled,
    handleDeleteAgent, handleEditorSaved, handleSyncTemplates, importFromStore,
    importOpen, setImportOpen, textDialogOpen, setTextDialogOpen,
    importText, setImportText, importError, setImportError,
    jsonInputRef, handleImportAgentFile, runAgentImport,
    t, tc,
  };
}
