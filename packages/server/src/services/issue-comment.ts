import { v4 as uuid } from 'uuid';
import { join } from 'node:path';
import type { IssueComment } from '@agent-spaces/shared';
import { getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
import { getIssue } from '../storage/issue-store.js';

function issueCommentsFilePath(workspaceId: string, issueId: string): string {
  return join(getDataDir(), 'workspaces', workspaceId, 'issues', `${issueId}.comments.json`);
}

export function listIssueComments(workspaceId: string, issueId: string): IssueComment[] {
  return readJsonFile<IssueComment[]>(issueCommentsFilePath(workspaceId, issueId)) || [];
}

export function createIssueComment(
  workspaceId: string,
  issueId: string,
  data: {
    senderId: string;
    content: string;
    senderRole?: string;
    source?: IssueComment['source'];
    metadata?: IssueComment['metadata'];
  },
): IssueComment | null {
  if (!getIssue(workspaceId, issueId)) return null;

  const now = new Date().toISOString();
  const comments = listIssueComments(workspaceId, issueId);
  const comment: IssueComment = {
    id: uuid(),
    workspaceId,
    issueId,
    senderId: data.senderId,
    senderRole: data.senderRole,
    content: data.content,
    source: data.source,
    metadata: data.metadata,
    createdAt: now,
  };
  comments.push(comment);
  writeJsonFile(issueCommentsFilePath(workspaceId, issueId), comments);
  return comment;
}

export function updateIssueComment(
  workspaceId: string,
  issueId: string,
  commentId: string,
  data: Partial<Pick<IssueComment, 'content' | 'metadata'>>,
): IssueComment | null {
  const comments = listIssueComments(workspaceId, issueId);
  const index = comments.findIndex((comment) => comment.id === commentId);
  if (index === -1) return null;

  const updated: IssueComment = {
    ...comments[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  comments[index] = updated;
  writeJsonFile(issueCommentsFilePath(workspaceId, issueId), comments);
  return updated;
}

export function deleteIssueComment(workspaceId: string, issueId: string, commentId: string): boolean {
  const comments = listIssueComments(workspaceId, issueId);
  const index = comments.findIndex((comment) => comment.id === commentId);
  if (index === -1) return false;

  comments.splice(index, 1);
  writeJsonFile(issueCommentsFilePath(workspaceId, issueId), comments);
  return true;
}
