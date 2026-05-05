import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export function formatMessage(message: SDKMessage): string | null {
  switch (message.type) {
    case 'assistant':
      return formatAssistantMessage(message.message.content);
    case 'result':
      return message.subtype === 'success' ? message.result : message.errors.join('\n');
    case 'system':
      if (message.subtype === 'init') {
        return `Claude Code initialized with ${message.model}`;
      }
      if (message.subtype === 'task_started') {
        return message.description;
      }
      if (message.subtype === 'task_progress') {
        return message.summary || message.description;
      }
      if (message.subtype === 'task_notification') {
        return message.summary;
      }
      if (message.subtype === 'local_command_output') {
        return message.content;
      }
      return null;
    case 'tool_progress':
      return `${message.tool_name} running (${message.elapsed_time_seconds}s)`;
    case 'tool_use_summary':
      return message.summary;
    default:
      return null;
  }
}

function formatAssistantMessage(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;

  const parts = content.flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const typedBlock = block as { type?: string; text?: unknown };
    if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') {
      return [typedBlock.text];
    }
    return [];
  });

  return parts.length > 0 ? parts.join('\n') : null;
}

export function extractToolUseEvents(message: SDKMessage): Array<{ id: string; name: string; input?: unknown; line: string }> {
  if (message.type !== 'assistant' || !Array.isArray(message.message.content)) return [];

  return message.message.content.flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const typedBlock = block as { type?: string; id?: unknown; name?: unknown; input?: unknown };
    if (typedBlock.type !== 'tool_use' || typeof typedBlock.name !== 'string') return [];

    return [{
      id: typeof typedBlock.id === 'string' ? typedBlock.id : typedBlock.name,
      name: typedBlock.name,
      input: typedBlock.input,
      line: formatToolUse(typedBlock.name, typedBlock.input),
    }];
  });
}

export function extractToolResultEvent(message: SDKMessage): { toolUseId?: string; result: unknown } | null {
  if (message.type !== 'user') return null;
  const parentToolUseId = (message as { parent_tool_use_id?: unknown }).parent_tool_use_id;
  const toolUseId = typeof parentToolUseId === 'string' && parentToolUseId ? parentToolUseId : undefined;

  const directResult = (message as { tool_use_result?: unknown }).tool_use_result;
  if (directResult !== undefined) {
    return { toolUseId, result: directResult };
  }

  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (Array.isArray(content)) {
    const toolResultBlock = content.find((block) => {
      return Boolean(block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool_result');
    }) as { content?: unknown } | undefined;
    if (toolResultBlock) {
      return { toolUseId, result: toolResultBlock.content };
    }
  }

  return null;
}

export function logToolDebug(
  message: SDKMessage,
  d: (message: string) => void,
  options: { suppressAskUserQuestionResult?: boolean } = {},
): void {
  switch (message.type) {
    case 'assistant':
      logAssistantToolUses(message.message.content, d);
      return;
    case 'user': {
      const toolResult = (message as { tool_use_result?: unknown }).tool_use_result;
      if (toolResult !== undefined) {
        if (options.suppressAskUserQuestionResult) return;
        d(`tool result | parent=${message.parent_tool_use_id ?? '-'} result=${summarizeToolResult(toolResult)}`);
      }
      return;
    }
    case 'tool_progress':
      d(`tool progress | id=${message.tool_use_id} name=${message.tool_name} elapsed=${message.elapsed_time_seconds}s parent=${message.parent_tool_use_id ?? '-'}`);
      return;
    case 'tool_use_summary':
      d(`tool summary | ids=${message.preceding_tool_use_ids.join(',') || '-'} summary=${truncate(message.summary, 240)}`);
      return;
    case 'system':
      if (message.subtype === 'task_started') {
        d(`subagent started | ${truncate(message.description, 240)}`);
      } else if (message.subtype === 'task_progress') {
        d(`subagent progress | ${truncate(message.summary || message.description, 240)}`);
      } else if (message.subtype === 'task_notification') {
        d(`subagent notification | ${truncate(message.summary, 240)}`);
      } else if (message.subtype === 'local_command_output') {
        d(`local command output | ${truncate(message.content, 240)}`);
      }
      return;
    default:
      return;
  }
}

function logAssistantToolUses(content: unknown, d: (message: string) => void): void {
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const typedBlock = block as { type?: string; id?: unknown; name?: unknown; input?: unknown };
    if (typedBlock.type !== 'tool_use' || typeof typedBlock.name !== 'string') continue;
    const id = typeof typedBlock.id === 'string' ? typedBlock.id : '-';
    d(`tool use | id=${id} name=${typedBlock.name} input=${summarizeToolInput(typedBlock.input) || '-'}`);
  }
}

function formatToolUse(name: string, input: unknown): string {
  const summary = summarizeToolInput(input);
  return summary ? `Tool: ${name} ${summary}` : `Tool: ${name}`;
}

function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const record = input as Record<string, unknown>;
  const keys = ['file_path', 'path', 'command', 'pattern', 'query', 'description', 'prompt'];
  const details = keys.flatMap((key) => {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) return [];
    return `${key}=${JSON.stringify(truncate(value.trim(), 140))}`;
  });
  if (details.length > 0) return details.join(' ');
  return JSON.stringify(redactLargeInput(record));
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function redactLargeInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (typeof value === 'string') return [key, truncate(value, 140)];
    return [key, value];
  }));
}

function summarizeToolResult(result: unknown): string {
  if (typeof result === 'string') return JSON.stringify(truncate(result, 240));
  if (!result || typeof result !== 'object') return JSON.stringify(result);
  return JSON.stringify(redactLargeInput(result as Record<string, unknown>));
}

export function isAskUserQuestionAutoResult(result: unknown): boolean {
  if (typeof result === 'string') return /Answer questions\?/i.test(result);
  if (!result || typeof result !== 'object') return false;
  return /Answer questions\?/i.test(JSON.stringify(result));
}

export function countUsageTokens(usage: unknown): number {
  if (!usage || typeof usage === 'object') return 0;
  const values = Object.values(usage as Record<string, unknown>);
  return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
}
