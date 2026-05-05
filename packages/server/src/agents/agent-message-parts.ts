import type { AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import type { MessageChain, MessagePart, MessageTokenUsage } from '@agent-spaces/shared';
import { saveToolDetails, type ToolDetail } from '../services/tool-detail.js';

export interface AgentMessagePartsTracker {
  readonly output: string[];
  readonly toolDetails: Map<string, ToolDetail>;
  handleEvent(event: AgentRuntimeEvent): void;
  buildParts(input: {
    sessionId: string;
    workspaceRoot?: string;
    model?: string;
    usage?: MessageTokenUsage;
    success: boolean;
    error?: string;
  }): MessagePart[];
}

export function createAgentMessagePartsTracker(input: {
  workspaceId: string;
  channelId: string;
  messageId: string;
  workspaceRoot?: string;
  onOutput?: (line: string) => void;
}): AgentMessagePartsTracker {
  const output: string[] = [];
  const toolDetails = new Map<string, ToolDetail>();
  const toolUseDetailIds = new Map<string, string>();

  return {
    output,
    toolDetails,
    handleEvent(event) {
      if (event.type === 'tool_use') {
        const detailId = buildToolDetailId(event.id, event.line);
        toolUseDetailIds.set(event.id, detailId);
        toolDetails.set(detailId, {
          id: detailId,
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          messageId: input.messageId,
          title: summarizeToolLine(event.line, input.workspaceRoot).title,
          raw: event.line,
          input: event.input,
          createdAt: new Date().toISOString(),
        });
        saveToolDetails(input.workspaceId, input.channelId, Array.from(toolDetails.values()));
        output.push(event.line);
        input.onOutput?.(event.line);
        return;
      }

      if (event.type === 'tool_result') {
        const detail = findToolDetailForResult(event.toolUseId, event.result, toolUseDetailIds, toolDetails);
        if (detail) {
          detail.output = event.result;
          detail.updatedAt = new Date().toISOString();
          saveToolDetails(input.workspaceId, input.channelId, [detail]);
        }
        return;
      }

      output.push(event.line);
      input.onOutput?.(event.line);
    },
    buildParts({ sessionId, workspaceRoot, model, usage, success, error }) {
      return buildAgentMessageParts({
        sessionId,
        workspaceRoot,
        model,
        usage,
        output,
        toolDetails,
        success,
        error,
      });
    },
  };
}

function buildAgentMessageParts(input: {
  sessionId: string;
  workspaceRoot?: string;
  model?: string;
  usage?: MessageTokenUsage;
  output: string[];
  toolDetails?: Map<string, ToolDetail>;
  success: boolean;
  error?: string;
}): MessagePart[] {
  const lines = normalizeOutputLines(input.output);
  const finalTextRange = findFinalTextRange(lines);
  const finalText = finalTextRange
    ? collapseRepeatedTextBlock(lines.slice(finalTextRange.start, finalTextRange.end + 1)).join('\n').trim()
    : '';
  const usage = input.usage ?? extractUsage(lines);
  const parts: MessagePart[] = [];
  const chainItems = buildChainItems(lines, finalTextRange, finalText, input.workspaceRoot, input.toolDetails);

  if (chainItems.length > 0) {
    parts.push({
      id: `chain-${input.sessionId}`,
      type: 'chain',
      chains: chainItems,
    });
  }

  for (const subagent of extractSubagentBlocks(lines, input.sessionId, input.toolDetails)) {
    parts.push(subagent);
  }

  if (hasTokenUsage(usage)) {
    parts.push({
      id: `context-${input.sessionId}`,
      type: 'context',
      usedTokens: getTotalTokens(usage),
      maxTokens: 128_000,
      modelId: input.model,
      usage,
    });
  }

  if (input.error) {
    parts.push({
      id: `terminal-error-${input.sessionId}`,
      type: 'terminal',
      output: input.error,
      status: 'error',
    });
  }

  if (finalText && finalText !== input.error) {
    parts.push({
      id: `text-${input.sessionId}`,
      type: 'text',
      text: finalText,
    });
  }

  return parts;
}

function hasTokenUsage(usage: MessageTokenUsage): boolean {
  return Boolean(usage.totalTokens || usage.inputTokens || usage.outputTokens || usage.cachedInputTokens || usage.reasoningTokens);
}

function getTotalTokens(usage: MessageTokenUsage): number {
  return usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.cachedInputTokens ?? 0) + (usage.reasoningTokens ?? 0);
}

