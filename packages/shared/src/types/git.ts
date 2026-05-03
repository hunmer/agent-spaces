export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  oldPath?: string;
}

export interface GitStatusResult {
  branch: string;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
  clean: boolean;
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitDiffResult {
  path: string;
  oldContent: string;
  newContent: string;
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
}
