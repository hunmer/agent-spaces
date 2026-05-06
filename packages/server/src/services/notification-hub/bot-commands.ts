import type { Workspace } from '@agent-spaces/shared';
import * as workspaceService from '../workspace.js';
import * as issueService from '../issue.js';
import * as taskService from '../task.js';
import * as agentService from '../agent.js';
import * as issueCommentService from '../issue-comment.js';
import { gitCommit, gitGenerateCommitMsg, gitPull, gitPush, gitStatus } from '../../adapters/git.js';
import type { BotCommandContext, BuildCommandResponseInput } from './types.js';
import { botCommandContexts } from './types.js';
import { truncateLine } from './format.js';
import { startIssueAutomation, getConfiguredBotAgent } from './bot-agent.js';
import { hasActiveIssueAutomation } from '../../agents/issue-agent-runner.js';

export function isBuiltInCommand(text: string): boolean {
  const command = text.trim().split(/\s+/, 1)[0];
  return command.startsWith('/');
}

export async function buildCommandResponse(input: BuildCommandResponseInput): Promise<string> {
  try {
    return await executeCommand(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Command failed: ${message}`;
  }
}

async function executeCommand(input: BuildCommandResponseInput): Promise<string> {
  const text = input.text.trim();
  const tokens = parseCommandTokens(text);
  const command = tokens[0] ?? '';
  const args = tokens.slice(1);
  const context = getBotCommandContext(input.conversationId, input.defaultWorkspaceId);
  const workspaceId = context.workspaceId ?? input.defaultWorkspaceId;

  if (command === '/workspace') {
    const workspace = workspaceService.getById(workspaceId);
    return workspace ? formatWorkspaceDetail(workspace, context.issueId) : 'Workspace not found.';
  }

  if (command === '/workspaces') {
    const workspaces = workspaceService.getAll();
    return workspaces.length
      ? workspaces.map((workspace) => formatWorkspaceSummary(workspace, workspace.id === workspaceId)).join('\n')
      : 'No workspaces.';
  }

  if (command === '/workspac') {
    const nextWorkspaceId = args[0];
    if (!nextWorkspaceId) return 'Usage: /workspac [id]';
    const workspace = workspaceService.getById(nextWorkspaceId);
    if (!workspace) return `Workspace not found: ${nextWorkspaceId}`;
    const nextContext: BotCommandContext = { workspaceId: workspace.id };
    botCommandContexts.set(input.conversationId, nextContext);
    return `Switched workspace:\n${formatWorkspaceDetail(workspace)}`;
  }

  if (command === '/agents') {
    return formatAgentList(workspaceId);
  }

  if (command === '/issues') {
    return formatIssueList(workspaceId);
  }

  if (command === '/issue') {
    if (args[0] === 'new') {
      const title = args[1]?.trim();
      const description = args.slice(2).join(' ').trim();
      if (!title) return 'Usage: /issue new [title] [desc]';
      const issue = issueService.create(workspaceId, { title, description });
      const issues = issueService.list(workspaceId);
      const issueIndex = issues.findIndex((i) => i.id === issue.id);
      botCommandContexts.set(input.conversationId, { ...context, workspaceId, issueId: issue.id });
      return `Created issue #${issueIndex}:\n${formatIssueDetail(workspaceId, issue.id)}`;
    }

    if (args[0] === 'start') {
      const issue = getCurrentIssue(workspaceId, context.issueId);
      if (!issue) return 'No current issue. Use /issue [id/index] first.';
      const updated = issueService.updateStatus(workspaceId, issue.id, 'planned');
      if (updated) startIssueAutomation(workspaceId, issue.id);
      return updated ? `Issue started:\n${formatIssueSummary(updated)}` : 'Issue not found.';
    }

    if (args[0] === 'close') {
      const issue = getCurrentIssue(workspaceId, context.issueId);
      if (!issue) return 'No current issue. Use /issue [id/index] first.';
      const updated = issueService.markError(workspaceId, issue.id, 'Closed from bot command.');
      return updated ? `Issue closed as failed:\n${formatIssueSummary(updated)}` : 'Issue not found.';
    }

    if (args[0] && args[1] === 'agent') {
      const issue = resolveIssue(workspaceId, args[0]);
      if (!issue) return `Issue not found: ${args[0]}`;
      const agentIds = args[2]?.split(',').map((s) => s.trim()).filter(Boolean);
      if (!agentIds?.length) return 'Usage: /issue [id/index] agent agent_id,agent_id,...';
      const presets = agentService.listPresets(workspaceId) ?? [];
      const presetIds = new Set(presets.map((p) => p.id));
      const invalid = agentIds.filter((id) => !presetIds.has(id));
      if (invalid.length) return `Agent not found: ${invalid.join(', ')}`;
      issue.assignedAgents = agentIds;
      issueService.save(workspaceId, issue);
      botCommandContexts.set(input.conversationId, { ...context, workspaceId, issueId: issue.id });
      return `Set agents for "${issue.title}": ${agentIds.join(', ')}`;
    }

    if (args[0]) {
      const issue = resolveIssue(workspaceId, args[0]);
      if (!issue) return `Issue not found: ${args[0]}`;
      botCommandContexts.set(input.conversationId, { ...context, workspaceId, issueId: issue.id });
      return `Entered issue:\n${formatIssueDetail(workspaceId, issue.id)}`;
    }

    const issue = getCurrentIssue(workspaceId, context.issueId);
    return issue ? formatIssueDetail(workspaceId, issue.id) : 'No current issue. Use /issue [id/index] first.';
  }

  if (command === '/task') {
    return formatCurrentTask(workspaceId, context.issueId);
  }

  if (command === '/comment') {
    const content = getRawCommandTail(text).trim();
    if (!content) return 'Usage: /comment [msg]';
    const issue = getCurrentIssue(workspaceId, context.issueId);
    if (!issue) return 'No current issue. Use /issue [id] first.';
    const comment = issueCommentService.createIssueComment(workspaceId, issue.id, {
      senderId: 'user',
      content,
      source: 'user',
    });
    if (comment && !hasActiveIssueAutomation(workspaceId)) startIssueAutomation(workspaceId, issue.id);
    return comment ? `Comment added to ${issue.title}.` : 'Issue not found.';
  }

  if (command === '/comments') {
    const issue = getCurrentIssue(workspaceId, context.issueId);
    if (!issue) return 'No current issue. Use /issue [id] first.';
    return formatComments(workspaceId, issue.id);
  }

  if (command === '/changes') {
    const status = await gitStatus(workspaceId);
    if (status.clean) return `No changes on ${status.branch}.`;
    return [
      `Changes on ${status.branch}:`,
      ...status.files.map((file) => `- ${file.path} [${file.status}]`),
    ].join('\n');
  }

  if (command === '/commit') {
    const rawMessage = getRawCommandTail(text).trim();
    if (!rawMessage) return 'Usage: /commit [desc/auto]';
    const status = await gitStatus(workspaceId);
    if (status.clean) return `No changes to commit on ${status.branch}.`;
    const message = rawMessage === 'auto' ? await gitGenerateCommitMsg(workspaceId) : rawMessage;
    const result = await gitCommit(workspaceId, message);
    return `Committed ${result.hash.slice(0, 7)}:\n${message}`;
  }

  if (command === '/push') {
    await gitPush(workspaceId);
    return 'Pushed to remote git.';
  }

  if (command === '/pull') {
    await gitPull(workspaceId);
    return 'Pulled from remote git.';
  }

  if (command === '/help') return buildCommandHelp();
  return buildCommandHelp();
}