function normalizeOutputLines(output: string[]): string[] {
  const lines = output
    .flatMap((line) => line.split(/\r?\n/))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  const seenInitLines = new Set<string>();
  return lines.filter((line) => {
    if (!/^Claude Code initialized\b/i.test(line)) return true;
    if (seenInitLines.has(line)) return false;
    seenInitLines.add(line);
    return true;
  });
}

function collapseRepeatedTextBlock(lines: string[]): string[] {
  let next = [...lines];

  while (next.length > 1 && next.length % 2 === 0) {
    const middle = next.length / 2;
    const first = next.slice(0, middle);
    const second = next.slice(middle);
    if (!sameTextBlock(first, second)) break;
    next = first;
  }

  return next;
}

function sameTextBlock(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return normalizeMessageText(left.join('\n')) === normalizeMessageText(right.join('\n'));
}

function findFinalTextRange(lines: string[]): { start: number; end: number } | null {
  let end = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isFinalAnswerLine(lines[index])) {
      end = index;
      break;
    }
  }
  if (end < 0) return null;

  let start = end;
  for (let index = end - 1; index >= 0; index -= 1) {
    if (!isFinalAnswerLine(lines[index])) break;
    start = index;
  }
  return { start, end };
}

function buildChainItems(
  lines: string[],
  finalTextRange: { start: number; end: number } | null,
  finalText: string,
  workspaceRoot?: string,
  toolDetails?: Map<string, ToolDetail>,
): MessageChain[] {
  let toolIndex = 0;
  let messageIndex = 0;
  const items: MessageChain[] = [];
  const toolDetailMatchCounts = new Map<string, number>();
  let messageBuffer: string[] = [];

  const flushMessageBuffer = () => {
    if (messageBuffer.length === 0) return;
    const text = messageBuffer.join('\n').trim();
    if (text) {
      items.push({
        id: `message-${messageIndex}`,
        title: summarizeMessageTitle(text),
        text,
        kind: 'message',
        status: 'completed',
      });
      messageIndex += 1;
    }
    messageBuffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (finalTextRange && index >= finalTextRange.start && index <= finalTextRange.end) continue;
    const line = lines[index];
    if (finalText && isSameMessageText(line, finalText)) continue;
    if (isSubagentToolLine(line)) continue;
    if (isToolLikeLine(line)) {
      flushMessageBuffer();
      items.push(buildToolTodo(line, toolIndex, workspaceRoot, toolDetails, toolDetailMatchCounts));
      toolIndex += 1;
      continue;
    }
    if (isFinalAnswerLine(line)) {
      messageBuffer.push(line);
    }
  }
  flushMessageBuffer();

  return items.slice(0, 40);
}

function buildToolTodo(
  line: string,
  index: number,
  workspaceRoot?: string,
  toolDetails?: Map<string, ToolDetail>,
  toolDetailMatchCounts?: Map<string, number>,
): MessageChain {
  const summary = summarizeToolLine(line, workspaceRoot);
  const detailId = findToolDetailId(line, toolDetails, toolDetailMatchCounts);

  return {
    id: `tool-${index}`,
    title: summary.title,
    description: summary.description,
    status: 'completed',
    toolName: summary.toolName,
    filePath: summary.filePath,
    command: summary.command,
    detailId,
  };
}

function summarizeToolLine(line: string, workspaceRoot?: string): {
  title: string;
  description?: string;
  toolName?: string;
  filePath?: string;
  command?: string;
} {
  const trimmed = line.trim();
  const toolName = extractToolName(trimmed);
  const inputDescription = extractQuotedField(trimmed, 'description');
  const filePath = toWorkspaceRelativePath(
    extractQuotedField(trimmed, 'file_path') ?? extractQuotedField(trimmed, 'path'),
    workspaceRoot,
  );
  const command = extractQuotedField(trimmed, 'command') ?? extractCommand(trimmed, toolName);
  const baseName = filePath?.split(/[\\/]/).filter(Boolean).at(-1);

  if (toolName) {
    if (filePath) {
      return {
        title: `${humanizeToolName(toolName)} ${baseName ?? filePath}`,
        description: inputDescription ?? filePath,
        toolName,
        filePath,
      };
    }
    if (command) {
      return {
        title: `${humanizeToolName(toolName)} command`,
        description: inputDescription,
        toolName,
        command,
      };
    }
    const searchSummary = extractSearchParams(trimmed, toolName, workspaceRoot);
    if (searchSummary) return { ...searchSummary, toolName };

    const todoCount = extractTodoCount(trimmed);
    if (todoCount !== undefined) {
      return {
        title: `Update ${todoCount} ${todoCount === 1 ? 'todo' : 'todos'}`,
        toolName,
      };
    }
    return {
      title: humanizeToolName(toolName),
      toolName,
    };
  }

  return { title: trimmed };
}

