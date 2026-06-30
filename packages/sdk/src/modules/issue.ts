import type { HttpClient } from '../client';
import type { Issue, IssueComment, CreateIssueInput } from '@agent-spaces/shared';

export interface StartIssueInput {
  input?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

export function createIssueApi(http: HttpClient) {
  return {
    list: (workspaceId: string): Promise<Issue[]> =>
      http.get(`/api/workspaces/${workspaceId}/issues`),

    create: (workspaceId: string, data: CreateIssueInput): Promise<Issue> =>
      http.post(`/api/workspaces/${workspaceId}/issues`, data),

    get: (workspaceId: string, issueId: string): Promise<Issue> =>
      http.get(`/api/workspaces/${workspaceId}/issues/${issueId}`),

    update: (workspaceId: string, issueId: string, data: Partial<Issue>): Promise<Issue> =>
      http.put(`/api/workspaces/${workspaceId}/issues/${issueId}`, data),

    delete_: (workspaceId: string, issueId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/issues/${issueId}`),

    start: (workspaceId: string, issueId: string, data?: StartIssueInput): Promise<Issue> =>
      http.post(`/api/workspaces/${workspaceId}/issues/${issueId}/start`, data),

    pause: (workspaceId: string, issueId: string): Promise<Issue> =>
      http.post(`/api/workspaces/${workspaceId}/issues/${issueId}/pause`),

    resume: (workspaceId: string, issueId: string): Promise<Issue> =>
      http.post(`/api/workspaces/${workspaceId}/issues/${issueId}/resume`),

    interrupt: (workspaceId: string, issueId: string): Promise<Issue> =>
      http.post(`/api/workspaces/${workspaceId}/issues/${issueId}/interrupt`),

    // ---- Comments ----

    listComments: (workspaceId: string, issueId: string): Promise<IssueComment[]> =>
      http.get(`/api/workspaces/${workspaceId}/issues/${issueId}/comments`),

    addComment: (workspaceId: string, issueId: string, content: string, mentions?: string[]): Promise<IssueComment> =>
      http.post(`/api/workspaces/${workspaceId}/issues/${issueId}/comments`, { content, mentions }),

    /** Delete a comment */
    deleteComment: (workspaceId: string, issueId: string, commentId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/issues/${issueId}/comments/${commentId}`),

    /** Update a comment */
    updateComment: (workspaceId: string, issueId: string, commentId: string, content: string): Promise<IssueComment> =>
      http.put(`/api/workspaces/${workspaceId}/issues/${issueId}/comments/${commentId}`, { content }),
  };
}
