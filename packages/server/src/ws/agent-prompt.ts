import type { Message } from '@agent-spaces/shared';
import type { Channel } from '@agent-spaces/shared';
import { stripHtml } from './html-utils.js';
import * as issueService from '../services/issue.js';
import { getChannel } from '../services/channel.js';
import { createIssueFunctionTools } from '../services/builtin-tools/index.js';
import { prependPersistentAgentContext } from '../services/persistent-agent-context.js';

export interface BuiltInToolContext {
  name: string;
  description: string;
  channelId?: string;
  issueId?: string;
  issueTitle?: string;
}

export function buildAgentPrompt(
  workspaceId: string,
  systemPrompt: string | undefined,
  userPrompt: string,
  history: Message[] = [],
  runtimeConfig?: {
    runtimeKind?: string;
    mcpServers: string[];
    skills: string[];
    boundDirs?: string[];
    workingDir?: string;
    excludeNativeClaudeMd?: boolean;
    builtInTools?: BuiltInToolContext[];
  },
): string {
  const parts: string[] = [];
  const trimmedSystemPrompt = systemPrompt?.trim();
  if (trimmedSystemPrompt) parts.push(trimmedSystemPrompt);

  if (runtimeConfig) {
    const configLines = [
      'Agent runtime configuration:',
      `- Current workspace id: ${workspaceId}`,
      `- MCP servers configured for this agent: ${runtimeConfig.mcpServers.length ? runtimeConfig.mcpServers.join(', ') : 'none'}`,
      `- Skills configured for this agent: ${runtimeConfig.skills.length ? runtimeConfig.skills.join(', ') : 'none'}`,
      formatRuntimeToolsLine(runtimeConfig.runtimeKind),
      `- Tools: ${runtimeConfig.builtInTools?.length ? runtimeConfig.builtInTools.map((tool) => tool.name).join(', ') : 'none'}`,
    ];
    if (runtimeConfig.boundDirs?.length) {
      configLines.push(`- Code directories (boundDirs): ${runtimeConfig.boundDirs.join(', ')}`);
    }
    configLines.push('- For Bash commands that create or modify files under the current working directory, use relative paths such as `mkdir -p css js` instead of absolute paths.');
    if (runtimeConfig.builtInTools?.length) {
      configLines.push(...formatBuiltInToolContext(workspaceId, runtimeConfig.builtInTools));
    }
    if (isIssueContextLookup(userPrompt)) {
      configLines.push(
        'Current issue lookup rule:',
        '- The user is asking for the current channel issue.',
        '- If Agent Spaces channel tools include ViewCurrentChannelIssue, call that function tool first and answer from the tool result.',
        '- Do not use Bash, Glob, Grep, or project files to infer the current channel issue.',
        '- If ViewCurrentChannelIssue is not configured but CreateCurrentChannelIssue is configured, say this channel is not bound to an issue yet.',
        '- If no Agent Spaces channel issue tool is configured, say the issue tool is unavailable.',
      );
    }
    configLines.push(
      'When asked what MCP servers, skills, runtime tools, or Agent Spaces channel tools you have, answer from this configuration only.',
      'Important distinction: MCP servers configured for this agent are only the names in "MCP servers configured for this agent". Agent Spaces channel tools are built-in runtime tools and must not be listed as agent-configured MCP servers.',
      'Do not infer availability from provider-side function names, hidden runtime internals, previous sessions, or filesystem settings.',
    );
    parts.push(configLines.join('\n'));
  }

  if (history.length > 0) {
    const historyLines = formatConversationHistory(history);
    if (historyLines.length > 0) parts.push(['Conversation history:', ...historyLines].join('\n'));
  }

  parts.push(`User message:\n${userPrompt}`);
  return prependPersistentAgentContext(parts.join('\n\n'), {
    workspaceId,
    workingDir: runtimeConfig?.workingDir ?? runtimeConfig?.boundDirs?.[0] ?? process.cwd(),
    boundDirs: runtimeConfig?.boundDirs,
    excludeNativeClaudeMd: runtimeConfig?.excludeNativeClaudeMd,
  });
}

