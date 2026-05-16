import type { AgentConfig } from '@agent-spaces/shared';
import { AGENT_GENERATOR_PRESET_ID, readAgentTemplate } from '../services/agent.js';

export interface AgentDesign {
  name: string;
  description: string;
  systemPrompt: string;
}

interface ModelConfig {
  modelProvider?: AgentConfig['modelProvider'];
  modelId: string;
  apiBase: string;
  apiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

const SYSTEM_PROMPT = `You generate Agent Spaces agent presets.
Return only a valid JSON object with this exact schema:
{
  "name": "short agent name",
  "description": "one sentence description",
  "systemPrompt": "markdown system prompt"
}

Rules:
- Do not wrap the JSON in markdown fences.
- name must be concise and suitable for a UI label.
- description must explain the agent's responsibility.
- systemPrompt must be valid Markdown and include role, responsibilities, workflow, constraints, and output expectations.
- Keep the systemPrompt actionable and specific to the user's request.`;

export async function generateAgentDesign(userPrompt: string): Promise<AgentDesign> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('prompt is required');

  const config = resolveModelConfig();
  if (!config) {
    throw new Error(`Configure model settings for ${AGENT_GENERATOR_PRESET_ID} before generating agents.`);
  }

  const content = await requestDesign(config, prompt);
  return normalizeDesign(parseJsonObject(content));
}

function resolveModelConfig(): ModelConfig | null {
  const preset = readAgentTemplate(AGENT_GENERATOR_PRESET_ID);
  if (preset?.apiBase && preset.apiKey && preset.modelId) {
    return {
      modelProvider: preset.modelProvider,
      modelId: preset.modelId,
      apiBase: preset.apiBase,
      apiKey: preset.apiKey,
      systemPrompt: preset.systemPrompt,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
    };
  }

  return null;
}

async function requestDesign(config: ModelConfig, userPrompt: string): Promise<string> {
  const provider = config.modelProvider ?? inferProvider(config.apiBase);
  if (provider === 'anthropic-messages') return requestAnthropic(config, userPrompt);
  if (provider === 'gemini-generate-content') return requestGemini(config, userPrompt);
  return requestOpenAICompatible(
    config,
    userPrompt,
    provider === 'openai-responses' || provider === 'openai-responses-to-anthropic-messages',
  );
}

async function requestOpenAICompatible(
  config: ModelConfig,
  userPrompt: string,
  useResponsesApi: boolean,
): Promise<string> {
  const url = joinUrl(config.apiBase, useResponsesApi ? '/responses' : '/chat/completions');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      useResponsesApi
        ? {
            model: config.modelId,
            input: `${buildSystemPrompt(config)}\n\nUser request:\n${userPrompt}`,
            temperature: config.temperature ?? 0.2,
            max_output_tokens: config.maxTokens,
          }
        : {
            model: config.modelId,
            messages: [
              { role: 'system', content: buildSystemPrompt(config) },
              { role: 'user', content: userPrompt },
            ],
            temperature: config.temperature ?? 0.2,
            max_tokens: config.maxTokens,
          },
    ),
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
  return body.text;
}

async function requestAnthropic(config: ModelConfig, userPrompt: string): Promise<string> {
  const response = await fetch(getAnthropicMessagesUrl(config.apiBase), {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelId,
      system: buildSystemPrompt(config),
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.2,
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
  return body.text;
}

async function requestGemini(config: ModelConfig, userPrompt: string): Promise<string> {
  const response = await fetch(joinUrl(config.apiBase, `/models/${encodeURIComponent(config.modelId)}:generateContent`), {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(config) }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: config.temperature ?? 0.2,
        maxOutputTokens: config.maxTokens,
      },
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
  return body.text;
}

function buildSystemPrompt(config: ModelConfig): string {
  const custom = config.systemPrompt?.trim();
  if (!custom) return SYSTEM_PROMPT;
  return `${custom}\n\n${SYSTEM_PROMPT}`;
}

async function readResponseBody(response: Response): Promise<{ text: string; error?: string }> {
  const raw = await response.text();
  if (!raw) return { text: '' };
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    return {
      text: extractText(json),
      error: extractError(json),
    };
  } catch {
    return { text: raw };
  }
}

function extractText(json: Record<string, unknown>): string {
  const outputText = json.output_text;
  if (typeof outputText === 'string') return outputText;

  const choices = Array.isArray(json.choices) ? json.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  if (typeof message?.content === 'string') return message.content;

  const content = Array.isArray(json.content) ? json.content : [];
  const anthropicText = content
    .map((part) => typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')
    .filter(Boolean)
    .join('\n');
  if (anthropicText) return anthropicText;

  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
  const parts = ((firstCandidate?.content as Record<string, unknown> | undefined)?.parts ?? []) as unknown[];
  return parts
    .map((part) => typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')
    .filter(Boolean)
    .join('\n');
}

function extractError(json: Record<string, unknown>): string | undefined {
  const error = json.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return typeof json.message === 'string' ? json.message : undefined;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Model did not return valid JSON.');
  }
}

function normalizeDesign(value: unknown): AgentDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Generated agent design must be a JSON object.');
  }
  const data = value as Partial<Record<keyof AgentDesign, unknown>>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt.trim() : '';
  if (!name || !description || !systemPrompt) {
    throw new Error('Generated JSON must include name, description, and systemPrompt.');
  }
  return { name, description, systemPrompt };
}

function inferProvider(apiBase?: string): NonNullable<AgentConfig['modelProvider']> {
  if (apiBase?.includes('anthropic.com')) return 'anthropic-messages';
  if (apiBase?.includes('generativelanguage.googleapis.com')) return 'gemini-generate-content';
  return 'openai-chat-completions';
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function getAnthropicMessagesUrl(apiBase: string): string {
  try {
    const url = new URL(apiBase);
    if (url.hostname === 'api.anthropic.com' && !url.pathname.endsWith('/messages')) {
      return joinUrl(apiBase, '/messages');
    }
  } catch {
    return apiBase;
  }
  return apiBase;
}
