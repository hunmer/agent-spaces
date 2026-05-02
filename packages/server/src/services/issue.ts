import { v4 as uuid } from 'uuid';
import type { Issue, IssueStatus, CreateIssueInput } from '@agent-spaces/shared';
import { listIssues, getIssue, createIssue, updateIssue, deleteIssue } from '../storage/issue-store.js';
import * as channelService from '../services/channel.js';

function ensureChannel(workspaceId: string, issue: Issue): void {
  if (issue.channelId) return;
  const channel = channelService.createChannel(workspaceId, {
    name: issue.title,
    type: 'issue',
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
  channelService.updateChannel(workspaceId, channel.id, { name: input.title });
  createIssue(issue);
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
