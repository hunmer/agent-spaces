import type { HttpClient } from '../client';
import type { WorktreeInfo, CreateWorktreeInput } from '@agent-spaces/shared';

export function createWorktreeApi(http: HttpClient) {
  return {
    list: (workspaceId: string): Promise<WorktreeInfo[]> =>
      http.get(`/api/workspaces/${workspaceId}/worktrees`),

    create: (workspaceId: string, data: CreateWorktreeInput): Promise<WorktreeInfo> =>
      http.post(`/api/workspaces/${workspaceId}/worktrees`, data),

    remove: (workspaceId: string, worktreeId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/worktrees/${worktreeId}`),

    createPR: (workspaceId: string, worktreeId: string, opts?: { title?: string; body?: string }): Promise<string> =>
      http.post<{ prUrl: string }>(`/api/workspaces/${workspaceId}/worktrees/${worktreeId}/pr`, opts || {}).then(r => r.prUrl),

    merge: (workspaceId: string, worktreeId: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/worktrees/${worktreeId}/merge`),

    diff: (workspaceId: string, worktreeId: string): Promise<Response> =>
      http.raw(`/api/workspaces/${workspaceId}/worktrees/${worktreeId}/diff`),
  };
}