function getBotCommandContext(conversationId: string, defaultWorkspaceId: string): BotCommandContext {
  const existing = botCommandContexts.get(conversationId) ?? {};
  const workspaceId = existing.workspaceId && workspaceService.getById(existing.workspaceId)
    ? existing.workspaceId
    : defaultWorkspaceId;
  const issueId = existing.issueId && issueService.getById(workspaceId, existing.issueId)
    ? existing.issueId
    : undefined;
  const normalized = { workspaceId, issueId };
  botCommandContexts.set(conversationId, normalized);
  return normalized;
}

function parseCommandTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of text.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function getRawCommandTail(text: string): string {
  const trimmed = text.trim();
  const firstSpace = trimmed.search(/\s/);
  return firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1);
}

function formatWorkspaceSummary(workspace: Workspace, active: boolean): string {
  const issueCount = issueService.list(workspace.id).length;
  const marker = active ? '*' : '-';
  return `${marker} ${workspace.name} (${workspace.id}) issues=${issueCount}`;
}

function formatWorkspaceDetail(workspace: Workspace, currentIssueId?: string): string {
  const issues = issueService.list(workspace.id);
  const agents = agentService.listPresets(workspace.id) ?? [];
  return [
    `${workspace.name} (${workspace.id})`,
    `Root: ${workspace.boundDirs[0] ?? '-'}`,
    `Issues: ${issues.length}`,
    `Agents: ${agents.length}`,
    currentIssueId ? `Current issue: ${currentIssueId}` : undefined,
  ].filter(Boolean).join('\n');
}