function extractSearchParams(
  line: string,
  toolName: string,
  workspaceRoot?: string,
): { title: string; description?: string } | null {
  if (!/^(Glob|Grep|Search|SemanticSearch|WebSearch|WebFetch|Fetch)$/i.test(toolName)) return null;

  const pattern = extractQuotedField(line, 'pattern') ?? extractQuotedField(line, 'query');
  const glob = extractQuotedField(line, 'glob');
  const searchPath = toWorkspaceRelativePath(extractQuotedField(line, 'path'), workspaceRoot);
  const url = extractQuotedField(line, 'url');
  const label = humanizeToolName(toolName);

  if (/^(WebSearch|WebFetch|Fetch)$/i.test(toolName)) {
    if (url) return { title: `${label} ${truncate(url, 60)}` };
    if (pattern) return { title: `${label} ${truncate(pattern, 60)}` };
    return { title: label };
  }

  if (/^Glob$/i.test(toolName)) {
    const parts: string[] = [];
    if (pattern) parts.push(truncate(pattern, 50));
    else if (glob) parts.push(truncate(glob, 50));
    const title = parts.length ? `${label} ${parts.join(' ')}` : label;
    const descParts: string[] = [];
    if (pattern && glob) descParts.push(`glob: ${glob}`);
    if (searchPath) descParts.push(`in ${searchPath}`);
    return { title, description: descParts.length ? descParts.join(', ') : undefined };
  }

  const parts: string[] = [];
  if (pattern) parts.push(truncate(pattern, 40));
  const title = parts.length ? `${label} ${parts.join(' ')}` : label;
  const descParts: string[] = [];
  if (glob) descParts.push(`glob: ${glob}`);
  if (searchPath) descParts.push(`in ${searchPath}`);
  return { title, description: descParts.length ? descParts.join(', ') : undefined };
}

function findToolDetailForResult(
  toolUseId: string | undefined,
  result: unknown,
  toolUseDetailIds: Map<string, string>,
  toolDetails: Map<string, ToolDetail>,
): ToolDetail | undefined {
  const detailId = toolUseId ? toolUseDetailIds.get(toolUseId) : undefined;
  if (detailId) return toolDetails.get(detailId);
  if (isSubagentToolResult(result)) {
    const detail = Array.from(toolDetails.values()).reverse().find((candidate) => {
      return candidate.output === undefined && /^Tool:\s*Task\b/i.test(candidate.raw);
    });
    if (detail) return detail;
  }
  return Array.from(toolDetails.values()).reverse().find((detail) => detail.output === undefined);
}

function isSubagentToolResult(result: unknown): boolean {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const record = result as Record<string, unknown>;
  return (
    typeof record.agentId === 'string'
    || typeof record.agentType === 'string'
    || (record.status === 'completed' && Array.isArray(record.content))
  );
}