function formatConversationHistory(history: Message[]): string[] {
  const historyLines: string[] = [];
  let remainingBudget = 24_000;

  for (const msg of history) {
    const role = msg.senderId === 'user' ? 'User' : (msg.senderRole || 'Agent');
    const text = msg.senderId === 'user' ? stripHtml(msg.content) : getAgentFinalMessage(msg);
    appendHistoryLine(historyLines, `[${role}]`, text, remainingBudget);
    remainingBudget -= text.length;
    if (remainingBudget <= 0) break;

    for (const reply of msg.replies ?? []) {
      const replyRole = reply.senderId === 'user' ? 'User' : (reply.senderRole || 'Agent');
      const replyText = reply.senderId === 'user' ? stripHtml(reply.content) : getReplyFinalMessage(reply);
      appendHistoryLine(historyLines, `[${replyRole} reply]`, replyText, remainingBudget);
      remainingBudget -= replyText.length;
      if (remainingBudget <= 0) break;
    }
  }
  return historyLines;
}

/**
 * 将简单的 {role, content} 对话历史格式化为 "Conversation history:" 文本块。
 * 与 formatConversationHistory 共用 [User]/[Agent] 前缀和预算截断逻辑，
 * 供 mini-app agent 等无 Message 结构的场景复用。返回空字符串表示无历史。
 */
export function formatSimpleConversationHistory(history: Array<{ role: 'user' | 'agent'; content: string }>): string {
  if (!history.length) return '';
  const historyLines: string[] = [];
  let remainingBudget = 24_000;
  for (const msg of history) {
    const role = msg.role === 'user' ? 'User' : 'Agent';
    const text = msg.role === 'user' ? stripHtml(msg.content) : stripToolLikeHistoryLines(stripHtml(msg.content));
    appendHistoryLine(historyLines, `[${role}]`, text, remainingBudget);
    remainingBudget -= text.length;
    if (remainingBudget <= 0) break;
  }
  if (!historyLines.length) return '';
  return ['Conversation history:', ...historyLines].join('\n');
}

function getAgentFinalMessage(message: Message): string {
  const finalTextParts = message.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean);

  if (finalTextParts?.length) return finalTextParts.join('\n\n');

  if (message.parts?.length) return '';
  if (message.status && message.status !== 'completed') return '';

  return stripToolLikeHistoryLines(stripHtml(message.content));
}

function getReplyFinalMessage(reply: NonNullable<Message['replies']>[number]): string {
  const finalTextParts = reply.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean);

  if (finalTextParts?.length) return finalTextParts.join('\n\n');
  if (reply.parts?.length) return '';
  if (reply.status && reply.status !== 'completed') return '';
  return stripToolLikeHistoryLines(stripHtml(reply.content));
}

function stripToolLikeHistoryLines(content: string): string {
  const kept = content.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !/^Tool:\s*\w+/i.test(trimmed)
      && !/^(Read|Write|Edit|MultiEdit|Bash|Grep|Glob|TodoWrite|Task)\b/i.test(trimmed)
      && !/^Claude Code initialized\b/i.test(trimmed)
      && !/^(Input|Output|Result|Error):\s*\{/i.test(trimmed);
  });

  return kept.join('\n').trim();
}

function appendHistoryLine(lines: string[], label: string, rawText: string, remainingBudget: number): void {
  const text = compactHistoryText(rawText);
  if (!text || remainingBudget <= 0) return;
  const clipped = clipText(text, Math.min(remainingBudget, 4_000));
  if (clipped) lines.push(`${label}: ${clipped}`);
}

