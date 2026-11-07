import type { AgentConfig } from '@agent-spaces/shared';

export interface AiTextRequestConfig {
  modelProvider?: AgentConfig['modelProvider'];
  modelId: string;
  apiBase: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

export async function requestAiText(
  config: AiTextRequestConfig,
  input: { systemPrompt: string; userPrompt: string },
): Promise<string> {
  const provider = config.modelProvider ?? inferProvider(config.apiBase);
  if (provider === 'anthropic-messages') return requestAnthropic(config, input.systemPrompt, input.userPrompt);
  if (provider === 'gemini-generate-content') return requestGemini(config, input.systemPrompt, input.userPrompt);
  return requestOpenAICompatible(
    config,
    input.systemPrompt,
    input.userPrompt,
    provider === 'openai-responses' || provider === 'openai-responses-to-anthropic-messages',
  );
}

export function maskAiTextUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.slice(0, 80);
  }
}

async function requestOpenAICompatible(
  config: AiTextRequestConfig,
  systemPrompt: string,
  userPrompt: string,
  useResponsesApi: boolean,
): Promise<string> {
  const response = await fetch(joinUrl(config.apiBase, useResponsesApi ? '/responses' : '/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      useResponsesApi
        ? {
            model: config.modelId,
            input: `${systemPrompt}\n\n${userPrompt}`,
            temperature: config.temperature ?? 0.2,
            max_output_tokens: config.maxTokens ?? 1024,
          }
        : {
            model: config.modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: config.temperature ?? 0.2,
            max_tokens: config.maxTokens ?? 1024,
          },
    ),
  });
  const body = await readResponseBody(response);
  if (!response.ok || body.error) throw new Error(body.error || `AI text request failed with status ${response.status}`);
  return body.text;
}

async function requestAnthropic(
  config: AiTextRequestConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(getAnthropicMessagesUrl(config.apiBase), {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelId,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: config.maxTokens ?? 1024,
      temperature: config.temperature ?? 0.2,
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok || body.error) throw new Error(body.error || `AI text request failed with status ${response.status}`);
  return body.text;
}

async function requestGemini(
  config: AiTextRequestConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(joinUrl(config.apiBase, `/models/${encodeURIComponent(config.modelId)}:generateContent`), {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: config.temperature ?? 0.2,
        maxOutputTokens: config.maxTokens ?? 1024,
      },
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok || body.error) throw new Error(body.error || `AI text request failed with status ${response.status}`);
  return body.text;
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

  const output = Array.isArray(json.output) ? json.output : [];
  const responseOutputText = output
    .flatMap((item) => Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [])
    .map((part) => typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')
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
    if (url.hostname === 'api.anthropic.com') return joinUrl(apiBase, '/messages');
    return joinUrl(apiBase, '/v1/messages');
  } catch {
    return apiBase;
  }
}
