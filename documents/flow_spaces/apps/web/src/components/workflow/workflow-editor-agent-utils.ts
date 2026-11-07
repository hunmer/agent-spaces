import type { AgentConfig, Workflow, WorkflowAgentChatMessage as PersistedWorkflowAgentChatMessage, WorkflowAgentTimelineItem, WorkflowAgentToolCall } from '@agent-spaces/shared';
import type { ChatMessage } from '@/components/ui/floating-chat-widget';
import { fetchWithAuth } from '@/lib/auth';
import { normalizeAgent, newAgentDraft, type AgentPreset } from '@/components/sidebar/agent-shared';

// ---- Type aliases ----

export type WorkflowToolCall = WorkflowAgentToolCall;
export type WorkflowTimelineItem = WorkflowAgentTimelineItem;

export interface WorkflowAgentChatMessage extends ChatMessage {
  toolCalls?: WorkflowToolCall[];
  timeline?: WorkflowTimelineItem[];
}

export interface SseEvent {
  event: string;
  data: unknown;
}

export interface ThinkingStreamState {
  inThinking: boolean;
  buffer: string;
}

// ---- Constants ----

export const WORKFLOW_AGENT_TEMPLATE_ID = 'workflow-editor-agent';
const WORKFLOW_AGENT_FIXED_SYSTEM_PROMPT = '工作流编辑助手提示词由系统根据当前画布动态生成，不能在模型设置中修改。';
export const WORKFLOW_AGENT_FIXED_VALUES: Partial<AgentPreset> = {
  name: '工作流助手',
  role: 'agent',
  description: '帮助编辑当前可视化工作流的 LangChain Agent',
  runtimeKind: 'langchain',
  workingDir: '',
  mcps: {},
  skills: [],
  tools: [],
  systemPrompt: WORKFLOW_AGENT_FIXED_SYSTEM_PROMPT,
  templateId: WORKFLOW_AGENT_TEMPLATE_ID,
  enabled: true,
};

// ---- Agent preset helpers ----

export async function resolveWorkflowAgentPreset(): Promise<AgentConfig | null> {
  const response = await fetchWithAuth('/api/agents/presets');
  if (!response.ok) return null;
  const presets = await response.json() as AgentConfig[];
  return presets.find(isWorkflowAgentPreset) ?? null;
}

export async function resolveWorkflowAgentSettingsDraft(): Promise<AgentPreset> {
  const response = await fetchWithAuth('/api/agents/presets');
  const presets = response.ok ? await response.json() as AgentConfig[] : [];
  const existing = presets.find(isWorkflowAgentPreset);
  if (existing) return withWorkflowAgentFixedValues(normalizeAgent(existing));
  return withWorkflowAgentFixedValues({
    ...newAgentDraft('agent'),
    id: `draft-${WORKFLOW_AGENT_TEMPLATE_ID}-${Date.now()}`,
  });
}

export function isWorkflowAgentPreset(preset: AgentConfig): boolean {
  return preset.templateId === WORKFLOW_AGENT_TEMPLATE_ID || preset.name === WORKFLOW_AGENT_FIXED_VALUES.name;
}

function withWorkflowAgentFixedValues(agent: AgentPreset): AgentPreset {
  return {
    ...agent,
    ...WORKFLOW_AGENT_FIXED_VALUES,
    modelProvider: agent.modelProvider,
    modelId: agent.modelId,
    apiBase: agent.apiBase,
    apiKey: agent.apiKey,
    avatarUrl: agent.avatarUrl,
    icon: agent.icon,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
  };
}

// ---- SSE stream ----

export async function readSseStream(response: Response, onEvent: (event: SseEvent) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const event = parseSseEvent(chunk);
      if (event) onEvent(event);
    }
  }

  if (buffer.trim()) {
    const event = parseSseEvent(buffer);
    if (event) onEvent(event);
  }
}

function parseSseEvent(chunk: string): SseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return { event, data: dataLines.join('\n') };
  }
}

// ---- Thinking stream parser ----

