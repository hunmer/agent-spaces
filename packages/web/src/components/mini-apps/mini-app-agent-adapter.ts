import { type AgentConfig } from "@agent-spaces/shared";
import {
  type AgentPreset,
  normalizeAgent,
  DEFAULT_AGENT_TOOLS,
  defaultMcpConfig,
} from "@/components/sidebar/agent-shared";
import type { MiniAppAgentConfig } from "@agent-spaces/sdk";

/**
 * MiniAppAgentConfig → AgentPreset（编辑器加载用）。
 * - avatar（单字段，emoji 或 URL）↔ icon
 * - tools / agentId 不进入 AgentPreset 字段语义，原值保留在闭包里供回写
 * - AgentPreset 强制必填字段用默认值兜底，UI 上被隐藏不编辑
 */
export function miniAppConfigToAgentPreset(config: MiniAppAgentConfig): AgentPreset {
  const base: AgentConfig = {
    id: config.id,
    name: config.name || "Agent",
    role: "agent",
    description: "",
    runtimeKind: "langchain",
    modelProvider: (config.modelProvider as AgentConfig["modelProvider"]) || undefined,
    providerId: config.providerId || "",
    modelId: config.modelId || "",
    apiBase: config.apiBase || "",
    apiKey: config.apiKey || "",
    workingDir: "",
    mcps: defaultMcpConfig([]),
    skills: [],
    tools: DEFAULT_AGENT_TOOLS,
    systemPrompt: config.systemPrompt || "",
    outputStyle: "",
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? 4096,
    avatarUrl: "",
    icon: config.avatar || "",
    backgroundUrl: "",
    enabled: true,
  };
  return normalizeAgent(base);
}

/**
 * AgentPreset → MiniAppAgentConfig（编辑器保存用）。
 * @param preset 编辑器 draft
 * @param original 原始 MiniAppAgentConfig，回填 tools / agentId（不参与编辑）
 */
export function agentPresetToMiniAppConfig(
  preset: AgentPreset,
  original: MiniAppAgentConfig,
): MiniAppAgentConfig {
  return {
    id: preset.id,
    name: preset.name,
    avatar: preset.icon || preset.avatarUrl || undefined,
    agentId: original.agentId,
    modelProvider: preset.modelProvider || undefined,
    providerId: preset.providerId || undefined,
    modelId: preset.modelId || undefined,
    systemPrompt: preset.systemPrompt || undefined,
    temperature: preset.temperature,
    maxTokens: preset.maxTokens,
    tools: original.tools,
  };
}
