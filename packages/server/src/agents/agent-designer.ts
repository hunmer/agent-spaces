import type { AgentConfig } from '@agent-spaces/shared';
import { v4 as uuid } from 'uuid';
import { AGENT_GENERATOR_PRESET_ID, readAgentTemplate } from '../services/agent.js';

export interface AgentDesign {
  name: string;
  description: string;
  systemPrompt: string;
}

export interface PromptOptimizationResult {
  systemPrompt: string;
}

export interface TeamMemberSelectionInput {
  name: string;
  description: string;
}

export interface TeamMemberSelectionResult {
  agents: AgentConfig[];
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

const SYSTEM_PROMPT = `You design Agent Spaces agents — and an agent can be anyone, in any domain.
Return only a valid JSON object with this exact schema:
{
  "name": "short agent name",
  "description": "one sentence description",
  "systemPrompt": "markdown system prompt"
}

Format rules:
- Do not wrap the JSON in markdown fences.
- name must be concise and suitable for a UI label.
- description must capture the agent's role in one sentence.
- systemPrompt must be valid Markdown.

How to shape the systemPrompt:
- Follow the user's intent, never a fixed template. The agent can be a software engineer, but just as easily a writer, a tutor, a coach, a game character, a companion, a domain expert, a role-play persona — whatever the request is actually about. Do not default to a dry technical/engineering style unless that is what is asked for.
- Give the agent a real voice. Where it fits, let it have personality, a consistent tone, quirks, or a point of view, so it reads as a living character rather than a generic instruction list.
- Shape the structure to the purpose. Use a tidy role / responsibilities / workflow / constraints breakdown only when precision and rigor serve the role. For looser, warmer, or more playful roles, prefer conversational, narrative, or lightweight structure instead.
- Match the user's language: if they write in Chinese, write the systemPrompt in Chinese.
- Stay grounded and genuinely useful to the user's request.`;

const TEAM_MEMBER_SELECTION_PROMPT = [
  'You are assembling a new collaboration team.',
  'Design 2 to 4 complementary agents for the team title and description.',
  'Return only a valid JSON object with this exact schema: {"agents":[{"name":"short name","description":"one sentence","systemPrompt":"markdown system prompt"}]}.',
  'Each agent must have a distinct responsibility and a directly usable system prompt.',
  'Each system prompt must state when work is handed off with `team_message_send`, which teammate role should receive it, and that the agent must stop after sending.',
  'Escape all newlines and double quotes inside JSON strings, and do not use triple-backtick code fences.',
  'Do not wrap the JSON in markdown fences or mention system internals.',
].join('\n');

const TEAM_AGENT_TOOL_INSTRUCTIONS = [
  '## Team collaboration tool',
  '- Use `team_message_send` whenever another teammate should continue the work; do not only mention the teammate in plain text.',
  '- Select the exact recipient agent id from the current team members provided at runtime.',
  '- Send the complete result and enough context for the recipient to continue without reconstructing prior work.',
  '- After sending the handoff, stop and wait for the next team message.',
].join('\n');

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

  const content = await requestText(config, buildDesignSystemPrompt(config), prompt);
  console.info('[agent-designer] model text extracted', {
    length: content.length,
    preview: content.slice(0, 500),
  });
  return normalizeDesign(parseJsonObject(content));
}

export async function generateTeamMemberSelection(
  input: TeamMemberSelectionInput,
): Promise<TeamMemberSelectionResult> {
  const name = input.name.trim();
  if (!name) throw new Error('team name is required');

  const config = resolveModelConfig();
  const template = readAgentTemplate(AGENT_GENERATOR_PRESET_ID);
  if (!config || !template) {
    throw new Error(`Configure model settings for ${AGENT_GENERATOR_PRESET_ID} before generating team members.`);
  }

  const content = await requestText(
    config,
    buildTeamMemberSelectionSystemPrompt(config),
    [
      `Team title: ${name}`,
      `Team description: ${input.description.trim() || '(empty)'}`,
    ].join('\n'),
  );

  return normalizeTeamMemberSelection(parseJsonObject(content), template);
}

export async function optimizeAgentPrompt(
  userPrompt: string,
  currentPrompt: string,
): Promise<PromptOptimizationResult> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('prompt is required');

  const config = resolveModelConfig();
  if (!config) {
    throw new Error(`Configure model settings for ${AGENT_GENERATOR_PRESET_ID} before optimizing prompts.`);
  }

  console.info('[agent-designer] optimizing agent prompt', {
    agentId: AGENT_GENERATOR_PRESET_ID,
    provider: config.modelProvider ?? inferProvider(config.apiBase),
    modelId: config.modelId,
    apiBase: maskUrl(config.apiBase),
    promptLength: prompt.length,
    currentPromptLength: currentPrompt.trim().length,
  });

  const content = await requestText(
    config,
    buildOptimizationSystemPrompt(config),
    buildPromptOptimizationUserPrompt(prompt, currentPrompt),
  );
  console.info('[agent-designer] optimized prompt received', {
    length: content.length,
    preview: content.slice(0, 500),
  });
  return { systemPrompt: normalizePrompt(content) };
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
  return requestText(config, buildDesignSystemPrompt(config), userPrompt);
}

async function requestText(config: ModelConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  const provider = config.modelProvider ?? inferProvider(config.apiBase);
  if (provider === 'anthropic-messages') return requestAnthropic(config, systemPrompt, userPrompt);
  if (provider === 'gemini-generate-content') return requestGemini(config, systemPrompt, userPrompt);
  return requestOpenAICompatible(
    config,
    systemPrompt,
    userPrompt,
    provider === 'openai-responses' || provider === 'openai-responses-to-anthropic-messages',
  );
}