export function consumeThinkingStream(state: ThinkingStreamState, text: string): Array<{ type: 'content' | 'thinking'; content: string }> {
  const parts: Array<{ type: 'content' | 'thinking'; content: string }> = [];
  let rest = state.buffer + text;
  state.buffer = '';

  while (rest.length) {
    if (state.inThinking) {
      const closeIndex = rest.search(/<\/think>/i);
      if (closeIndex === -1) {
        if (rest.trim()) parts.push({ type: 'thinking', content: rest });
        break;
      }
      const thinking = rest.slice(0, closeIndex);
      if (thinking.trim()) parts.push({ type: 'thinking', content: thinking });
      rest = rest.slice(closeIndex).replace(/^<\/think>/i, '');
      state.inThinking = false;
      continue;
    }

    const openIndex = rest.search(/<think\s*>/i);
    if (openIndex === -1) {
      const maybePartialOpen = findPartialThinkOpen(rest);
      if (maybePartialOpen >= 0) {
        const beforePartial = rest.slice(0, maybePartialOpen);
        if (beforePartial.trim()) parts.push({ type: 'content', content: beforePartial });
        state.buffer = rest.slice(maybePartialOpen);
      } else if (rest.trim()) {
        parts.push({ type: 'content', content: rest });
      }
      break;
    }

    const before = rest.slice(0, openIndex);
    if (before.trim()) parts.push({ type: 'content', content: before });
    rest = rest.slice(openIndex).replace(/^<think\s*>/i, '');
    state.inThinking = true;
  }

  return parts;
}

function findPartialThinkOpen(text: string): number {
  const lower = text.toLowerCase();
  const token = '<think';
  const maxLength = Math.min(token.length - 1, lower.length);
  for (let length = maxLength; length > 0; length--) {
    const suffix = lower.slice(-length);
    if (token.startsWith(suffix)) return lower.length - length;
  }
  return -1;
}

// ---- Message serialization ----

export function hydrateWorkflowAgentChatMessage(message: PersistedWorkflowAgentChatMessage): WorkflowAgentChatMessage {
  const timestamp = new Date(message.timestamp);
  const timeline = message.timeline?.length
    ? message.timeline
    : message.toolCalls?.map((toolCall) => ({ ...toolCall, type: 'tool' as const }));
  return {
    ...message,
    timeline,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
  };
}

export function serializeWorkflowAgentChatMessage(message: WorkflowAgentChatMessage): PersistedWorkflowAgentChatMessage {
  return {
    ...message,
    timeline: message.timeline?.map(sanitizeWorkflowAgentTimelineItem),
    toolCalls: message.toolCalls?.map(sanitizeWorkflowAgentToolCall),
    timestamp: message.timestamp.toISOString(),
  };
}

export function getWorkflowAgentTimeline(message: WorkflowAgentChatMessage): WorkflowTimelineItem[] {
  const timeline = message.timeline?.length
    ? message.timeline
    : message.toolCalls?.map((toolCall) => ({ ...toolCall, type: 'tool' as const })) ?? [];
  const thinking = timeline.find((item) => item.type === 'thinking');
  if (!thinking) return timeline;
  return [thinking, ...timeline.filter((item) => item.id !== thinking.id)];
}

export function getWorkflowAgentMessageText(message: WorkflowAgentChatMessage): string {
  const content = message.content.trim();
  if (content) return content;

  return getWorkflowAgentTimeline(message)
    .filter((item): item is Extract<WorkflowTimelineItem, { type: 'message' }> => item.type === 'message')
    .map((item) => item.content.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// ---- Patch helpers ----

export function readWorkflowPatch(result: unknown): { workflow_id: string; nodes: Workflow['nodes']; edges: Workflow['edges']; updatedAt?: number } | null {
  const record = asRecord(result);
  const patch = asRecord(record.workflow_patch);
  if (typeof patch.workflow_id !== 'string' || !Array.isArray(patch.nodes) || !Array.isArray(patch.edges)) return null;
  return {
    workflow_id: patch.workflow_id,
    nodes: patch.nodes as Workflow['nodes'],
    edges: patch.edges as Workflow['edges'],
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : undefined,
  };
}

export function stripWorkflowPatchFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const rest = { ...(value as Record<string, unknown>) };
  delete rest.workflow;
  delete rest.workflow_patch;
  return rest;
}

export function isSuccessfulToolResult(result: unknown): boolean {
  const record = asRecord(result);
  return record.success !== false;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function sanitizeWorkflowAgentToolCall<T extends WorkflowToolCall>(toolCall: T): T {
  return {
    ...toolCall,
    result: stripWorkflowPatchFields(toolCall.result),
  };
}

function sanitizeWorkflowAgentTimelineItem(item: WorkflowTimelineItem): WorkflowTimelineItem {
  if (item.type !== 'tool') return item;
  return sanitizeWorkflowAgentToolCall(item) as WorkflowTimelineItem;
}