function compactHistoryText(text: string): string {
  return stripPromptContextLeak(stripToolLikeHistoryLines(text))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripPromptContextLeak(text: string): string {
  return text
    .replace(/Persistent agent instructions:\n[\s\S]*?(?=\n\n(?:Agent runtime configuration:|Conversation history:|User message:)|$)/g, '')
    .replace(/Workspace prompt:\n[\s\S]*?(?=\n\n(?:Agent runtime configuration:|Conversation history:|User message:)|$)/g, '')
    .trim();
}

function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n[history truncated]`;
}

export function buildBuiltInTools(
  functionTools: ReturnType<typeof createIssueFunctionTools>,
  channel: ReturnType<typeof getChannel>,
  issue: ReturnType<typeof issueService.getById>,
): BuiltInToolContext[] {
  if (!functionTools.length || !channel) return [];

  const issueTitle = issue?.title ?? channel.name;
  return functionTools.map((functionTool) => ({
    name: functionTool.name,
    description: functionTool.description,
    channelId: channel.id,
    issueId: channel.issueId,
    issueTitle,
  }));
}

function isIssueContextLookup(userPrompt: string): boolean {
  const text = stripHtml(userPrompt).toLowerCase();
  return /当前频道.*议题|议题内容|current channel.*issue|issue.*current channel/.test(text);
}

function formatBuiltInToolContext(workspaceId: string, tools: BuiltInToolContext[]): string[] {
  const firstTool = tools[0];
  const firstIssueTool = tools.find((tool) => tool.issueId);
  const lines = [
    'Built-in Agent Spaces tool rules:',
    '- These are real function-call tools exposed by the Agent Spaces runtime.',
    '- They are not agent-configured MCP servers and must be reported only as Agent Spaces channel tools.',
    '- Use the exact Agent Spaces tool names listed below when operating on Agent Spaces data.',
    '- Tool calls that require workspaceId must use the current workspace id.',
  ];
  lines.push(`- Current workspace id: ${workspaceId}`);
  if (firstTool?.channelId) lines.push(`- Current channel id: ${firstTool.channelId}`);

  if (tools.some((tool) => isIssueToolName(tool.name))) {
    lines.push('- Issue tool calls must use the current channel id.');
    if (firstIssueTool?.issueId) {
      lines.push(`- Current channel issue id: ${firstIssueTool.issueId}`);
      lines.push(`- Current channel issue title: ${firstIssueTool.issueTitle || 'Untitled issue'}`);
    } else {
      lines.push('- Current channel is not bound to an issue yet. Use CreateCurrentChannelIssue before viewing or commenting.');
    }
  }

  if (tools.some((tool) => isDatabaseToolName(tool.name))) {
    const enabledDatabaseToolNames = new Set(
      tools.filter((tool) => isDatabaseToolName(tool.name)).map((tool) => tool.name),
    );
    lines.push(
      'Knowledge base database tool rules:',
      '- Knowledge base/database documents are Agent Spaces database nodes, not workspace filesystem files.',
      '- Call only the Agent Spaces database tools listed below. Do not claim or use database tools that are not listed in this runtime configuration.',
      '- Do not use native filesystem write/edit tools for knowledge base/database documents; those tools write workspace files, not Agent Spaces database nodes.',
    );
    if (enabledDatabaseToolNames.has('ListDatabases')) {
      lines.push('- To list available knowledge base databases and valid database IDs, call mcp__agent-spaces__ListDatabases.');
      lines.push('- If the user does not specify a database, omit databaseId and the first database will be used automatically.');
      lines.push('- Never use the workspace id as databaseId.');
    }
    if (enabledDatabaseToolNames.has('ListDatabaseNodes')) {
      lines.push('- To list database files, call mcp__agent-spaces__ListDatabaseNodes with path and optional filter.');
    }
    if (enabledDatabaseToolNames.has('SearchDatabaseNodes')) {
      lines.push('- To search database files, call mcp__agent-spaces__SearchDatabaseNodes with path and optional filter.');
    }
    if (enabledDatabaseToolNames.has('QueryDatabaseVectors')) {
      lines.push('- To run semantic vector search, call mcp__agent-spaces__QueryDatabaseVectors with query and optional databaseId.');
    }
    if (enabledDatabaseToolNames.has('ReadDatabaseNode')) {
      lines.push('- To read database content, call mcp__agent-spaces__ReadDatabaseNode with an existing node id.');
    }
    if (enabledDatabaseToolNames.has('ListDatabaseNodeVersions')) {
      lines.push('- To inspect database document edit history, call mcp__agent-spaces__ListDatabaseNodeVersions with an existing node id.');
    }
    if (enabledDatabaseToolNames.has('CreateDatabaseNode')) {
      lines.push('- To create a new database document, call mcp__agent-spaces__CreateDatabaseNode with title, optional content, and optional parentId or path.');
      lines.push('- If the database is empty or no existing node matches the requested document, call mcp__agent-spaces__CreateDatabaseNode.');
    }
    if (enabledDatabaseToolNames.has('WriteDatabaseNode')) {
      lines.push('- To write database content, call mcp__agent-spaces__WriteDatabaseNode with an existing node id, mode, replace when needed, and content.');
    }
    if (enabledDatabaseToolNames.has('ListDatabaseNodes') || enabledDatabaseToolNames.has('SearchDatabaseNodes')) {
      lines.push('- Do not invent database node ids. If the target id is unknown, call an enabled listing or search database tool first.');
    }
  }

  for (const tool of tools) {
    lines.push(`- ${formatCallableToolName(tool.name)}: ${tool.description}`);
  }
  return lines;
}

function formatCallableToolName(name: string): string {
  return `mcp__agent-spaces__${name}`;
}

function formatRuntimeToolsLine(runtimeKind?: string): string {
  const runtimeName = formatRuntimeName(runtimeKind);
  const tools = runtimeKind === 'claude-code'
    ? 'Read, Write, Edit, MultiEdit, Bash, Grep, Glob, Task, TodoWrite, WebFetch, WebSearch'
    : runtimeKind === 'codex'
      ? 'Bash, file edits, WebSearch, todo list, MCP tools'
      : runtimeKind === 'grok'
        ? 'Grok CLI built-in tools'
        : runtimeKind === 'gemini-cli'
          ? 'Gemini CLI built-in tools'
          : runtimeKind === 'langchain'
            ? 'Agent Spaces function tools and configured MCP tools'
            : runtimeKind === 'hermes'
              ? 'Hermes CLI tools and configured skills'
              : runtimeKind === 'pi'
                ? 'Pi built-in tools, discovered extensions, MCP tools, skills, and Agent Spaces function tools'
                : 'runtime-specific tools exposed by the selected adapter';

  return `- Runtime tools available through ${runtimeName}: ${tools}`;
}

function formatRuntimeName(runtimeKind?: string): string {
  switch (runtimeKind) {
    case 'claude-code':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'grok':
      return 'Grok';
    case 'gemini-cli':
      return 'Gemini CLI';
    case 'langchain':
      return 'LangChain';
    case 'hermes':
      return 'Hermes';
    case 'pi':
      return 'Pi';
    case 'open-agent-sdk':
      return 'OpenAgent SDK';
    default:
      return 'the selected runtime';
  }
}

function isIssueToolName(name: string): boolean {
  return name === 'CreateCurrentChannelIssue'
    || name === 'ViewCurrentChannelIssue'
    || name === 'AddCurrentChannelComment';
}

function isDatabaseToolName(name: string): boolean {
  return name === 'ListDatabases'
    || name === 'ListDatabaseNodes'
    || name === 'SearchDatabaseNodes'
    || name === 'QueryDatabaseVectors'
    || name === 'ReadDatabaseNode'
    || name === 'ListDatabaseNodeVersions'
    || name === 'CreateDatabaseNode'
    || name === 'WriteDatabaseNode'
    || name === 'DeleteDatabaseNode'
    || name === 'MoveDatabaseNode'
    || name === 'UpdateDatabaseNodeMeta';
}
