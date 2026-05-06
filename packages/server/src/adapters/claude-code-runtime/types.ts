import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:http';

export type AnthropicBridgeProvider =
  | 'openai-responses-to-anthropic-messages'
  | 'openai-chat-completions-to-anthropic-messages';

export interface ClaudeAdapterRun {
  url: string;
  release: () => Promise<void>;
}

export interface SharedClaudeAdapter {
  key: string;
  server: Server;
  url: string;
  refs: number;
}

export type AnthropicBridgeConfig = {
  provider: AnthropicBridgeProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingEnabled?: boolean;
  thinkingEffort?: 'low' | 'medium' | 'high';
};

export type AnthropicRequest = {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicBlock[] }>;
  system?: string | Array<{ text?: string }>;
  max_tokens?: number;
  thinking?: {
    type?: 'enabled' | 'disabled';
    budget_tokens?: number;
  };
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  tools?: Array<{ name: string; description?: string; input_schema?: Record<string, unknown> }>;
  tool_choice?: { type?: string; name?: string };
};

export type AnthropicBlock =
  | { type: 'thinking'; thinking: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | AnthropicBlock[]; is_error?: boolean };

export type ResponsesBody = {
  id?: string;
  model?: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

export type OpenAIChatBody = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

export type OpenAIChatRequest = {
  model: string;
  messages: Array<Record<string, unknown>>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: unknown;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
};

export function isAnthropicBridgeProvider(provider?: string): provider is AnthropicBridgeProvider {
  return provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages';
}

export function formatBridgeProvider(provider?: string): string {
  if (provider === 'openai-chat-completions-to-anthropic-messages') {
    return 'OpenAI Chat Completions To Anthropic Messages';
  }
  return 'OpenAI Responses To Anthropic Messages';
}
