"use client";

import { useEffect, useState } from "react";
import type { AgentConfig } from "@agent-spaces/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchSelect } from "@/components/ui/search-select";
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
  Trash2,
  X,
  Cpu,
  PlugZap,
  FolderOpen,
  Wrench,
  Sparkles,
  MessageSquare,
  Sliders,
} from "lucide-react";

type AgentPreset = AgentConfig & {
  name: string;
  description: string;
  modelProvider: NonNullable<AgentConfig["modelProvider"]>;
  modelId: string;
  apiBase: string;
  apiKey: string;
  workingDir: string;
  mcps: string[];
  skills: string[];
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
};

interface ConnectionTestResult {
  success: boolean;
  message: string;
  debug?: {
    provider?: string;
    apiBase?: string;
    requestUrl?: string;
    model?: string;
    status?: number;
    responseBody?: string;
  };
}

type AgentRole = AgentConfig["role"];

const ROLE_COLORS: Record<string, string> = {
  scheduler: "bg-blue-500/10 text-blue-600 border-blue-200",
  planner: "bg-purple-500/10 text-purple-600 border-purple-200",
  executor: "bg-green-500/10 text-green-600 border-green-200",
  reviewer: "bg-orange-500/10 text-orange-600 border-orange-200",
};

const MODEL_OPTIONS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];
const PROVIDER_OPTIONS: Array<{ value: NonNullable<AgentConfig["modelProvider"]>; label: string }> = [
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "openai-chat-completions", label: "OpenAI Chat Completions" },
  { value: "openai-responses", label: "OpenAI Responses API" },
  { value: "gemini-generate-content", label: "Gemini Native generateContent" },
];
const ROLE_OPTIONS: AgentRole[] = ["scheduler", "planner", "executor", "reviewer"];

