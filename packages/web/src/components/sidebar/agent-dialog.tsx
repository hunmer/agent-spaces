"use client";

import { useEffect, useState, useCallback } from "react";
import { useLLMStore } from "@/stores/llm";
import {
  BUILT_IN_AGENT_TOOLS,
  type AgentConfig,
  type BuiltInAgentToolName,
  type LLMProvider,
} from "@agent-spaces/shared";
import { AgentIcon } from "@/components/common/agent-icon";
import { useAgentStore } from "@/stores/agent";
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
  Upload,
} from "lucide-react";

type McpDraft = Record<string, unknown>;
type SkillDraft = { name: string; content?: string };

type AgentPreset = Omit<AgentConfig, "mcps" | "skills" | "modelProvider"> & {
  name: string;
  description: string;
  avatarUrl: string;
  modelProvider: AgentConfig["modelProvider"] | "";
  modelId: string;
  apiBase: string;
  apiKey: string;
  workingDir: string;
  mcps: McpDraft;
  skills: SkillDraft[];
  tools: BuiltInAgentToolName[];
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
  commit: "bg-pink-500/10 text-pink-600 border-pink-200",
  custom: "bg-gray-500/10 text-gray-600 border-gray-200",
  bot: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
};

const PROVIDER_OPTIONS: Array<{ value: NonNullable<AgentConfig["modelProvider"]>; label: string }> = [
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "openai-chat-completions", label: "OpenAI Chat Completions" },
  { value: "openai-responses", label: "OpenAI Responses API" },
  { value: "openai-responses-to-anthropic-messages", label: "OpenAI Responses To Anthropic Messages" },
  { value: "openai-chat-completions-to-anthropic-messages", label: "OpenAI Chat Completions To Anthropic Messages" },
  { value: "gemini-generate-content", label: "Gemini Native generateContent" },
];
const RUNTIME_OPTIONS: Array<{ value: NonNullable<AgentConfig["runtimeKind"]>; label: string }> = [
  { value: "open-agent-sdk", label: "Open Agent SDK" },
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];
const ROLE_OPTIONS: AgentRole[] = ["scheduler", "planner", "executor", "reviewer", "commit", "custom", "bot"];
const DEFAULT_AGENT_TOOLS: BuiltInAgentToolName[] = (BUILT_IN_AGENT_TOOLS ?? []).map((tool) => tool.name);
const ANTHROPIC_BRIDGE_PROVIDERS = new Set<AgentConfig["modelProvider"]>([
  "openai-responses-to-anthropic-messages",
  "openai-chat-completions-to-anthropic-messages",
]);

function defaultMcpConfig(names: string[]): McpDraft {
  return {
    mcpServers: Object.fromEntries(names.map((name) => [name, {}])),
  };
}

function defaultSkills(names: string[]): SkillDraft[] {
  return names.map((name) => ({ name: `${name}.md`, content: `# ${name}\n` }));
}

