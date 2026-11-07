export interface CodeSearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchLength: number;
}

export interface FileSearchResult {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

export interface SearchCodeOptions {
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  filePattern?: string;
  maxResults?: number;
}