const ROLE_TEMPLATES: Record<AgentRole, Omit<AgentPreset, "id">> = {
  scheduler: {
    name: "Scheduler",
    role: "scheduler",
    description: "任务调度者，负责任务分发和协调",
    modelProvider: "anthropic-messages",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "/workspace",
    mcps: ["code-review-graph", "fetch"],
    skills: ["planning", "task-split"],
    systemPrompt:
      "你是调度者 Agent。负责接收用户任务，分析任务类型，分发给合适的执行者。你需要跟踪任务状态，确保所有子任务按时完成。",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
  planner: {
    name: "Planner",
    role: "planner",
    description: "策划者，负责分解任务和制定计划",
    modelProvider: "anthropic-messages",
    modelId: "claude-opus-4-7",
    apiBase: "",
    apiKey: "",
    workingDir: "/workspace",
    mcps: ["code-review-graph"],
    skills: ["refactoring", "tdd"],
    systemPrompt:
      "你是策划者 Agent。负责将复杂任务分解为可执行的子任务，制定详细的实施计划，识别潜在风险和依赖关系。",
    temperature: 0.5,
    maxTokens: 8192,
    enabled: true,
  },
  executor: {
    name: "Executor",
    role: "executor",
    description: "执行者，负责代码编写和修改",
    modelProvider: "anthropic-messages",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "/workspace/src",
    mcps: ["code-review-graph", "fetch"],
    skills: ["coding", "debugging", "testing"],
    systemPrompt:
      "你是执行者 Agent。根据计划编写高质量的代码，遵循项目编码规范，编写必要的测试。完成后提交审核。",
    temperature: 0.2,
    maxTokens: 16384,
    enabled: true,
  },
  reviewer: {
    name: "Reviewer",
    role: "reviewer",
    description: "审核者，负责代码审查和质量把关",
    modelProvider: "anthropic-messages",
    modelId: "claude-opus-4-7",
    apiBase: "",
    apiKey: "",
    workingDir: "/workspace",
    mcps: ["code-review-graph"],
    skills: ["code-review", "security-audit"],
    systemPrompt:
      "你是审核者 Agent。负责审查代码质量、安全性和可维护性。提供具体的改进建议，确保代码符合最佳实践。",
    temperature: 0.2,
    maxTokens: 8192,
    enabled: true,
  },
};

function normalizeAgent(agent: AgentConfig): AgentPreset {
  return {
    ...agent,
    name: agent.name || "New Agent",
    description: agent.description || "",
    modelProvider: agent.modelProvider || "anthropic-messages",
    modelId: agent.modelId || "claude-sonnet-4-6",
    apiBase: agent.apiBase || "",
    apiKey: agent.apiKey || "",
    workingDir: agent.workingDir || "/workspace",
    mcps: agent.mcps || [],
    skills: agent.skills || [],
    systemPrompt: agent.systemPrompt || "",
    temperature: agent.temperature ?? 0.3,
    maxTokens: agent.maxTokens ?? 4096,
    enabled: agent.enabled ?? true,
  };
}

function newAgentDraft(role: AgentRole): AgentPreset {
  return {
    id: `draft-${role}-${Date.now()}`,
    ...ROLE_TEMPLATES[role],
    mcps: [...ROLE_TEMPLATES[role].mcps],
    skills: [...ROLE_TEMPLATES[role].skills],
  };
}

function newEmptyAgent(): AgentPreset {
  return {
    id: `draft-empty-${Date.now()}`,
    name: "",
    role: "executor",
    description: "",
    modelProvider: "anthropic-messages",
    modelId: "",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: [],
    skills: [],
    systemPrompt: "",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  };
}

function isDraftAgent(agent: AgentPreset) {
  return agent.id.startsWith("draft-");
}

export function AgentDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
}) {
  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentPreset | null>(null);
  const [editDraft, setEditDraft] = useState<AgentPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      .then((data) => setAgents(data.map(normalizeAgent)))
      .catch((err) => {
        if (err.name !== "AbortError") setError("Failed to load agent presets");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [open, workspaceId]);

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
      const { id, ...createBody } = editDraft;
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
      void id;
      if (!res.ok) throw new Error(await res.text());
      const saved = normalizeAgent(await res.json());
      setAgents((prev) =>
        isDraft
          ? [...prev, saved]
          : prev.map((agent) => (agent.id === saved.id ? saved : agent)),
      );
      setSelectedAgent(null);
      setEditDraft(null);
    } catch {
      setError("Failed to save agent preset");
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
        message: data.message || data.error || "Connection test failed",
        debug: data.debug ? { ...data.debug, status: res.status } : { status: res.status },
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleAddAgent = (role: AgentRole | "empty") => {
    if (!workspaceId) {
      setError("Open a workspace before adding agent presets");
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
      if (selectedAgent?.id === id) {
        setSelectedAgent(null);
        setEditDraft(null);
      }
    } catch {
      setError("Failed to delete agent preset");
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, [key]: value });
  };

  const addToArray = (key: "mcps" | "skills", value: string) => {
    if (!editDraft || !value.trim()) return;
    updateDraft(key, [...editDraft[key], value.trim()]);
  };

  const removeFromArray = (key: "mcps" | "skills", index: number) => {
    if (!editDraft) return;
    updateDraft(key, editDraft[key].filter((_, i) => i !== index));
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
              {selectedAgent ? editDraft?.name ?? "" : "Agent Presets"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedAgent
                ? "Configure agent behavior, tools, and model settings"
                : "Manage agent presets for workspace automation"}
            </DialogDescription>
          </DialogHeader>
          {!selectedAgent && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" disabled={saving || !workspaceId}>
                    <Plus className="size-3.5" />
                    Add
                    <ChevronDown className="size-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent side="bottom" align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => handleAddAgent("empty")}
                  >
                    <span className="size-2 rounded-full bg-muted" />
                    <span>Empty</span>
                  </DropdownMenuItem>
                  {ROLE_OPTIONS.map((role) => (
                    <DropdownMenuItem
                      key={role}
                      className="gap-2"
                      onClick={() => handleAddAgent(role)}
                    >
                      <span className={cn("size-2 rounded-full", ROLE_COLORS[role].split(" ")[0])} />
                      <span className="capitalize">{role}</span>
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
              <p className="text-sm">No workspace selected</p>
            </div>
          ) : loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading agent presets...</div>
          ) : !selectedAgent ? (
            <AgentList
              agents={agents}
              onSelect={handleSelectAgent}
              onDelete={handleDeleteAgent}
            />
          ) : editDraft ? (
            <AgentDetail
              agent={editDraft}
              testing={testing}
              testResult={testResult}
              onChange={updateDraft}
              onAddToArray={addToArray}
              onRemoveFromArray={removeFromArray}
              onTestConnection={handleTestConnection}
            />
          ) : null}
        </div>

        {/* Footer */}
        {selectedAgent && (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AgentList({
  agents,
  onSelect,
  onDelete,
}: {
  agents: AgentPreset[];
  onSelect: (agent: AgentPreset) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col p-2">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
          onClick={() => onSelect(agent)}
        >
          <div className={cn("flex size-8 items-center justify-center rounded-lg", ROLE_COLORS[agent.role] ?? "bg-muted")}>
            <Bot className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{agent.name}</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {agent.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{agent.description || "No description"}</p>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{agent.modelId.split("-").slice(0, 2).join("-")}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onDelete(agent.id); }}
          >
            <Trash2 className="size-3 text-destructive" />
          </Button>
        </div>
      ))}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bot className="size-10 mb-2 opacity-30" />
          <p className="text-sm">No agent presets yet</p>
        </div>
      )}
    </div>
  );
}