const ROLE_TEMPLATES: Record<AgentRole, Omit<AgentPreset, "id">> = {
  scheduler: {
    name: "Scheduler",
    role: "scheduler",
    description: "任务调度者，负责任务分发和协调",
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "anthropic-messages",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills(["planning", "task-split"]),
    tools: DEFAULT_AGENT_TOOLS,
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
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "anthropic-messages",
    modelId: "claude-opus-4-7",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills(["refactoring", "tdd"]),
    tools: DEFAULT_AGENT_TOOLS,
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
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "anthropic-messages",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills(["coding", "debugging", "testing"]),
    tools: DEFAULT_AGENT_TOOLS,
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
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "anthropic-messages",
    modelId: "claude-opus-4-7",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills(["code-review", "security-audit"]),
    tools: DEFAULT_AGENT_TOOLS,
    systemPrompt:
      "你是审核者 Agent。负责审查代码质量、安全性和可维护性。提供具体的改进建议，确保代码符合最佳实践。",
    temperature: 0.2,
    maxTokens: 8192,
    enabled: true,
  },
  commit: {
    name: "Commit",
    role: "commit",
    description: "提交消息生成器，根据 diff 智能生成 commit message",
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "openai-chat-completions",
    modelId: "",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: {},
    skills: [],
    tools: [],
    systemPrompt:
      "你是一个 git commit 消息生成器。根据提供的 diff 内容，生成简洁清晰的 conventional commit 消息。格式：type: description。类型包括：feat, fix, docs, style, refactor, perf, test, chore, build, ci。首行不超过 72 个字符。如果有多项变更，使用主题 + 空行 + 要点正文。只输出 commit 消息本身，不要任何解释。",
    temperature: 0.3,
    maxTokens: 200,
    enabled: true,
  },
  custom: {
    name: "Custom Agent",
    role: "custom",
    description: "",
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "anthropic-messages",
    modelId: "",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: {},
    skills: [],
    tools: DEFAULT_AGENT_TOOLS,
    systemPrompt: "",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
  bot: {
    name: "Bot Agent",
    role: "bot",
    description: "消息机器人，负责处理外部聊天平台中的用户消息",
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "anthropic-messages",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: {},
    skills: [],
    tools: DEFAULT_AGENT_TOOLS,
    systemPrompt:
      "你是 Agent Spaces 的消息机器人。你会简洁回答来自外部聊天平台的用户消息。不要执行危险操作；需要用户提供更多信息时直接询问。",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
};

function normalizeAgent(agent: AgentConfig): AgentPreset {
  return {
    ...agent,
    name: agent.name || "New Agent",
    description: agent.description || "",
    avatarUrl: agent.avatarUrl || "",
    runtimeKind: agent.runtimeKind || "open-agent-sdk",
    modelProvider: agent.modelProvider || "",
    modelId: agent.modelId || "claude-sonnet-4-6",
    apiBase: agent.apiBase || "",
    apiKey: agent.apiKey || "",
    workingDir: agent.workingDir || "",
    mcps: normalizeMcpDraft(agent.mcps),
    skills: normalizeSkillDrafts(agent.skills),
    tools: normalizeToolDrafts(agent.tools),
    systemPrompt: agent.systemPrompt || "",
    temperature: agent.temperature ?? 0.3,
    maxTokens: agent.maxTokens ?? 4096,
    enabled: agent.enabled ?? true,
  };
}

function normalizeToolDrafts(tools: AgentConfig["tools"] | undefined): BuiltInAgentToolName[] {
  if (!Array.isArray(tools)) return DEFAULT_AGENT_TOOLS;
  const valid = new Set((BUILT_IN_AGENT_TOOLS ?? []).map((tool) => tool.name));
  return tools.filter((tool): tool is BuiltInAgentToolName => valid.has(tool));
}

function normalizeMcpDraft(mcps: AgentConfig["mcps"] | undefined): McpDraft {
  if (!mcps) return {};
  return mcps;
}

function normalizeSkillDrafts(skills: AgentConfig["skills"] | SkillDraft[] | undefined): SkillDraft[] {
  if (!Array.isArray(skills)) return [];
  return skills.map((skill) => {
    if (typeof skill === "string") return { name: skill.endsWith(".md") ? skill : `${skill}.md` };
    return skill;
  });
}

type AgentPresetPayload = Omit<AgentPreset, "id" | "modelProvider"> & {
  modelProvider?: AgentConfig["modelProvider"];
};

function serializeAgent(agent: AgentPreset): AgentPresetPayload {
  const { id: _id, ...body } = agent;
  void _id;
  return {
    ...body,
    modelProvider: body.modelProvider || undefined,
  };
}

function newAgentDraft(role: AgentRole): AgentPreset {
  return {
    id: `draft-${role}-${Date.now()}`,
    ...ROLE_TEMPLATES[role],
    mcps: structuredClone(ROLE_TEMPLATES[role].mcps),
    skills: ROLE_TEMPLATES[role].skills.map((skill) => ({ ...skill })),
    tools: [...ROLE_TEMPLATES[role].tools],
  };
}

function newEmptyAgent(): AgentPreset {
  return {
    id: `draft-empty-${Date.now()}`,
    name: "",
    role: "executor",
    description: "",
    avatarUrl: "",
    runtimeKind: "open-agent-sdk",
    modelProvider: "",
    modelId: "",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: {},
    skills: [],
    tools: DEFAULT_AGENT_TOOLS,
    systemPrompt: "",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  };
}

function isDraftAgent(agent: AgentPreset) {
  return agent.id.startsWith("draft-");
}

function isAnthropicBridgeProvider(provider: AgentPreset["modelProvider"]): boolean {
  return Boolean(provider && ANTHROPIC_BRIDGE_PROVIDERS.has(provider));
}

export function AgentDialog({
  open,
  onOpenChange,
  workspaceId,
  roleFilter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  roleFilter?: AgentRole | AgentRole[];
}) {
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
      useAgentStore.setState((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
      }));
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
    setEditDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
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

  const updateMcpConfig = (value: McpDraft) => {
    updateDraft("mcps", value);
  };

  const addSkillFiles = (files: SkillDraft[]) => {
    if (!editDraft) return;
    const existingNames = new Set(editDraft.skills.map((skill) => skill.name));
    updateDraft("skills", [
      ...editDraft.skills.filter((skill) => !files.some((file) => file.name === skill.name)),
      ...files.filter((file) => file.name && !existingNames.has(file.name)),
      ...files.filter((file) => existingNames.has(file.name)),
    ]);
  };

  const removeSkill = (index: number) => {
    if (!editDraft) return;
    updateDraft("skills", editDraft.skills.filter((_, i) => i !== index));
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
                  {!roleFilterSet && (
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => handleAddAgent("empty")}
                    >
                      <span className="size-2 rounded-full bg-muted" />
                      <span>Empty</span>
                    </DropdownMenuItem>
                  )}
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
          <AgentIcon
            name={agent.name}
            avatarUrl={agent.avatarUrl}
            apiBase={agent.apiBase}
            className="size-8"
          />
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
  roleOptions,
  testing,
  testResult,
  onChange,
  onMcpChange,
  onAddSkillFiles,
  onRemoveSkill,
  onTestConnection,
}: {
  agent: AgentPreset;
  roleOptions: AgentRole[];
  testing: boolean;
  testResult: ConnectionTestResult | null;
  onChange: <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => void;
  onMcpChange: (value: McpDraft) => void;
  onAddSkillFiles: (files: SkillDraft[]) => void;
  onRemoveSkill: (index: number) => void;
  onTestConnection: () => void;
}) {
  const [mcpJson, setMcpJson] = useState(() => JSON.stringify(agent.mcps, null, 2));
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [dynamicModelOptions, setDynamicModelOptions] = useState<Array<{ value: string; label: string }>>([]);

  const { models: allLlmModels, providers: llmProviders, ensure: ensureLLM } = useLLMStore();
  const llmModels = allLlmModels.filter((m) => !m.embedding);

  useEffect(() => { ensureLLM(); }, [ensureLLM]);

  const handleSelectProvider = useCallback(
    (provider: LLMProvider) => {
      onChange("apiBase", provider.apiBase);
      onChange("apiKey", provider.apiKey);
      const providerModels = llmModels.filter((m) => m.provider === provider.name);
      const options = providerModels.map((m) => ({ value: m.modelId, label: m.name }));
      setDynamicModelOptions(options);
      if (options.length > 0) {
        onChange("modelId", options[0].value);
      }
    },
    [llmModels, onChange],
  );

  const handleMcpJsonChange = (value: string) => {
    setMcpJson(value);
    try {
      const parsed = JSON.parse(value) as McpDraft;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("MCP config must be a JSON object");
      }
      setMcpError(null);
      onMcpChange(parsed);
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleSkillUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const markdownFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".md"));
    const next = await Promise.all(markdownFiles.map(async (file) => ({
      name: file.name,
      content: await file.text(),
    })));
    onAddSkillFiles(next);
  };

  const toggleTool = (toolName: BuiltInAgentToolName) => {
    const selected = new Set(agent.tools);
    if (selected.has(toolName)) {
      selected.delete(toolName);
    } else {
      selected.add(toolName);
    }
    onChange("tools", (BUILT_IN_AGENT_TOOLS ?? []).map((tool) => tool.name).filter((name) => selected.has(name)));
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Basic Info */}
      <Section icon={<MessageSquare className="size-3.5" />} title="Basic">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <AgentIcon
              name={agent.name}
              avatarUrl={agent.avatarUrl}
              apiBase={agent.apiBase}
              className="size-16 rounded-xl border border-input"
            />
            <label className="text-[10px] text-primary cursor-pointer hover:underline">
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async () => {
                    try {
                      const res = await fetch("/api/upload/avatar", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dataUrl: reader.result, filename: file.name }),
                      });
                      const data = await res.json();
                      if (data.url) onChange("avatarUrl", data.url);
                    } catch { /* ignore */ }
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </label>
            {agent.avatarUrl && (
              <button
                type="button"
                className="text-[10px] text-destructive hover:underline"
                onClick={() => onChange("avatarUrl", "")}
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2.5">
            <FieldGroup label="Name">
              <Input value={agent.name} onChange={(e) => onChange("name", e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Role">
              <select
                value={agent.role}
                onChange={(e) => onChange("role", e.target.value as AgentConfig["role"])}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </FieldGroup>
          </div>
        </div>
        <FieldGroup label="Description">
          <Input value={agent.description} onChange={(e) => onChange("description", e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Agent Runtime">
          <SearchSelect
            value={agent.runtimeKind ?? ""}
            onChange={(v) => onChange("runtimeKind", v as NonNullable<AgentConfig["runtimeKind"]>)}
            options={RUNTIME_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder="Select agent runtime..."
            searchPlaceholder="Search agent runtime..."
            allowCustom={false}
          />
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
        <Textarea
          value={mcpJson}
          onChange={(e) => handleMcpJsonChange(e.target.value)}
          placeholder={'{\n  "mcpServers": {}\n}'}
          className="min-h-28 font-mono text-xs"
        />
        {mcpError && (
          <div className="text-xs text-destructive">{mcpError}</div>
        )}
      </Section>

      {/* Tools */}
      <Section icon={<Wrench className="size-3.5" />} title="Tools">
        <div className="grid gap-2">
          {(BUILT_IN_AGENT_TOOLS ?? []).map((tool) => (
            <label
              key={tool.name}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-input px-3 py-2 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={agent.tools.includes(tool.name)}
                onChange={() => toggleTool(tool.name)}
                className="mt-0.5 size-3.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{tool.label}</span>
                <span className="block text-[11px] text-muted-foreground">{tool.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {/* Skills */}
      <Section icon={<Cpu className="size-3.5" />} title="Skills">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agent.skills.map((skill, i) => (
            <Badge key={i} variant="outline" className="gap-1 pr-1">
              {skill.name}
              <button type="button" onClick={() => onRemoveSkill(i)} className="hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <label className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs text-muted-foreground hover:bg-muted/50">
          <Upload className="size-3.5" />
          Upload Markdown skills
          <input
            type="file"
            accept=".md,text/markdown"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleSkillUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </Section>

      {/* Model Config */}
      <Section icon={<Sliders className="size-3.5" />} title="Model">
        <div className="space-y-2.5">
          <FieldGroup label="Provider">
            <SearchSelect
              value={llmProviders.find((p) => p.apiBase === agent.apiBase && p.apiKey === agent.apiKey)?.name || ""}
              onChange={(v) => {
                const provider = llmProviders.find((p) => p.name === v);
                if (provider) handleSelectProvider(provider);
              }}
              options={llmProviders.map((p) => ({ value: p.name, label: p.name }))}
              placeholder="Select provider..."
              searchPlaceholder="Search provider..."
              allowCustom={false}
            />
          </FieldGroup>
          <FieldGroup label="Model">
            <SearchSelect
              value={agent.modelId}
              onChange={(v) => onChange("modelId", v)}
              options={dynamicModelOptions.length > 0 ? dynamicModelOptions : [{ value: agent.modelId || "", label: agent.modelId || "Select a provider first..." }]}
              placeholder="Select model..."
              searchPlaceholder="Search or type custom model..."
            />
          </FieldGroup>
          <FieldGroup label="API Message Type">
            <SearchSelect
              value={agent.modelProvider || ""}
              onChange={(v) => onChange("modelProvider", v as AgentPreset["modelProvider"])}
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
        </div>
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