function extractSubagentBlocks(
  lines: string[],
  sessionId: string,
  toolDetails?: Map<string, ToolDetail>,
): MessagePart[] {
  const matchCounts = new Map<string, number>();
  return lines
    .map((line, index): MessagePart | null => {
      const match = line.match(/^Tool:\s*Task\b\s*(.*)$/i);
      if (!match) return null;
      const name = line.match(/\bdescription=(["'])(.*?)\1/i)?.[2] || `Subagent ${index + 1}`;
      const prompt = line.match(/\bprompt=(["'])(.*?)\1/i)?.[2];
      const detailId = findToolDetailId(line, toolDetails, matchCounts);
      const detail = detailId ? toolDetails?.get(detailId) : undefined;
      const output = stringifySubagentOutput(detail?.output);
      return {
        id: `subagent-${sessionId}-${index}`,
        type: 'subagent',
        name,
        instructions: prompt,
        output,
      };
    })
    .filter((part): part is MessagePart => Boolean(part));
}

function stringifySubagentOutput(output: unknown): string | undefined {
  if (output === undefined || output === null) return undefined;
  if (typeof output === 'string') return output.trim() || undefined;
  if (Array.isArray(output)) {
    const text = output.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      return typeof record.text === 'string' ? [record.text] : [];
    }).join('\n').trim();
    return text || undefined;
  }
  if (typeof output === 'object') {
    const record = output as Record<string, unknown>;
    if (typeof record.result === 'string' && record.result.trim()) return record.result.trim();
    if (typeof record.summary === 'string' && record.summary.trim()) return record.summary.trim();
    if (Array.isArray(record.content)) return stringifySubagentOutput(record.content);
  }
  return undefined;
}

function findToolDetailId(
  line: string,
  toolDetails?: Map<string, ToolDetail>,
  matchCounts?: Map<string, number>,
): string | undefined {
  if (!toolDetails) return undefined;
  const targetMatchIndex = matchCounts?.get(line) ?? 0;
  let matchIndex = 0;
  for (const [id, detail] of toolDetails) {
    if (detail.raw !== line) continue;
    if (matchIndex === targetMatchIndex) {
      matchCounts?.set(line, targetMatchIndex + 1);
      return id;
    }
    matchIndex += 1;
  }
  return undefined;
}

function buildToolDetailId(toolUseId: string, line: string): string {
  const safeToolUseId = toolUseId.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (safeToolUseId) return `tool-${safeToolUseId}`;
  return `tool-${hashString(line)}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function isSameMessageText(left: string, right: string): boolean {
  return normalizeMessageText(left) === normalizeMessageText(right);
}

function normalizeMessageText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function summarizeMessageTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'AI message';
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function isToolLikeLine(line: string): boolean {
  return /^(Using|Tool:|Read|Write|Edit|MultiEdit|Bash|Search|Grep|Glob|Todo|Task|Web|Fetch|Claude Code initialized|Codex initialized|.+ running \(\d+s\))/i.test(line.trim());
}

function isFinalAnswerLine(line: string): boolean {
  return !isToolLikeLine(line) && !/^(\[.*\]|Agent runtime configuration:|Conversation history:)/.test(line.trim());
}

function isSubagentToolLine(line: string): boolean {
  return /^Tool:\s*Task\b/i.test(line.trim());
}

function extractToolName(line: string): string | undefined {
  return line.match(/^Tool:\s*([A-Za-z][\w-]*)\b/)?.[1]
    ?? line.match(/^([A-Za-z][\w-]*)\s+running\s+\(\d+s\)/)?.[1]
    ?? line.match(/^([A-Za-z][\w-]*):?\s+/)?.[1];
}

function humanizeToolName(toolName: string): string {
  const labels: Record<string, string> = {
    Read: 'Read',
    Write: 'Write',
    Edit: 'Edit',
    MultiEdit: 'Edit',
    Bash: 'Run',
    TodoWrite: 'Update todos',
    Grep: 'Search',
    Glob: 'Find files',
    Search: 'Search',
    SemanticSearch: 'Semantic search',
    WebSearch: 'Web search',
    WebFetch: 'Fetch',
    Fetch: 'Fetch',
    Task: 'Run subagent',
  };
  return labels[toolName] ?? toolName.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function extractQuotedField(line: string, key: string): string | undefined {
  const quoted = line.match(new RegExp(`\\b${key}=(["'])(.*?)\\1`))?.[2];
  if (quoted) return quoted;

  const json = line.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1];
  return json;
}

function extractCommand(line: string, toolName?: string): string | undefined {
  if (!toolName || !/^(Bash|Shell|Command)$/i.test(toolName)) return undefined;
  const command = line.replace(/^Tool:\s*/i, '').replace(new RegExp(`^${toolName}:?\\s*`, 'i'), '').trim();
  return command || undefined;
}

function extractTodoCount(line: string): number | undefined {
  const matches = line.match(/"content"\s*:/g);
  return matches?.length;
}

function toWorkspaceRelativePath(path: string | undefined, workspaceRoot?: string): string | undefined {
  if (!path) return undefined;
  if (!workspaceRoot || !path.startsWith(workspaceRoot)) return path;
  return path.slice(workspaceRoot.length).replace(/^[/\\]/, '');
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

function extractUsage(lines: string[]) {
  const usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
  } = {};

  for (const line of lines) {
    const total = line.match(/\btotal(?: tokens)?:\s*([\d,]+)/i)?.[1];
    const input = line.match(/\binput(?: tokens)?:\s*([\d,]+)/i)?.[1];
    const output = line.match(/\boutput(?: tokens)?:\s*([\d,]+)/i)?.[1];
    const cached = line.match(/\bcached(?: input)?(?: tokens)?:\s*([\d,]+)/i)?.[1];
    const reasoning = line.match(/\breasoning(?: tokens)?:\s*([\d,]+)/i)?.[1];
    if (total) usage.totalTokens = parseTokenNumber(total);
    if (input) usage.inputTokens = parseTokenNumber(input);
    if (output) usage.outputTokens = parseTokenNumber(output);
    if (cached) usage.cachedInputTokens = parseTokenNumber(cached);
    if (reasoning) usage.reasoningTokens = parseTokenNumber(reasoning);
  }

  return usage;
}

function parseTokenNumber(value: string): number {
  return Number(value.replace(/,/g, ''));
}