async function requestOpenAICompatible(
  config: ModelConfig,
  systemPrompt: string,
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
            input: `${systemPrompt}\n\nUser request:\n${userPrompt}`,
            temperature: config.temperature ?? 0.2,
            max_output_tokens: config.maxTokens,
          }
        : {
            model: config.modelId,
            messages: [
              { role: 'system', content: systemPrompt },
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

async function requestAnthropic(config: ModelConfig, systemPrompt: string, userPrompt: string): Promise<string> {
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
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.2,
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok || body.error) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
  return body.text;
}

async function requestGemini(config: ModelConfig, systemPrompt: string, userPrompt: string): Promise<string> {
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
        maxOutputTokens: config.maxTokens,
      },
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok || body.error) throw new Error(body.error || `Agent design generation failed with status ${response.status}`);
  return body.text;
}

function buildDesignSystemPrompt(config: ModelConfig): string {
  const custom = config.systemPrompt?.trim();
  if (!custom) return SYSTEM_PROMPT;
  return `${custom}\n\n${SYSTEM_PROMPT}`;
}

function buildOptimizationSystemPrompt(config: ModelConfig): string {
  const custom = config.systemPrompt?.trim();
  const base = [
    'You optimize agent system prompts.',
    'Return only the rewritten prompt text.',
    'Do not wrap the result in markdown fences.',
    'Do not add commentary, bullets about the process, or any explanation outside the prompt.',
    'Keep the prompt actionable, concise, and directly usable as a system prompt.',
    'Preserve important constraints from the current prompt unless the user request clearly asks to change them.',
  ].join('\n');
  if (!custom) return base;
  return `${custom}\n\n${base}`;
}

function buildTeamMemberSelectionSystemPrompt(config: ModelConfig): string {
  const custom = config.systemPrompt?.trim();
  return custom ? `${custom}\n\n${TEAM_MEMBER_SELECTION_PROMPT}` : TEAM_MEMBER_SELECTION_PROMPT;
}

function buildPromptOptimizationUserPrompt(userRequest: string, currentPrompt: string): string {
  return [
    'User request:',
    userRequest,
    '',
    'Current system prompt:',
    currentPrompt.trim() || '(empty)',
    '',
    'Rewrite the current system prompt according to the user request. Return only the final prompt text.',
  ].join('\n');
}

function normalizePrompt(text: string): string {
  return text.trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '');
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

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const embedded = findFirstJsonObject(trimmed);
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)?.[1]?.trim();
  const candidates = [...new Set([trimmed, embedded, fenced].filter((value): value is string => Boolean(value)))];

  for (const candidate of candidates) {
    for (const source of [candidate, repairJsonStringLiterals(candidate)]) {
      try {
        return JSON.parse(source);
      } catch {
        // Try the next representation.
      }
    }
  }
  throw new Error('Model did not return valid JSON.');
}

function repairJsonStringLiterals(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!inString) {
      result += char;
      if (char === '"') inString = true;
      continue;
    }
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      const next = text[index + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        result += char;
        escaped = true;
      } else {
        result += '\\\\';
      }
      continue;
    }
    if (char === '"') {
      if (isJsonStringTerminator(text, index + 1)) {
        result += char;
        inString = false;
      } else {
        result += '\\"';
      }
      continue;
    }
    if (char === '\n') result += '\\n';
    else if (char === '\r') result += '\\r';
    else if (char === '\t') result += '\\t';
    else if (char.charCodeAt(0) < 0x20) result += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else result += char;
  }
  return result;
}

function isJsonStringTerminator(text: string, start: number): boolean {
  let index = start;
  while (/\s/.test(text[index] ?? '')) index += 1;
  const next = text[index];
  if (next === undefined || next === ':' || next === ',' || next === '}') return true;
  if (next !== ']') return false;
  index += 1;
  while (/\s/.test(text[index] ?? '')) index += 1;
  return text[index] === undefined || [',', '}', ']'].includes(text[index]);
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
        return text.slice(start, index + 1);
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

export function normalizeTeamMemberSelection(
  value: unknown,
  template: AgentConfig,
): TeamMemberSelectionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Generated team member selection must be a JSON object.');
  }
  const agents = (value as { agents?: unknown }).agents;
  if (!Array.isArray(agents) || agents.length === 0) throw new Error('Generated JSON must include agents.');
  const normalized = agents
    .map(normalizeDesign)
    .filter((agent) => agent.name.trim().toLowerCase().replace(/[\s_]+/g, '-') !== AGENT_GENERATOR_PRESET_ID)
    .slice(0, 4)
    .map((agent) => ({
      id: uuid(),
      name: agent.name,
      role: 'agent',
      description: agent.description,
      runtimeKind: 'langchain' as const,
      modelProvider: template.modelProvider ?? inferProvider(template.apiBase),
      providerId: template.providerId,
      modelId: template.modelId,
      apiBase: template.apiBase,
      workingDir: '',
      mcps: { mcpServers: {} },
      skills: [],
      tools: ['team_message_send' as const],
      systemPrompt: `${agent.systemPrompt}\n\n${TEAM_AGENT_TOOL_INSTRUCTIONS}`,
      outputStyle: '',
      temperature: template.temperature ?? 0.3,
      maxTokens: template.maxTokens ?? 4096,
      enabled: true,
    }));
  if (normalized.length === 0) throw new Error('Generated JSON did not include any usable agents.');
  return { agents: normalized };
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
