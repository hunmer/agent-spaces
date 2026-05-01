import { join } from 'node:path';
import type { Issue } from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js';

function issuesDir(workspaceId: string) {
  return join(getDataDir(), 'workspaces', workspaceId, 'issues');
}

function issuesIndex(workspaceId: string) {
  return join(issuesDir(workspaceId), 'index.json');
}

function issueFile(workspaceId: string, issueId: string) {
  return join(issuesDir(workspaceId), `${issueId}.json`);
}

export function listIssues(workspaceId: string): Issue[] {
  return readJsonFile<Issue[]>(issuesIndex(workspaceId)) || [];
}

export function getIssue(workspaceId: string, issueId: string): Issue | null {
  return readJsonFile<Issue>(issueFile(workspaceId, issueId));
}

export function createIssue(issue: Issue): void {
  ensureDir(issuesDir(issue.workspaceId));
  writeJsonFile(issueFile(issue.workspaceId, issue.id), issue);

  const list = listIssues(issue.workspaceId);
  list.push(issue);
  writeJsonFile(issuesIndex(issue.workspaceId), list);
}

export function updateIssue(issue: Issue): void {
  writeJsonFile(issueFile(issue.workspaceId, issue.id), issue);

  const list = listIssues(issue.workspaceId);
  const idx = list.findIndex((i) => i.id === issue.id);
  if (idx >= 0) list[idx] = issue;
  writeJsonFile(issuesIndex(issue.workspaceId), list);
}

export function deleteIssue(workspaceId: string, issueId: string): void {
  const list = listIssues(workspaceId).filter((i) => i.id !== issueId);
  writeJsonFile(issuesIndex(workspaceId), list);
}
