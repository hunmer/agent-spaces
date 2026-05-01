import { v4 as uuid } from 'uuid';
import type { Issue, IssueStatus, CreateIssueInput } from '@agent-spaces/shared';
import { listIssues, getIssue, createIssue, updateIssue, deleteIssue } from '../storage/issue-store.js';

export function list(workspaceId: string, status?: IssueStatus): Issue[] {
  const all = listIssues(workspaceId);
  return status ? all.filter((i) => i.status === status) : all;
}

export function getById(workspaceId: string, issueId: string): Issue | null {
  return getIssue(workspaceId, issueId);
}

export function create(workspaceId: string, input: CreateIssueInput): Issue {
  const now = new Date().toISOString();
  const issue: Issue = {
    id: uuid(),
    workspaceId,
    title: input.title,
    description: input.description,
    status: 'draft',
    tasks: [],
    assignedAgents: [],
    createdAt: now,
    updatedAt: now,
  };
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
