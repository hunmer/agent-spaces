"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { type AgentConfig } from "@agent-spaces/shared";
import { useAgentStore } from "@/stores/agent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Plus,
} from "lucide-react";
import {
  type AgentPreset,
  type AgentRole,
  type BuiltInRole,
  type ConnectionTestResult,
  ROLE_COLORS,
  ROLE_OPTIONS,
  normalizeAgent,
  serializeAgent,
  newAgentDraft,
  newEmptyAgent,
  isDraftAgent,
  isAnthropicBridgeProvider,
} from "./agent-shared";
import { AgentList } from "./agent-list";
import { AgentDetail } from "./agent-detail";

export function AgentDialog({
  open,
  onOpenChange,
  workspaceId,
  roleFilter,
  initialAgentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  roleFilter?: AgentRole | AgentRole[];
  initialAgentId?: string;
}) {
  const t = useTranslations('agent');
  const tc = useTranslations('common');
  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentPreset | null>(null);
  const [editDraft, setEditDraft] = useState<AgentPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roleFilterSet = roleFilter
    ? new Set(Array.isArray(roleFilter) ? roleFilter : [roleFilter])
    : null;
  const visibleAgents = roleFilterSet ? agents.filter((agent) => roleFilterSet.has(agent.role)) : agents;
  const addRoleOptions = roleFilterSet ? ROLE_OPTIONS.filter((role) => roleFilterSet.has(role)) : ROLE_OPTIONS;

  useEffect(() => {
    if (!open || !workspaceId) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetch(`/api/workspaces/${workspaceId}/agents/presets`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<AgentConfig[]>;
      })
      .then((data) => {
        const normalized = data.map(normalizeAgent);
        setAgents(normalized);
        if (initialAgentId) {
          const target = normalized.find((a) => a.id === initialAgentId);
          if (target) {
            setSelectedAgent(target);
            setEditDraft({ ...target });
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(t('error.loadFailed'));
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [open, workspaceId, initialAgentId, t]);

  const handleSelectAgent = (agent: AgentPreset) => {
    setSelectedAgent(agent);
    setEditDraft({ ...agent });
  };

  const handleBack = () => {
    setSelectedAgent(null);
    setEditDraft(null);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!workspaceId || !editDraft) return;

    setSaving(true);
    setError(null);
    try {
      const isDraft = isDraftAgent(editDraft);
      const createBody = serializeAgent(editDraft);
      const res = await fetch(
        isDraft
          ? `/api/workspaces/${workspaceId}/agents/presets`
          : `/api/workspaces/${workspaceId}/agents/presets/${editDraft.id}`,
        {
          method: isDraft ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isDraft ? createBody : editDraft),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const raw = (await res.json()) as AgentConfig;
      const saved = normalizeAgent(raw);
      setAgents((prev) =>
        isDraft
          ? [...prev, saved]
          : prev.map((agent) => (agent.id === saved.id ? saved : agent)),
      );
      useAgentStore.setState((state) => ({
        agents: isDraft
          ? [...state.agents, raw]
          : state.agents.map((a) => (a.id === raw.id ? raw : a)),
      }));
      setSelectedAgent(null);
      setEditDraft(null);
    } catch {
      setError(t('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!workspaceId || !editDraft) return;

    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agents/presets/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json() as ConnectionTestResult & { error?: string };
      setTestResult({
        success: Boolean(data.success),
        message: data.message || data.error || t('error.connectionTestFailed'),
        debug: data.debug ? { ...data.debug, status: res.status } : { status: res.status },
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : t('error.connectionTestFailed'),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleAddAgent = (role: BuiltInRole | "empty") => {
    if (!workspaceId) {
      setError(t('error.noWorkspace'));
      return;
    }

    const draft = role === "empty" ? newEmptyAgent() : newAgentDraft(role);
    setError(null);
    setSelectedAgent(draft);
    setEditDraft({ ...draft });
  };

  const handleDeleteAgent = async (id: string) => {
    if (!workspaceId) return;
    if (id.startsWith("draft-")) {
      setSelectedAgent(null);
      setEditDraft(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agents/presets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      setAgents((prev) => prev.filter((a) => a.id !== id));
      useAgentStore.setState((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
      }));
      if (selectedAgent?.id === id) {
        setSelectedAgent(null);
        setEditDraft(null);
      }
    } catch {
      setError(t('error.deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  const updateAgentDraft = <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      if (key === "modelProvider") {
        const provider = value as AgentPreset["modelProvider"];
        return {
          ...prev,
          modelProvider: provider,
          runtimeKind: isAnthropicBridgeProvider(provider) ? "claude-code" : prev.runtimeKind,
        };
      }
      if (key === "runtimeKind") {
        const runtimeKind = value as AgentPreset["runtimeKind"];
        return {
          ...prev,
          runtimeKind,
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const updateMcpConfig = (value: AgentPreset["mcps"]) => {
    setEditDraft((prev) => (prev ? { ...prev, mcps: value } : prev));
  };

  const addSkillFiles = (files: AgentPreset["skills"]) => {
    if (!editDraft) return;
    const existingNames = new Set(editDraft.skills.map((skill) => skill.name));
    setEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        skills: [
          ...prev.skills.filter((skill) => !files.some((file) => file.name === skill.name)),
          ...files.filter((file) => file.name && !existingNames.has(file.name)),
          ...files.filter((file) => existingNames.has(file.name)),
        ],
      };
    });
  };

  const removeSkill = (index: number) => {
    if (!editDraft) return;
    setEditDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, skills: prev.skills.filter((_, i) => i !== index) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleBack(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 pr-12 py-4">
          {selectedAgent ? (
            <Button variant="ghost" size="icon-sm" onClick={handleBack}>
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="size-4 text-primary" />
            </div>
          )}
          <DialogHeader className="flex-1 space-y-0">
            <DialogTitle className="text-base">
              {selectedAgent ? editDraft?.name ?? "" : t('dialog.title')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedAgent
                ? t('dialog.editDescription')
                : t('dialog.listDescription')}
            </DialogDescription>
          </DialogHeader>
          {!selectedAgent && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" disabled={saving || !workspaceId}>
                    <Plus className="size-3.5" />
                    {t('dialog.add')}
                    <ChevronDown className="size-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent side="bottom" align="end" className="w-44">
                <DropdownMenuGroup>
                  {!roleFilterSet && (
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => handleAddAgent("empty")}
                    >
                      <span className="size-2 rounded-full bg-muted" />
                      <span>{t('dialog.addEmpty')}</span>
                    </DropdownMenuItem>
                  )}
                  {ROLE_OPTIONS.map((role) => (
                    <DropdownMenuItem
                      key={role}
                      className="gap-2"
                      onClick={() => handleAddAgent(role)}
                    >
                      <span className={cn("size-2 rounded-full", ROLE_COLORS[role].split(" ")[0])} />
                      <span className="capitalize">{t(`role.${role}.name`)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {!workspaceId ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bot className="size-10 mb-2 opacity-30" />
              <p className="text-sm">{t('dialog.noWorkspace')}</p>
            </div>
          ) : loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('dialog.loading')}</div>
          ) : !selectedAgent ? (
            <AgentList
              agents={visibleAgents}
              onSelect={handleSelectAgent}
              onDelete={handleDeleteAgent}
            />
          ) : editDraft ? (
            <AgentDetail
              key={editDraft.id}
              agent={editDraft}
              roleOptions={addRoleOptions}
              testing={testing}
              testResult={testResult}
              onChange={updateAgentDraft}
              onMcpChange={updateMcpConfig}
              onAddSkillFiles={addSkillFiles}
              onRemoveSkill={removeSkill}
              onTestConnection={handleTestConnection}
            />
          ) : null}
        </div>

        {/* Footer */}
        {selectedAgent && (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? tc('saving') : tc('save')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
