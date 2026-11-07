export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  oldPath?: string;
  staged?: boolean;
  conflicted?: boolean;
}

export interface GitStatusResult {
  branch: string;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
  clean: boolean;
  insertions: number;
  deletions: number;
  headHash?: string;
  remoteHeadHash?: string;
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
  parents?: string[];
  refs?: string[];
}

export interface GitDiffResult {
  path: string;
  oldContent: string;
  newContent: string;
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
  isConflict?: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
}

export interface GitOperationEntry {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
  timestamp: string;
  duration: number;
}