function resolveIssue(workspaceId: string, idOrIndex: string): NonNullable<ReturnType<typeof issueService.getById>> | null {
  const byId = issueService.getById(workspaceId, idOrIndex);
  if (byId) return byId;
  const index = Number(idOrIndex);
  if (Number.isInteger(index) && index >= 0) {
    const issues = issueService.list(workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return issues[index] ?? null;
  }
  return null;
}

function formatAgentList(workspaceId: string): string {
  const agents = agentService.listPresets(workspaceId) ?? [];
  if (!agents.length) return 'No agents.';
  return [
    'Agents:',
    ...agents.map((agent, i) => `#${i} ${agent.name} (${agent.id})${agent.role ? ` [${agent.role}]` : ''}`),
  ].join('\n');
}

function formatIssueList(workspaceId: string): string {
  const issues = issueService.list(workspaceId);
  if (!issues.length) return 'No issues.';
  return issues
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((issue, i) => `#${i} ${formatIssueSummary(issue)}`)
    .join('\n');
}

function formatIssueSummary(issue: NonNullable<ReturnType<typeof issueService.getById>>): string {
  return `${issue.title} [${issue.status}] ${issue.id}`;
}

function formatIssueDetail(workspaceId: string, issueId: string): string {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) return 'Issue not found.';
  const tasks = taskService.list(workspaceId, issue.id);
  const comments = issueCommentService.listIssueComments(workspaceId, issue.id);
  const members = issue.members.length ? issue.members.join(', ') : '-';
  const agents = issue.assignedAgents.length ? issue.assignedAgents.join(', ') : '-';
  return [
    `${issue.title} [${issue.status}]`,
    `ID: ${issue.id}`,
    issue.description ? `Desc: ${issue.description}` : undefined,
    `Members: ${members}`,
    `Agents: ${agents}`,
    `Tasks: ${tasks.length}`,
    ...tasks.map((task) => `- ${task.title} [${task.status}] ${task.id}`),
    `Comments: ${comments.length}`,
    ...comments.slice(-5).map((comment) => `- ${comment.senderId}: ${truncateLine(comment.content, 120)}`),
  ].filter(Boolean).join('\n');
}

function getCurrentIssue(workspaceId: string, issueId?: string): NonNullable<ReturnType<typeof issueService.getById>> | null {
  if (issueId) {
    const issue = issueService.getById(workspaceId, issueId);
    if (issue) return issue;
  }
  return issueService.list(workspaceId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

function formatCurrentTask(workspaceId: string, issueId?: string): string {
  const botAgent = getConfiguredBotAgent(workspaceId);
  const sessions = botAgent
    ? agentService.list(workspaceId).filter((session) => session.agentConfigId === botAgent.id)
    : [];
  const currentTaskIds = new Set(sessions.map((session) => session.currentTaskId).filter((id): id is string => Boolean(id)));
  const currentTasks = [...currentTaskIds]
    .map((taskId) => taskService.getById(workspaceId, taskId))
    .filter((task): task is NonNullable<ReturnType<typeof taskService.getById>> => Boolean(task));

  if (currentTasks.length) {
    return [
      botAgent ? `Current tasks for ${botAgent.name}:` : 'Current tasks:',
      ...currentTasks.map((task) => `- ${task.title} [${task.status}] ${task.id}`),
    ].join('\n');
  }

  const issue = getCurrentIssue(workspaceId, issueId);
  if (!issue) return 'No current task.';
  const tasks = taskService.list(workspaceId, issue.id).filter((task) =>
    !botAgent || task.agentConfigId === botAgent.id || task.assignedAgentId === botAgent.id);
  if (!tasks.length) return botAgent ? `No task for ${botAgent.name}.` : 'No current task.';
  return [
    botAgent ? `Tasks for ${botAgent.name}:` : `Tasks for ${issue.title}:`,
    ...tasks.map((task) => `- ${task.title} [${task.status}] ${task.id}`),
  ].join('\n');
}

function formatComments(workspaceId: string, issueId: string): string {
  const comments = issueCommentService.listIssueComments(workspaceId, issueId);
  if (!comments.length) return 'No comments.';
  return comments.map((comment) =>
    `- ${comment.senderId} ${comment.createdAt}: ${truncateLine(comment.content, 180)}`,
  ).join('\n');
}

function buildCommandHelp(): string {
  return [
    'Supported commands:',
    '/workspace',
    '/workspaces',
    '/workspac [id]',
    '/agents',
    '/issues',
    '/issue',
    '/issue [id/index]',
    '/issue new [title] [desc]',
    '/issue [id/index] agent agent_id,agent_id,...',
    '/issue start',
    '/issue close',
    '/task',
    '/comment [msg]',
    '/comments',
    '/help',
    '/changes',
    '/commit [desc/auto]',
    '/push',
    '/pull',
  ].join('\n');
}

