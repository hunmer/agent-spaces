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

  console.info('[agent-designer] generating agent design', {
    agentId: AGENT_GENERATOR_PRESET_ID,
    provider: config.modelProvider ?? inferProvider(config.apiBase),
    modelId: config.modelId,
    apiBase: maskUrl(config.apiBase),
    promptLength: prompt.length,
  });

  const content = await requestDesign(config, prompt);
  console.info('[agent-designer] model text extracted', {
    length: content.length,
    preview: content.slice(0, 500),
  });
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
  if (!response.ok || body.error) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
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
  if (!response.ok || body.error) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
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
  if (!response.ok || body.error) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
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
    console.info('[agent-designer] provider response received', {
      status: response.status,
      keys: Object.keys(json),
      preview: raw.slice(0, 800),
    });
    if (isAgentDesignJson(json)) return { text: JSON.stringify(json) };
    return {
      text: extractText(json),
      error: extractError(json),
    };
  } catch {
    console.info('[agent-designer] provider raw text received', {
      status: response.status,
      preview: raw.slice(0, 800),
    });
    return { text: raw };
  }
}

function extractText(json: Record<string, unknown>): string {
  const outputText = json.output_text;
  if (typeof outputText === 'string') return outputText;

  const output = Array.isArray(json.output) ? json.output : [];
  const responseOutputText = output
    .flatMap((item) => Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [])
    .map((part) => {
      const record = part as { text?: unknown; type?: unknown };
      return typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean)
    .join('\n');
  if (responseOutputText) return responseOutputText;

  const choices = Array.isArray(json.choices) ? json.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  if (typeof firstChoice?.text === 'string') return firstChoice.text;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    const messageText = message.content
      .map((part) => typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')
      .filter(Boolean)
      .join('\n');
    if (messageText) return messageText;
  }

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

function isAgentDesignJson(json: Record<string, unknown>): boolean {
  return typeof json.name === 'string'
    && typeof json.description === 'string'
    && typeof json.systemPrompt === 'string';
}

function extractError(json: Record<string, unknown>): string | undefined {
  if (json.success === false) {
    return typeof json.msg === 'string' ? json.msg : 'Provider returned success=false';
  }

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
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);

    const candidate = findFirstJsonObject(trimmed);
    if (candidate) return JSON.parse(candidate);
    throw new Error('Model did not return valid JSON.');
  }
}

function findFirstJsonObject(text: string): string | null {
  const starts: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') starts.push(index);
  }

  for (const start of starts) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, index + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          break;
        }
      }
    }
  }

  return null;
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
    if (url.pathname.endsWith('/messages')) return apiBase;
    if (url.hostname === 'api.anthropic.com') {
      return joinUrl(apiBase, '/messages');
    }
    return joinUrl(apiBase, '/v1/messages');
  } catch {
    return apiBase;
  }
}

function maskUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.slice(0, 120);
  }
}