function AgentDetail({
  agent,
  testing,
  testResult,
  onChange,
  onAddToArray,
  onRemoveFromArray,
  onTestConnection,
}: {
  agent: AgentPreset;
  testing: boolean;
  testResult: ConnectionTestResult | null;
  onChange: <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => void;
  onAddToArray: (key: "mcps" | "skills", value: string) => void;
  onRemoveFromArray: (key: "mcps" | "skills", index: number) => void;
  onTestConnection: () => void;
}) {
  const [newMcp, setNewMcp] = useState("");
  const [newSkill, setNewSkill] = useState("");

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Basic Info */}
      <Section icon={<MessageSquare className="size-3.5" />} title="Basic">
        <FieldGroup label="Name">
          <Input value={agent.name} onChange={(e) => onChange("name", e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Role">
          <select
            value={agent.role}
            onChange={(e) => onChange("role", e.target.value as AgentConfig["role"])}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Description">
          <Input value={agent.description} onChange={(e) => onChange("description", e.target.value)} />
        </FieldGroup>
      </Section>

      {/* Working Directory */}
      <Section icon={<FolderOpen className="size-3.5" />} title="Working Directory">
        <Input value={agent.workingDir} onChange={(e) => onChange("workingDir", e.target.value)} placeholder="/workspace" />
      </Section>

      {/* System Prompt */}
      <Section icon={<Sparkles className="size-3.5" />} title="System Prompt">
        <Textarea
          value={agent.systemPrompt}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
          placeholder="Enter system prompt..."
          className="min-h-24 text-xs"
        />
      </Section>

      {/* MCP Servers */}
      <Section icon={<Wrench className="size-3.5" />} title="MCP Servers">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agent.mcps.map((mcp, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {mcp}
              <button type="button" onClick={() => onRemoveFromArray("mcps", i)} className="hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newMcp} onChange={(e) => setNewMcp(e.target.value)} placeholder="Add MCP server..." className="flex-1 h-7 text-xs" onKeyDown={(e) => { if (e.key === "Enter") { onAddToArray("mcps", newMcp); setNewMcp(""); } }} />
          <Button variant="outline" size="xs" onClick={() => { onAddToArray("mcps", newMcp); setNewMcp(""); }}>
            <Plus className="size-3" />
          </Button>
        </div>
      </Section>

      {/* Skills */}
      <Section icon={<Cpu className="size-3.5" />} title="Skills">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agent.skills.map((skill, i) => (
            <Badge key={i} variant="outline" className="gap-1 pr-1">
              {skill}
              <button type="button" onClick={() => onRemoveFromArray("skills", i)} className="hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Add skill..." className="flex-1 h-7 text-xs" onKeyDown={(e) => { if (e.key === "Enter") { onAddToArray("skills", newSkill); setNewSkill(""); } }} />
          <Button variant="outline" size="xs" onClick={() => { onAddToArray("skills", newSkill); setNewSkill(""); }}>
            <Plus className="size-3" />
          </Button>
        </div>
      </Section>

      {/* Model Config */}
      <Section icon={<Sliders className="size-3.5" />} title="Model">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Validate provider credentials before saving.</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTestConnection}
            disabled={testing || !agent.apiBase || !agent.apiKey || !agent.modelId}
          >
            <PlugZap className="size-3.5" />
            {testing ? "Testing..." : "Test"}
          </Button>
        </div>
        {testResult && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              testResult.success
                ? "border-green-500/30 bg-green-500/10 text-green-700"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {testResult.message}
            {testResult.debug && (
              <div className="mt-2 space-y-1 font-mono text-[10px] opacity-80">
                {testResult.debug.status && <div>status: {testResult.debug.status}</div>}
                {testResult.debug.provider && <div>provider: {testResult.debug.provider}</div>}
                {testResult.debug.requestUrl && <div>url: {testResult.debug.requestUrl}</div>}
                {testResult.debug.model && <div>model: {testResult.debug.model}</div>}
                {testResult.debug.responseBody && (
                  <div className="max-h-20 overflow-auto whitespace-pre-wrap">body: {testResult.debug.responseBody}</div>
                )}
              </div>
            )}
          </div>
        )}
        <FieldGroup label="Model">
          <SearchSelect
            value={agent.modelId}
            onChange={(v) => onChange("modelId", v)}
            options={MODEL_OPTIONS.map((m) => ({ value: m }))}
            placeholder="Select model..."
            searchPlaceholder="Search or type custom model..."
          />
        </FieldGroup>
        <FieldGroup label="API Message Type">
          <SearchSelect
            value={agent.modelProvider}
            onChange={(v) => onChange("modelProvider", v as NonNullable<AgentConfig["modelProvider"]>)}
            options={PROVIDER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder="Select API message type..."
            searchPlaceholder="Search API message type..."
            allowCustom={false}
          />
        </FieldGroup>
        <FieldGroup label="API Base">
          <Input
            value={agent.apiBase}
            onChange={(e) => onChange("apiBase", e.target.value)}
            placeholder="https://api.example.com/v1"
            className="h-7 text-xs"
          />
        </FieldGroup>
        <FieldGroup label="API Key">
          <Input
            type="password"
            value={agent.apiKey}
            onChange={(e) => onChange("apiKey", e.target.value)}
            placeholder="sk-..."
            className="h-7 text-xs"
          />
        </FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Temperature">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={agent.temperature}
                onChange={(e) => onChange("temperature", parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs font-mono w-8 text-right">{agent.temperature}</span>
            </div>
          </FieldGroup>
          <FieldGroup label="Max Tokens">
            <Input
              type="number"
              value={agent.maxTokens}
              onChange={(e) => onChange("maxTokens", parseInt(e.target.value) || 0)}
              className="h-7 text-xs"
            />
          </FieldGroup>
        </div>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
