import { v4 as uuid } from 'uuid';
import type { Issue, IssueStatus, CreateIssueInput } from '@agent-spaces/shared';
import { listIssues, getIssue, createIssue, updateIssue, deleteIssue } from '../storage/issue-store.js';
import * as channelService from '../services/channel.js';

function ensureChannel(workspaceId: string, issue: Issue): void {
  if (issue.channelId) {
    channelService.updateChannel(workspaceId, issue.channelId, { type: 'issue', issueId: issue.id });
    return;
  }

  const channel = channelService.createChannel(workspaceId, {
    name: issue.title,
    type: 'issue',
    issueId: issue.id,
    members: ['user'],
  });
  issue.channelId = channel.id;
  updateIssue(issue);
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
  const channel = channelService.createChannel(workspaceId, {
    name: input.title,
    type: 'issue',
    issueId,
    members: ['user'],
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
    members: [],
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

export function save(workspaceId: string, issue: Issue): Issue {
  if (issue.workspaceId !== workspaceId) throw new Error('issue workspace mismatch');
  issue.updatedAt = new Date().toISOString();
  updateIssue(issue);
  return issue;
}

export function addTask(workspaceId: string, issueId: string, taskId: string): Issue | null {
  const issue = getIssue(workspaceId, issueId);
  if (!issue) return null;

  issue.tasks.push(taskId);
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
  deleteIssue(workspaceId, issueId);
  return true;
}
