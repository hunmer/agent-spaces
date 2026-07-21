import { v4 as uuid } from 'uuid';
import type { Issue, IssueStatus, CreateIssueInput } from '@agent-spaces/shared';
import { listIssues, getIssue, createIssue, updateIssue, deleteIssue } from '../storage/issue-store.js';
import * as channelService from '../services/channel.js';

function ensureIssueChannel(workspaceId: string, issue: Issue): Issue {
  ensureRetryDefaults(workspaceId, issue);
  const existingChannel = issue.channelId ? channelService.getChannel(workspaceId, issue.channelId) : undefined;
  const issueMembers = issue.members || [];
  const fallbackChannelMembers = existingChannel?.members ?? [];
  const channelMembers = issueMembers.length > 0 ? issueMembers : fallbackChannelMembers;
  if (issueMembers.length === 0 && fallbackChannelMembers.length > 0) {
    issue.members = [...fallbackChannelMembers];
    updateIssue(issue);
  }
  if (issue.channelId) {
    channelService.updateChannel(workspaceId, issue.channelId, { type: 'issue', issueId: issue.id, members: channelMembers });
    return issue;
  }

  const { channel } = channelService.createChannel(workspaceId, {
    name: issue.title,
    type: 'issue',
    issueId: issue.id,
    members: channelMembers,
  });
  issue.channelId = channel.id;
  updateIssue(issue);
  return issue;
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
  for (const issue of all) ensureRetryDefaults(workspaceId, issue);
  return status ? all.filter((i) => i.status === status) : all;
}

export function getById(workspaceId: string, issueId: string): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (issue) ensureRetryDefaults(workspaceId, issue);
  return issue;
}

export function ensureChannel(workspaceId: string, issueId: string): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  return issue ? ensureIssueChannel(workspaceId, issue) : null;
}

export function create(workspaceId: string, input: CreateIssueInput): Issue {
  const now = new Date().toISOString();
  const issueId = uuid();
  const issue: Issue = {
    id: issueId,
    workspaceId,
    title: input.title,
    description: input.description,
    status: input.status ?? 'draft',
    members: input.members || [],
    workflowId: input.workflowId,
    workflowExecutionId: undefined,
    workflowExecutionStatus: undefined,
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  };
  createIssue(issue);
  return ensureIssueChannel(workspaceId, issue);
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
  const issueMembers = input.members ?? channel.members ?? [];
  const issue: Issue = {
    id: issueId,
    workspaceId,
    channelId,
    title: input.title,
    description: input.description,
    status: input.status ?? 'draft',
    members: [...issueMembers],
    workflowExecutionId: undefined,
    workflowExecutionStatus: undefined,
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
    members: issueMembers,
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

export function markStopped(
  workspaceId: string,
  issueId: string,
): Issue | null {
  return updateStatus(workspaceId, issueId, 'stopped', {
    workflowExecutionStatus: 'stopped',
    lastError: undefined,
    retryPaused: false,
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
  issue.workflowExecutionStatus = undefined;
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

export function addAgent(workspaceId: string, issueId: string, agentId: string): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return null;

  if (!issue.members.includes(agentId)) {
    issue.members.push(agentId);
    issue.updatedAt = new Date().toISOString();
    updateIssue(issue);
  }
  return issue;
}

export function remove(workspaceId: string, issueId: string): boolean {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return false;

  // 删除绑定的 channel
  if (issue.channelId) {
    channelService.deleteChannel(workspaceId, issue.channelId);
  }

  deleteIssue(workspaceId, issueId);
  return true;
}
