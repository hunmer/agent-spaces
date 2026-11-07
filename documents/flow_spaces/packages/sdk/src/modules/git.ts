import type { HttpClient } from '../client';
import type { GitStatusResult, GitDiffResult, GitLogEntry, GitBranch } from '@agent-spaces/shared';

export function createGitApi(http: HttpClient) {
  const base = (wsId: string) => `/api/workspaces/${wsId}/git`;

  return {
    status: (workspaceId: string): Promise<GitStatusResult> =>
      http.get(`${base(workspaceId)}/status`),

    diff: (workspaceId: string, filePath?: string): Promise<GitDiffResult[]> =>
      http.get(`${base(workspaceId)}/diff${filePath ? `?path=${encodeURIComponent(filePath)}` : ''}`),

    log: (workspaceId: string): Promise<GitLogEntry[]> =>
      http.get(`${base(workspaceId)}/log`),

    branches: (workspaceId: string): Promise<GitBranch[]> =>
      http.get(`${base(workspaceId)}/branches`),

    init: (workspaceId: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/init`),

    commit: (workspaceId: string, message: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/commit`, { message }),

    discard: (workspaceId: string, filePath: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/discard`, { path: filePath }),

    discardAll: (workspaceId: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/discard-all`),

    stage: (workspaceId: string, filePath: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/stage`, { path: filePath }),

    unstage: (workspaceId: string, filePath: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/unstage`, { path: filePath }),

    resolveFile: (workspaceId: string, data: { path: string; content: string; stage?: boolean }): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/resolve-file`, data),

    checkout: (workspaceId: string, branch: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/checkout`, { branch }),

    checkoutDetached: (workspaceId: string, commitHash: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/checkout-detached`, { commitHash }),

    push: (workspaceId: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/push`),

    pull: (workspaceId: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/pull`),

    fetch: (workspaceId: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/fetch`),

    remotes: (workspaceId: string): Promise<{ name: string; refs: { fetch: string; push: string } }[]> =>
      http.get(`${base(workspaceId)}/remotes`),

    addRemote: (workspaceId: string, name: string, url: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/remotes`, { name, url }),

    cherryPick: (workspaceId: string, commitHash: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/cherry-pick`, { commitHash }),

    createBranch: (workspaceId: string, name: string, startPoint?: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/create-branch`, { name, startPoint }),

    deleteBranch: (workspaceId: string, name: string, force?: boolean): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/delete-branch`, { name, force }),

    createTag: (workspaceId: string, name: string, commitHash?: string): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/create-tag`, { name, commitHash }),

    commitDiff: (workspaceId: string, hash: string): Promise<GitDiffResult[]> =>
      http.get(`${base(workspaceId)}/commit-diff?hash=${encodeURIComponent(hash)}`),

    remoteUrl: (workspaceId: string): Promise<string> =>
      http.get<{ url: string }>(`${base(workspaceId)}/remote-url`).then(r => r.url),

    mergeBase: (workspaceId: string): Promise<string> =>
      http.get<{ hash: string }>(`${base(workspaceId)}/merge-base`).then(r => r.hash),

    reset: (workspaceId: string, data: { commitHash: string; mode?: 'soft' | 'mixed' | 'hard' }): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/reset`, data),

    /** Get git operation log */
    operations: (workspaceId: string): Promise<import('@agent-spaces/shared').GitOperationEntry[]> =>
      http.get(`${base(workspaceId)}/operations`),

    /** Generate commit message via AI */
    generateCommitMessage: (workspaceId: string): Promise<{ message?: string }> =>
      http.post(`${base(workspaceId)}/generate-commit-message`),

    /** Get git config */
    config: (workspaceId: string): Promise<{ name?: string; email?: string; proxy?: string }> =>
      http.get(`${base(workspaceId)}/config`),

    /** Update git config */
    updateConfig: (workspaceId: string, data: { name?: string; email?: string; proxy?: string }): Promise<void> =>
      http.postVoid(`${base(workspaceId)}/config`, data),
  };
}
