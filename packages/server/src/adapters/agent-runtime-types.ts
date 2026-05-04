import type { AgentOptions, ApiType } from '@codeany/open-agent-sdk';

export interface AgentRunResult {
  success: boolean;
  summary: string;
  artifacts: string[];
  error?: string;
  output: string[];
}

export interface AgentRuntime {
  execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  stop(): void;
}

export interface AgentRunOptions {
  maxTurns?: number;
  tools?: string[];
  mcpServers?: Record<string, unknown>;
  skills?: string[];
  configDir?: string;
  sandboxDirs?: string[];
  onEvent?: (event: AgentRuntimeEvent) => void;
}

export type AgentRuntimeEvent =
  | { type: 'output'; line: string }
  | { type: 'tool_use'; id: string; name: string; input?: unknown; line: string }
  | { type: 'tool_result'; toolUseId?: string; result: unknown };

export type AgentRuntimeKind = 'open-agent-sdk' | 'claude-code' | 'codex';

export interface AgentRuntimeConfig {
  kind?: AgentRuntimeKind;
  provider?: ApiType | string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  adapterBaseURL?: string;
  permissionMode?: AgentOptions['permissionMode'];
}

export function summarizeResult(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Completed agent execution';
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}
