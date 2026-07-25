import type { AgentOptions, ApiType } from '@codeany/open-agent-sdk';
import type { ClaudeHookEventName, MessageTokenUsage } from '@agent-spaces/shared';
import type { Message } from '@agent-spaces/shared';
import { resolveOutputStyleContent } from '../services/output-style.js';

export interface AgentRunResult {
  success: boolean;
  summary: string;
  artifacts: string[];
  error?: string;
  output: string[];
  sessionId?: string;
  usage?: MessageTokenUsage;
  costUsd?: number;
}

export interface AgentRuntime {
  execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  stop(): void;
}

export interface AgentRunOptions {
  maxTurns?: number;
  tools?: string[];
  functionTools?: AgentFunctionTool[];
  userAttachments?: Message['attachments'];
  mcpServers?: Record<string, unknown>;
  skills?: string[];
  configDir?: string;
  sandboxDirs?: string[];
  systemPrompt?: string;
  userPrompt?: string;
  outputStyle?: string;
  resumeSessionId?: string;
  pauseAfterTools?: string[];
  onEvent?: (event: AgentRuntimeEvent) => void;
}

export type AgentRuntimeEvent =
  | { type: 'output'; line: string }
  | { type: 'session'; sessionId: string }
  | { type: 'reasoning'; text: string; status?: 'streaming' | 'completed' }
  | { type: 'tool_use'; id: string; name: string; input?: unknown; line: string }
  | { type: 'tool_result'; toolUseId?: string; result: unknown }
  | { type: 'hook_event'; event: ClaudeHookEventName; matcher?: string; payload?: unknown };

export interface AgentFunctionTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnly?: boolean;
    destructive?: boolean;
    openWorld?: boolean;
  };
  execute: (input: unknown) => Promise<unknown>;
}

export type AgentRuntimeKind = 'open-agent-sdk' | 'claude-code' | 'codex' | 'grok' | 'gemini-cli' | 'langchain' | 'hermes' | 'pi';

export interface AgentRuntimeConfig {
  kind?: AgentRuntimeKind;
  provider?: ApiType | string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  adapterBaseURL?: string;
  maxTokens?: number;
  thinkingEnabled?: boolean;
  thinkingEffort?: 'low' | 'medium' | 'high';
  permissionMode?: AgentOptions['permissionMode'];
}

export function summarizeResult(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Completed agent execution';
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

export function appendOutputStyleToPrompt(prompt: string, outputStyle?: string): string {
  const style = resolveOutputStyleContent(outputStyle)?.trim();
  if (!style) return prompt;
  return [
    prompt.trimEnd(),
    '',
    'Output style instructions:',
    style,
  ].join('\n');
}
