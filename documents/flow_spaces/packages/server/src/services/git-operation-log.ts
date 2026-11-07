import type { GitOperationEntry } from '@agent-spaces/shared';

const MAX_ENTRIES = 1000;
const store = new Map<string, GitOperationEntry[]>();

function getList(workspaceId: string): GitOperationEntry[] {
  let list = store.get(workspaceId);
  if (!list) { list = []; store.set(workspaceId, list); }
  return list;
}

let counter = 0;

export function logGitOperation(
  workspaceId: string,
  operation: string,
  input: Record<string, unknown>,
  result: unknown,
  error?: string,
  duration = 0,
) {
  const list = getList(workspaceId);
  const entry: GitOperationEntry = {
    id: `${Date.now()}-${++counter}`,
    operation,
    input,
    output: truncateOutput(result),
    error,
    timestamp: new Date().toISOString(),
    duration,
  };
  list.unshift(entry);
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
}

export function getGitOperations(workspaceId: string): GitOperationEntry[] {
  return getList(workspaceId);
}

function truncateOutput(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') return value.length > 5000 ? value.slice(0, 5000) + '...(truncated)' : value;
  const s = JSON.stringify(value);
  if (s && s.length > 5000) return JSON.parse(s.slice(0, 5000) + '...(truncated)');
  return value;
}
