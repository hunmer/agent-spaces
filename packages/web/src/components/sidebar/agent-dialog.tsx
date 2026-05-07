"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
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
type BuiltInRole = "agent" | "scheduler" | "task_creator" | "bot";

const ROLE_COLORS: Record<string, string> = {
  agent: "bg-gray-500/10 text-gray-600 border-gray-200",
  scheduler: "bg-blue-500/10 text-blue-600 border-blue-200",
  task_creator: "bg-green-500/10 text-green-600 border-green-200",
  bot: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
};

const PROVIDER_OPTIONS: Array<{ value: NonNullable<AgentConfig["modelProvider"]>; labelKey: string }> = [
  { value: "anthropic-messages", labelKey: "anthropicMessages" },
  { value: "openai-chat-completions", labelKey: "openaiChatCompletions" },
  { value: "openai-responses", labelKey: "openaiResponses" },
  { value: "openai-responses-to-anthropic-messages", labelKey: "openaiResponsesToAnthropic" },
  { value: "openai-chat-completions-to-anthropic-messages", labelKey: "openaiChatToAnthropic" },
  { value: "gemini-generate-content", labelKey: "geminiGenerateContent" },
];
const RUNTIME_OPTIONS: Array<{ value: NonNullable<AgentConfig["runtimeKind"]>; labelKey: string }> = [
  { value: "claude-code", labelKey: "claudeCode" },
  { value: "open-agent-sdk", labelKey: "openAgentSdk" },
  { value: "codex", labelKey: "codex" },
];
const ROLE_OPTIONS: BuiltInRole[] = ["agent", "scheduler", "task_creator", "bot"];
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

