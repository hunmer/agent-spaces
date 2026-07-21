import {
  BUILT_IN_AGENT_TOOLS,
  type AgentConfig,
  type BuiltInAgentToolName,
} from "@agent-spaces/shared";

export type McpDraft = Record<string, unknown>;
export type SkillDraft = { name: string; content?: string };

export type AgentPreset = Omit<AgentConfig, "mcps" | "skills" | "modelProvider"> & {
  name: string;
  description: string;
  avatarUrl: string;
  icon: string;
  backgroundUrl: string;
  modelProvider: AgentConfig["modelProvider"] | "";
  providerId: string;
  modelId: string;
  apiBase: string;
  apiKey: string;
  workingDir: string;
  mcps: McpDraft;
  skills: SkillDraft[];
  tools: BuiltInAgentToolName[];
  boundWorkflowIds: string[];
  boundWorkflowPluginTools: Array<{ pluginId: string; toolName: string }>;
  systemPrompt: string;
  outputStyle: string;
  temperature: number;
  maxTokens: number;
};

export interface ConnectionTestResult {
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

export type AgentDetailLockedFields = Partial<Record<
  | "role"
  | "runtimeKind"
  | "workingDir"
  | "systemPrompt"
  | "mcps"
  | "tools"
  | "boundWorkflowIds"
  | "boundWorkflowPluginTools"
  | "skills",
  boolean
>>;

export type AgentDetailHiddenFields = Partial<Record<
  | "role"
  | "runtimeKind"
  | "workingDir"
  | "systemPrompt"
  | "mcps"
  | "tools"
  | "boundWorkflowIds"
  | "boundWorkflowPluginTools"
  | "skills"
  | "background"
  | "outputStyle",
  boolean
>>;

export const MINI_APP_HIDDEN_FIELDS: AgentDetailHiddenFields = {
  role: true,
  runtimeKind: true,
  workingDir: true,
  outputStyle: true,
  mcps: true,
  tools: true,
  skills: true,
  background: true,
};

export type AgentRole = AgentConfig["role"];
export type BuiltInRole = "agent" | "scheduler" | "bot";

export const ROLE_COLORS: Record<string, string> = {
  agent: "bg-gray-500/10 text-gray-600 border-gray-200",
  scheduler: "bg-blue-500/10 text-blue-600 border-blue-200",
  bot: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
};

export const PROVIDER_OPTIONS: Array<{ value: NonNullable<AgentConfig["modelProvider"]>; labelKey: string }> = [
  { value: "anthropic-messages", labelKey: "anthropicMessages" },
  { value: "openai-chat-completions", labelKey: "openaiChatCompletions" },
  { value: "openai-responses", labelKey: "openaiResponses" },
  { value: "openai-responses-to-anthropic-messages", labelKey: "openaiResponsesToAnthropic" },
  { value: "openai-chat-completions-to-anthropic-messages", labelKey: "openaiChatToAnthropic" },
  { value: "gemini-generate-content", labelKey: "geminiGenerateContent" },
];

export const RUNTIME_OPTIONS: Array<{ value: NonNullable<AgentConfig["runtimeKind"]>; labelKey: string }> = [
  { value: "claude-code", labelKey: "claudeCode" },
  { value: "open-agent-sdk", labelKey: "openAgentSdk" },
  { value: "codex", labelKey: "codex" },
  { value: "grok", labelKey: "grok" },
  { value: "langchain", labelKey: "langchain" },
  { value: "hermes", labelKey: "hermes" },
  { value: "pi", labelKey: "pi" },
];

export const ROLE_OPTIONS: BuiltInRole[] = ["agent", "scheduler", "bot"];
export const DEFAULT_AGENT_TOOLS: BuiltInAgentToolName[] = [];
export const ANTHROPIC_BRIDGE_PROVIDERS = new Set<AgentConfig["modelProvider"]>([
  "openai-responses-to-anthropic-messages",
  "openai-chat-completions-to-anthropic-messages",
]);

export function defaultMcpConfig(names: string[]): McpDraft {
  return {
    mcpServers: Object.fromEntries(names.map((name) => [name, {}])),
  };
}

export function defaultSkills(names: string[]): SkillDraft[] {
  return names.map((name) => ({ name: `${name}.md`, content: `# ${name}\n` }));
}

export const ROLE_TEMPLATES: Record<BuiltInRole, Omit<AgentPreset, "id">> = {
  agent: {
    name: "Agent",
    role: "agent",
    description: "通用 Agent，可在 workflow 中承担任意执行节点",
    avatarUrl: "",
    icon: "",
    backgroundUrl: "",
    runtimeKind: "claude-code",
    modelProvider: "anthropic-messages",
    providerId: "",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills([]),
    tools: DEFAULT_AGENT_TOOLS,
    boundWorkflowIds: [],
    boundWorkflowPluginTools: [],
    systemPrompt:
      "你是通用 Agent。根据 issue 和当前任务上下文完成被分配的工作，遵循项目规范，必要时修改代码、运行验证，并清晰汇报结果。",
    outputStyle: "",
    temperature: 0.3,
    maxTokens: 8192,
    enabled: true,
  },
  scheduler: {
    name: "Scheduler",
    role: "scheduler",
    description: "任务调度者，负责任务分发和协调",
    avatarUrl: "",
    icon: "",
    backgroundUrl: "",
    runtimeKind: "claude-code",
    modelProvider: "anthropic-messages",
    providerId: "",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: defaultSkills(["planning", "task-split"]),
    tools: DEFAULT_AGENT_TOOLS,
    boundWorkflowIds: [],
    boundWorkflowPluginTools: [],
    systemPrompt:
      "你是调度者 Agent。负责接收用户任务，分析任务类型，分发给合适的执行者。你需要跟踪任务状态，确保所有子任务按时完成。",
    outputStyle: "",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
  bot: {
    name: "Bot Agent",
    role: "bot",
    description: "消息机器人，负责处理外部聊天平台中的用户消息",
    avatarUrl: "",
    icon: "",
    backgroundUrl: "",
    runtimeKind: "claude-code",
    modelProvider: "anthropic-messages",
    providerId: "",
    modelId: "claude-sonnet-4-6",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: {},
    skills: [],
    tools: DEFAULT_AGENT_TOOLS,
    boundWorkflowIds: [],
    boundWorkflowPluginTools: [],
    systemPrompt:
      "你是 Agent Spaces 的消息机器人。你会简洁回答来自外部聊天平台的用户消息。不要执行危险操作；需要用户提供更多信息时直接询问。",
    outputStyle: "",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  },
};

export function normalizeAgent(agent: AgentConfig): AgentPreset {
  return {
    ...agent,
    name: agent.name || "New Agent",
    description: agent.description || "",
    avatarUrl: agent.avatarUrl || "",
    icon: agent.icon || "",
    backgroundUrl: agent.backgroundUrl || "",
    runtimeKind: agent.runtimeKind || "langchain",
    modelProvider: agent.modelProvider || "",
    providerId: agent.providerId || "",
    modelId: agent.modelId || "claude-sonnet-4-6",
    apiBase: agent.apiBase || "",
    apiKey: agent.apiKey || "",
    workingDir: agent.workingDir || "",
    mcps: normalizeMcpDraft(agent.mcps),
    skills: normalizeSkillDrafts(agent.skills),
    tools: normalizeToolDrafts(agent.tools),
    boundWorkflowIds: Array.isArray(agent.boundWorkflowIds) ? agent.boundWorkflowIds : [],
    boundWorkflowPluginTools: Array.isArray(agent.boundWorkflowPluginTools) ? agent.boundWorkflowPluginTools : [],
    systemPrompt: agent.systemPrompt || "",
    outputStyle: agent.outputStyle || "",
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

export type AgentPresetPayload = Omit<AgentPreset, "id" | "modelProvider" | "apiBase" | "apiKey"> & {
  modelProvider?: AgentConfig["modelProvider"];
};

export function serializeAgent(agent: AgentPreset): AgentPresetPayload {
  const {
    id: _id,
    apiBase: _apiBase,
    apiKey: _apiKey,
    provider: _provider,
    baseURL: _baseURL,
    model: _model,
    ...body
  } = agent as AgentPreset & { provider?: unknown; baseURL?: unknown; model?: unknown };
  void _id;
  void _apiBase;
  void _apiKey;
  void _provider;
  void _baseURL;
  void _model;
  return {
    ...body,
    modelProvider: body.modelProvider || undefined,
  };
}

export function newAgentDraft(role: BuiltInRole): AgentPreset {
  return {
    id: `draft-${role}-${Date.now()}`,
    ...ROLE_TEMPLATES[role],
    mcps: structuredClone(ROLE_TEMPLATES[role].mcps),
    skills: ROLE_TEMPLATES[role].skills.map((skill) => ({ ...skill })),
    tools: [...ROLE_TEMPLATES[role].tools],
    boundWorkflowIds: [...ROLE_TEMPLATES[role].boundWorkflowIds],
    boundWorkflowPluginTools: ROLE_TEMPLATES[role].boundWorkflowPluginTools.map((item) => ({ ...item })),
  };
}

export function cloneAgent(agent: AgentPreset): AgentPreset {
  return {
    ...agent,
    id: `draft-clone-${Date.now()}`,
    name: `${agent.name} (副本)`,
    mcps: structuredClone(agent.mcps),
    skills: agent.skills.map((skill) => ({ ...skill })),
    tools: [...agent.tools],
    boundWorkflowIds: [...agent.boundWorkflowIds],
    boundWorkflowPluginTools: agent.boundWorkflowPluginTools.map((item) => ({ ...item })),
  };
}

export function newEmptyAgent(): AgentPreset {
  return {
    id: `draft-empty-${Date.now()}`,
    name: "",
    role: "agent",
    description: "",
    avatarUrl: "",
    icon: "",
    backgroundUrl: "",
    runtimeKind: "claude-code",
    modelProvider: "",
    providerId: "",
    modelId: "",
    apiBase: "",
    apiKey: "",
    workingDir: "",
    mcps: {},
    skills: [],
    tools: DEFAULT_AGENT_TOOLS,
    boundWorkflowIds: [],
    boundWorkflowPluginTools: [],
    systemPrompt: "",
    outputStyle: "",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
  };
}

export function isDraftAgent(agent: AgentPreset) {
  return agent.id.startsWith("draft-");
}

export function isAnthropicBridgeProvider(provider: AgentPreset["modelProvider"]): boolean {
  return Boolean(provider && ANTHROPIC_BRIDGE_PROVIDERS.has(provider));
}

export function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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

export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
