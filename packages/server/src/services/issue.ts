import { v4 as uuid } from 'uuid';
import type { Issue, IssueStatus, CreateIssueInput } from '@agent-spaces/shared';
import { listIssues, getIssue, createIssue, updateIssue, deleteIssue } from '../storage/issue-store.js';
import * as channelService from '../services/channel.js';
import * as taskService from '../services/task.js';

function ensureChannel(workspaceId: string, issue: Issue): void {
  ensureRetryDefaults(workspaceId, issue);
  const channelMembers = ['user', ...(issue.members || [])];
  if (issue.channelId) {
    channelService.updateChannel(workspaceId, issue.channelId, { type: 'issue', issueId: issue.id, members: channelMembers });
    return;
  }

  const channel = channelService.createChannel(workspaceId, {
    name: issue.title,
    type: 'issue',
    issueId: issue.id,
    members: channelMembers,
  });
  issue.channelId = channel.id;
  updateIssue(issue);
}

function ensureRetryDefaults(workspaceId: string, issue: Issue): void {
  let changed = false;
  if (issue.retryCount === undefined) {
    issue.retryCount = 0;
    changed = true;
  }
  if (issue.maxRetries === undefined) {
    issue.maxRetries = 3;
    changed = true;
  }
  if (changed) updateIssue({ ...issue, workspaceId });
}

export function list(workspaceId: string, status?: IssueStatus): Issue[] {
  const all = listIssues(workspaceId);
  for (const issue of all) ensureChannel(workspaceId, issue);
  return status ? all.filter((i) => i.status === status) : all;
}

export function getById(workspaceId: string, issueId: string): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (issue) ensureChannel(workspaceId, issue);
  return issue;
}

export function create(workspaceId: string, input: CreateIssueInput): Issue {
  const now = new Date().toISOString();
  const issueId = uuid();
  const channelMembers = ['user', ...(input.members || [])];
  const channel = channelService.createChannel(workspaceId, {
    name: input.title,
    type: 'issue',
    issueId,
    members: channelMembers,
  });
  const issue: Issue = {
    id: issueId,
    workspaceId,
    channelId: channel.id,
    title: input.title,
    description: input.description,
    status: 'draft',
    tasks: [],
    assignedAgents: [],
    members: input.members || [],
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  };
  createIssue(issue);
  return issue;
}

export function createForChannel(
  workspaceId: string,
  channelId: string,
  input: CreateIssueInput,
): Issue | null {
  const channel = channelService.getChannel(workspaceId, channelId);
  if (!channel) return null;

  const now = new Date().toISOString();
  const issueId = uuid();
  const issue: Issue = {
    id: issueId,
    workspaceId,
    channelId,
    title: input.title,
    description: input.description,
    status: 'draft',
    tasks: [],
    assignedAgents: [],
    members: [],
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  };
  createIssue(issue);
  channelService.updateChannel(workspaceId, channelId, {
    name: input.title,
    type: 'issue',
    issueId,
  });
  return issue;
}

export function updateStatus(
  workspaceId: string,
  issueId: string,
  status: IssueStatus,
  extra?: Partial<Issue>,
): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return null;

  issue.status = status;
  issue.updatedAt = new Date().toISOString();
  if (extra) Object.assign(issue, extra);
  updateIssue(issue);
  return issue;
}

export function markError(
  workspaceId: string,
  issueId: string,
  error?: string,
): Issue | null {
  return updateStatus(workspaceId, issueId, 'error', {
    lastError: error,
  });
}

export function prepareRetry(
  workspaceId: string,
  issueId: string,
  options: { manual?: boolean } = {},
): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return null;

  if (options.manual) {
    issue.retryCount = 0;
    issue.retryPaused = false;
  } else {
    const retryCount = issue.retryCount ?? 0;
    const maxRetries = issue.maxRetries ?? 3;
    if (retryCount >= maxRetries) {
      issue.retryPaused = true;
      issue.updatedAt = new Date().toISOString();
      updateIssue(issue);
      return issue;
    }
    issue.retryCount = retryCount + 1;
  }

  issue.status = 'in_progress';
  issue.lastError = undefined;
  issue.updatedAt = new Date().toISOString();
  updateIssue(issue);
  return issue;
}

export function save(workspaceId: string, issue: Issue): Issue {
  if (issue.workspaceId !== workspaceId) throw new Error('issue workspace mismatch');
  issue.updatedAt = new Date().toISOString();
  updateIssue(issue);
  return issue;
}

export function addTask(workspaceId: string, issueId: string, taskId: string): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return null;

  if (!issue.tasks.includes(taskId)) issue.tasks.push(taskId);
  issue.updatedAt = new Date().toISOString();
  updateIssue(issue);
  return issue;
}

export function replaceTasks(workspaceId: string, issueId: string, taskIds: string[]): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return null;

  issue.tasks = [...new Set(taskIds.map((id) => id.trim()).filter(Boolean))];
  issue.updatedAt = new Date().toISOString();
  updateIssue(issue);
  return issue;
}

export function addAgent(workspaceId: string, issueId: string, agentId: string): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return null;

  if (!issue.assignedAgents.includes(agentId)) {
    issue.assignedAgents.push(agentId);
    issue.updatedAt = new Date().toISOString();
    updateIssue(issue);
  }
  return issue;
}

export function remove(workspaceId: string, issueId: string): boolean {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return false;

  // 删除关联的 tasks
  const tasks = taskService.list(workspaceId, issueId);
  for (const task of tasks) {
    taskService.remove(workspaceId, task.id);
  }

  // 删除绑定的 channel
  if (issue.channelId) {
    channelService.deleteChannel(workspaceId, issue.channelId);
  }

  deleteIssue(workspaceId, issueId);
  return true;
}