const ROLE_TEMPLATES: Record<BuiltInRole, Omit<AgentPreset, "id">> = {
  agent: {
    name: "Agent",
    role: "agent",
    description: "通用 Agent，可在 workflow 中承担任意执行节点",
    avatarUrl: "",
    runtimeKind: "claude-code",
    modelProvider: "anthropic-messages",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills(["coding", "debugging", "testing"]),
    tools: DEFAULT_AGENT_TOOLS,
    systemPrompt:
      "你是通用 Agent。根据 issue 和当前任务上下文完成被分配的工作，遵循项目规范，必要时修改代码、运行验证，并清晰汇报结果。",
    temperature: 0.3,
    maxTokens: 8192,
    enabled: true,
  },
  scheduler: {
    name: "Scheduler",
    role: "scheduler",
    description: "任务调度者，负责任务分发和协调",
    avatarUrl: "",
    runtimeKind: "claude-code",
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
  task_creator: {
    name: "Task Creator",
    role: "task_creator",
    description: "任务创建者，负责把 issue 拆成可执行任务",
    avatarUrl: "",
    runtimeKind: "claude-code",
    modelProvider: "anthropic-messages",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills(["planning", "task-split"]),
    tools: DEFAULT_AGENT_TOOLS,
    systemPrompt:
      "你是任务创建者 Agent。负责读取 issue 上下文，把需求拆分为少量可执行任务，并用系统工具写入任务列表。只创建真正需要独立执行的任务，避免把细碎步骤拆成任务。",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
  bot: {
    name: "Bot Agent",
    role: "bot",
    description: "消息机器人，负责处理外部聊天平台中的用户消息",
    avatarUrl: "",
    runtimeKind: "claude-code",
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

function newAgentDraft(role: BuiltInRole): AgentPreset {
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
    role: "agent",
    description: "",
    avatarUrl: "",
    runtimeKind: "claude-code",
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

function AgentList({
  agents,
  onSelect,
  onDelete,
}: {
  agents: AgentPreset[];
  onSelect: (agent: AgentPreset) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('agent');
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
            <p className="text-xs text-muted-foreground truncate">{agent.description || t('list.noDescription')}</p>
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
          <p className="text-sm">{t('list.empty')}</p>
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
  const t = useTranslations('agent');
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
      <Section icon={<MessageSquare className="size-3.5" />} title={t('detail.basic')}>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <AgentIcon
              name={agent.name}
              avatarUrl={agent.avatarUrl}
              apiBase={agent.apiBase}
              className="size-16 rounded-xl border border-input"
            />
            <label className="text-[10px] text-primary cursor-pointer hover:underline">
              {t('detail.uploadAvatar')}
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
                {t('detail.removeAvatar')}
              </button>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2.5">
            <FieldGroup label={t('detail.name')}>
              <Input value={agent.name} onChange={(e) => onChange("name", e.target.value)} />
            </FieldGroup>
            <FieldGroup label={t('detail.role')}>
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
        <FieldGroup label={t('detail.description')}>
          <Input value={agent.description} onChange={(e) => onChange("description", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t('detail.agentRuntime')}>
          <SearchSelect
            value={agent.runtimeKind ?? ""}
            onChange={(v) => onChange("runtimeKind", v as NonNullable<AgentConfig["runtimeKind"]>)}
            options={RUNTIME_OPTIONS.map((option) => ({ value: option.value, label: t(`runtime.${option.labelKey}`) }))}
            placeholder={t('detail.runtimePlaceholder')}
            searchPlaceholder={t('detail.runtimeSearchPlaceholder')}
            allowCustom={false}
          />
        </FieldGroup>
      </Section>

      {/* Working Directory */}
      <Section icon={<FolderOpen className="size-3.5" />} title={t('detail.workingDirectory')}>
        <Input value={agent.workingDir} onChange={(e) => onChange("workingDir", e.target.value)} placeholder={t('detail.workingDirPlaceholder')} />
      </Section>

      {/* System Prompt */}
      <Section icon={<Sparkles className="size-3.5" />} title={t('detail.systemPrompt')}>
        <Textarea
          value={agent.systemPrompt}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
          placeholder={t('detail.systemPromptPlaceholder')}
          className="min-h-24 text-xs"
        />
      </Section>

      {/* MCP Servers */}
      <Section icon={<Wrench className="size-3.5" />} title={t('detail.mcpServers')}>
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
      <Section icon={<Wrench className="size-3.5" />} title={t('detail.tools')}>
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
      <Section icon={<Cpu className="size-3.5" />} title={t('detail.skills')}>
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
          {t('detail.uploadSkills')}
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
      <Section icon={<Sliders className="size-3.5" />} title={t('detail.model')}>
        <div className="space-y-2.5">
          <FieldGroup label={t('detail.provider')}>
            <SearchSelect
              value={llmProviders.find((p) => p.apiBase === agent.apiBase && p.apiKey === agent.apiKey)?.name || ""}
              onChange={(v) => {
                const provider = llmProviders.find((p) => p.name === v);
                if (provider) handleSelectProvider(provider);
              }}
              options={llmProviders.map((p) => ({ value: p.name, label: p.name }))}
              placeholder={t('detail.providerPlaceholder')}
              searchPlaceholder={t('detail.providerSearchPlaceholder')}
              allowCustom={false}
            />
          </FieldGroup>
          <FieldGroup label={t('detail.modelField')}>
            <SearchSelect
              value={agent.modelId}
              onChange={(v) => onChange("modelId", v)}
              options={dynamicModelOptions.length > 0 ? dynamicModelOptions : [{ value: agent.modelId || "", label: agent.modelId || t('detail.selectProviderFirst') }]}
              placeholder={t('detail.modelPlaceholder')}
              searchPlaceholder={t('detail.modelSearchPlaceholder')}
            />
          </FieldGroup>
          <FieldGroup label={t('detail.apiMessageType')}>
            <SearchSelect
              value={agent.modelProvider || ""}
              onChange={(v) => onChange("modelProvider", v as AgentPreset["modelProvider"])}
              options={PROVIDER_OPTIONS.map((option) => ({ value: option.value, label: t(`provider.${option.labelKey}`) }))}
              placeholder={t('detail.apiMessageTypePlaceholder')}
              searchPlaceholder={t('detail.apiMessageTypeSearchPlaceholder')}
              allowCustom={false}
            />
          </FieldGroup>
          <FieldGroup label={t('detail.apiBase')}>
            <Input
              value={agent.apiBase}
              onChange={(e) => onChange("apiBase", e.target.value)}
              placeholder={t('detail.apiBasePlaceholder')}
              className="h-7 text-xs"
            />
          </FieldGroup>
          <FieldGroup label={t('detail.apiKey')}>
            <Input
              type="password"
              value={agent.apiKey}
              onChange={(e) => onChange("apiKey", e.target.value)}
              placeholder={t('detail.apiKeyPlaceholder')}
              className="h-7 text-xs"
            />
          </FieldGroup>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">{t('detail.validateHelper')}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTestConnection}
            disabled={testing || !agent.apiBase || !agent.apiKey || !agent.modelId}
          >
            <PlugZap className="size-3.5" />
            {testing ? t('detail.testing') : t('detail.test')}
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
                {testResult.debug.status && <div>{t('debug.status')} {testResult.debug.status}</div>}
                {testResult.debug.provider && <div>{t('debug.provider')} {testResult.debug.provider}</div>}
                {testResult.debug.requestUrl && <div>{t('debug.url')} {testResult.debug.requestUrl}</div>}
                {testResult.debug.model && <div>{t('debug.model')} {testResult.debug.model}</div>}
                {testResult.debug.responseBody && (
                  <div className="max-h-20 overflow-auto whitespace-pre-wrap">{t('debug.body')} {testResult.debug.responseBody}</div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label={t('detail.temperature')}>
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
          <FieldGroup label={t('detail.maxTokens')}>
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
