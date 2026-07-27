import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { BUILT_IN_AGENT_TOOLS, type BuiltInAgentToolName, type FileNode, type Workspace } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import * as fileService from '../file.js';
import { assertRecord, readRequiredString, readStringOrDefault } from './input-helpers.js';

const MAX_READ_BYTES = 1024 * 1024;
const MAX_SEARCH_FILES = 200;
const MAX_SEARCH_MATCHES = 50;

const workspacePathInputSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Workspace-relative file or directory path. Absolute paths and parent traversal are not allowed.',
    },
  },
  required: ['path'],
  additionalProperties: false,
};

const listWorkspaceFilesInputSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Workspace-relative directory path. Defaults to workspace root.',
    },
    depth: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'Directory traversal depth. Defaults to 2, capped at 10.',
    },
  },
  additionalProperties: false,
};

const searchWorkspaceFilesInputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Case-insensitive text to search for in workspace file paths and text content.',
    },
    path: {
      type: 'string',
      description: 'Workspace-relative directory path. Defaults to workspace root.',
    },
    maxFiles: {
      type: 'number',
      minimum: 1,
      maximum: MAX_SEARCH_FILES,
      description: `Maximum files to inspect. Defaults to 50, capped at ${MAX_SEARCH_FILES}.`,
    },
    maxMatches: {
      type: 'number',
      minimum: 1,
      maximum: MAX_SEARCH_MATCHES,
      description: `Maximum matches to return. Defaults to 20, capped at ${MAX_SEARCH_MATCHES}.`,
    },
  },
  required: ['query'],
  additionalProperties: false,
};

const readWorkspaceFileLinesInputSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Workspace-relative file path to read.',
    },
    startLine: {
      type: 'number',
      minimum: 1,
      description: '1-based line number to start reading from.',
    },
    count: {
      type: 'number',
      minimum: 1,
      maximum: 500,
      description: 'Maximum lines to return. Defaults to 50, capped at 500.',
    },
  },
  required: ['path', 'startLine'],
  additionalProperties: false,
};

const writeWorkspaceFileInputSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Workspace-relative file path to write.',
    },
    content: {
      type: 'string',
      description: 'UTF-8 text content to write.',
    },
    mode: {
      type: 'string',
      enum: ['overwrite', 'append'],
      description: 'overwrite replaces the file, append appends to the existing file. Defaults to overwrite.',
    },
  },
  required: ['path', 'content'],
  additionalProperties: false,
};

const replaceWorkspaceFileLineInputSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Workspace-relative file path to edit.',
    },
    line: {
      type: 'number',
      minimum: 1,
      description: '1-based line number to replace.',
    },
    content: {
      type: 'string',
      description: 'Replacement UTF-8 text for the line, without a line break.',
    },
    expected: {
      type: 'string',
      description: 'Optional exact current line text. Replacement fails when it does not match.',
    },
  },
  required: ['path', 'line', 'content'],
  additionalProperties: false,
};

const moveWorkspaceFileInputSchema = {
  type: 'object',
  properties: {
    sourcePath: {
      type: 'string',
      description: 'Existing workspace-relative source file or directory path.',
    },
    targetPath: {
      type: 'string',
      description: 'Workspace-relative destination file or directory path.',
    },
  },
  required: ['sourcePath', 'targetPath'],
  additionalProperties: false,
};

export function createWorkspaceFileFunctionTools(
  workspaceId: string,
  allowedTools?: BuiltInAgentToolName[],
  resolveWorkspace?: () => Workspace | null,
): AgentFunctionTool[] {
  const allowedToolNames = getAllowedWorkspaceFileToolNames(allowedTools);
  const tools: AgentFunctionTool[] = [
    {
      name: 'ListWorkspaceFiles',
      description: 'List files and directories in the current workspace filesystem. Use workspace-relative paths only.',
      inputSchema: listWorkspaceFilesInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => listWorkspaceFiles(workspaceId, input, resolveWorkspace),
    },
    {
      name: 'SearchWorkspaceFiles',
      description: 'Search workspace file paths and UTF-8 text file content. Use this to find relevant files before reading them.',
      inputSchema: searchWorkspaceFilesInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => searchWorkspaceFiles(workspaceId, input, resolveWorkspace),
    },
    {
      name: 'ReadWorkspaceFile',
      description: `Read a UTF-8 text file from the current workspace. Files larger than ${MAX_READ_BYTES} bytes are rejected.`,
      inputSchema: workspacePathInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => readWorkspaceFile(workspaceId, input, resolveWorkspace),
    },
    {
      name: 'ReadWorkspaceFileLines',
      description: `Read lines from a UTF-8 workspace file starting at a 1-based line number. Files larger than ${MAX_READ_BYTES} bytes are rejected.`,
      inputSchema: readWorkspaceFileLinesInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => readWorkspaceFileLines(workspaceId, input, resolveWorkspace),
    },
    {
      name: 'WriteWorkspaceFile',
      description: 'Write UTF-8 text content to a workspace file. Creates parent directories when needed.',
      inputSchema: writeWorkspaceFileInputSchema,
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => writeWorkspaceFile(workspaceId, input, resolveWorkspace),
    },
    {
      name: 'ReplaceWorkspaceFileLine',
      description: `Replace a single 1-based line in a UTF-8 workspace file. Files larger than ${MAX_READ_BYTES} bytes are rejected.`,
      inputSchema: replaceWorkspaceFileLineInputSchema,
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => replaceWorkspaceFileLine(workspaceId, input, resolveWorkspace),
    },
    {
      name: 'DeleteWorkspacePath',
      description: 'Delete a workspace file or directory recursively by workspace-relative path.',
      inputSchema: workspacePathInputSchema,
      annotations: { destructive: true, openWorld: false },
      execute: async (input) => deleteWorkspacePath(workspaceId, input, resolveWorkspace),
    },
    {
      name: 'MoveWorkspacePath',
      description: 'Move or rename a workspace file or directory using workspace-relative paths.',
      inputSchema: moveWorkspaceFileInputSchema,
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => moveWorkspacePath(workspaceId, input, resolveWorkspace),
    },
  ];

  return tools.filter((tool) => allowedToolNames.has(tool.name as BuiltInAgentToolName));
}

async function listWorkspaceFiles(workspaceId: string, input: unknown, resolveWorkspace?: () => Workspace | null): Promise<{ workspaceId: string; path: string; files: FileNode[] }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const relPath = readWorkspacePath(readStringOrDefault(data.path, ''));
  const depth = clampNumber(data.depth, 2, 1, 10);
  const files = await readWorkspaceTree(workspace, relPath, depth);
  return { workspaceId, path: relPath, files };
}

async function readWorkspaceFile(workspaceId: string, input: unknown, resolveWorkspace?: () => Workspace | null): Promise<{ path: string; content: string; encoding: string; size: number }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const relPath = readWorkspacePath(readRequiredString(data.path, 'path'));
  const { workspace: targetWorkspace, path: targetPath } = resolveWorkspaceTarget(workspace, relPath);
  const abs = fileService.resolvePath(targetWorkspace, targetPath);
  if (!abs) throw new Error('Invalid workspace path.');
  const fileStat = await stat(abs).catch(() => null);
  if (!fileStat || !fileStat.isFile()) throw new Error('Workspace file not found.');
  if (fileStat.size > MAX_READ_BYTES) throw new Error(`File is too large to read. Maximum size is ${MAX_READ_BYTES} bytes.`);
  const result = await fileService.readFileContent(targetWorkspace, targetPath);
  if (!result) throw new Error('Failed to read workspace file as UTF-8 text.');
  return { path: relPath, content: result.content, encoding: result.encoding, size: fileStat.size };
}

async function readWorkspaceFileLines(
  workspaceId: string,
  input: unknown,
  resolveWorkspace?: () => Workspace | null,
): Promise<{ path: string; startLine: number; endLine: number; totalLines: number; lines: Array<{ line: number; content: string }> }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const relPath = readWorkspacePath(readRequiredString(data.path, 'path'));
  const startLine = readLineNumber(data.startLine);
  const count = clampNumber(data.count, 50, 1, 500);
  const { workspace: targetWorkspace, path: targetPath } = resolveWorkspaceTarget(workspace, relPath);
  const abs = fileService.resolvePath(targetWorkspace, targetPath);
  if (!abs) throw new Error('Invalid workspace path.');
  const fileStat = await stat(abs).catch(() => null);
  if (!fileStat || !fileStat.isFile()) throw new Error('Workspace file not found.');
  if (fileStat.size > MAX_READ_BYTES) throw new Error(`File is too large to read. Maximum size is ${MAX_READ_BYTES} bytes.`);
  const result = await fileService.readFileContent(targetWorkspace, targetPath);
  if (!result) throw new Error('Failed to read workspace file as UTF-8 text.');
  const lines = splitContentLines(result.content);
  if (startLine > lines.length) throw new Error(`Line ${startLine} is out of range.`);
  const selected = lines.slice(startLine - 1, startLine - 1 + count);
  return {
    path: relPath,
    startLine,
    endLine: startLine + selected.length - 1,
    totalLines: lines.length,
    lines: selected.map((content, index) => ({ line: startLine + index, content })),
  };
}

async function writeWorkspaceFile(workspaceId: string, input: unknown, resolveWorkspace?: () => Workspace | null): Promise<{ ok: true; path: string; mode: 'overwrite' | 'append' }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const relPath = readWorkspacePath(readRequiredString(data.path, 'path'));
  const content = readStringOrDefault(data.content, '');
  const mode = readStringOrDefault(data.mode, 'overwrite') === 'append' ? 'append' : 'overwrite';
  const { workspace: targetWorkspace, path: targetPath } = resolveWorkspaceTarget(workspace, relPath);
  const nextContent = mode === 'append'
    ? `${(await fileService.readFileContent(targetWorkspace, targetPath))?.content ?? ''}${content}`
    : content;
  const ok = await fileService.writeFileContent(targetWorkspace, targetPath, nextContent);
  if (!ok) throw new Error('Failed to write workspace file.');
  return { ok: true, path: relPath, mode };
}

async function replaceWorkspaceFileLine(
  workspaceId: string,
  input: unknown,
  resolveWorkspace?: () => Workspace | null,
): Promise<{ ok: true; path: string; line: number }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const relPath = readWorkspacePath(readRequiredString(data.path, 'path'));
  const line = readLineNumber(data.line);
  const content = readStringOrDefault(data.content, '');
  if (/\r|\n/.test(content)) throw new Error('content must not contain line breaks.');
  if (Object.hasOwn(data, 'expected') && typeof data.expected !== 'string') throw new Error('expected must be a string.');
  const expected = Object.hasOwn(data, 'expected') ? data.expected as string : undefined;
  const { workspace: targetWorkspace, path: targetPath } = resolveWorkspaceTarget(workspace, relPath);
  const abs = fileService.resolvePath(targetWorkspace, targetPath);
  if (!abs) throw new Error('Invalid workspace path.');
  const fileStat = await stat(abs).catch(() => null);
  if (!fileStat || !fileStat.isFile()) throw new Error('Workspace file not found.');
  if (fileStat.size > MAX_READ_BYTES) throw new Error(`File is too large to edit. Maximum size is ${MAX_READ_BYTES} bytes.`);
  const result = await fileService.readFileContent(targetWorkspace, targetPath);
  if (!result) throw new Error('Failed to read workspace file as UTF-8 text.');
  const newline = result.content.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  const lines = result.content.split(/\r\n|\n|\r/);
  const index = line - 1;
  if (!result.content || index < 0 || index >= lines.length || (index === lines.length - 1 && lines[index] === '')) {
    throw new Error(`Line ${line} is out of range.`);
  }
  if (expected !== undefined && lines[index] !== expected) {
    throw new Error(`Line ${line} does not match expected content.`);
  }
  lines[index] = content;
  const ok = await fileService.writeFileContent(targetWorkspace, targetPath, lines.join(newline));
  if (!ok) throw new Error('Failed to write workspace file.');
  return { ok: true, path: relPath, line };
}

async function deleteWorkspacePath(workspaceId: string, input: unknown, resolveWorkspace?: () => Workspace | null): Promise<{ ok: true; path: string }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const relPath = readWorkspacePath(readRequiredString(data.path, 'path'));
  const { workspace: targetWorkspace, path: targetPath } = resolveWorkspaceTarget(workspace, relPath);
  const ok = await fileService.deletePath(targetWorkspace, targetPath);
  if (!ok) throw new Error('Failed to delete workspace path.');
  return { ok: true, path: relPath };
}

async function moveWorkspacePath(workspaceId: string, input: unknown, resolveWorkspace?: () => Workspace | null): Promise<{ ok: true; sourcePath: string; targetPath: string }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const sourcePath = readWorkspacePath(readRequiredString(data.sourcePath, 'sourcePath'));
  const targetPath = readWorkspacePath(readRequiredString(data.targetPath, 'targetPath'));
  const source = resolveWorkspaceTarget(workspace, sourcePath);
  const target = resolveWorkspaceTarget(workspace, targetPath);
  if (source.workspace.boundDirs[0] !== target.workspace.boundDirs[0]) throw new Error('Cannot move paths between workspace roots.');
  const ok = await fileService.renamePath(source.workspace, source.path, target.path);
  if (!ok) throw new Error('Failed to move workspace path.');
  return { ok: true, sourcePath, targetPath };
}

async function searchWorkspaceFiles(
  workspaceId: string,
  input: unknown,
  resolveWorkspace?: () => Workspace | null,
): Promise<{ query: string; path: string; matches: Array<{ path: string; name: string; type: 'path' | 'content'; line?: number; preview?: string }> }> {
  const workspace = getWorkspaceOrThrow(workspaceId, resolveWorkspace);
  const data = readInputRecord(input);
  const query = readRequiredString(data.query, 'query').toLowerCase();
  const relPath = readWorkspacePath(readStringOrDefault(data.path, ''));
  const maxFiles = clampNumber(data.maxFiles, 50, 1, MAX_SEARCH_FILES);
  const maxMatches = clampNumber(data.maxMatches, 20, 1, MAX_SEARCH_MATCHES);
  const tree = await readWorkspaceTree(workspace, relPath, Infinity);
  const files = flattenFiles(tree).slice(0, maxFiles);
  const matches: Array<{ path: string; name: string; type: 'path' | 'content'; line?: number; preview?: string }> = [];

  for (const file of files) {
    if (matches.length >= maxMatches) break;
    if (file.path.toLowerCase().includes(query) || file.name.toLowerCase().includes(query)) {
      matches.push({ path: file.path, name: file.name, type: 'path' });
      if (matches.length >= maxMatches) break;
    }
    const { workspace: targetWorkspace, path: targetPath } = resolveWorkspaceTarget(workspace, file.path);
    const abs = fileService.resolvePath(targetWorkspace, targetPath);
    const fileStat = abs ? await stat(abs).catch(() => null) : null;
    if (!fileStat || !fileStat.isFile() || fileStat.size > MAX_READ_BYTES) continue;
    const content = await fileService.readFileContent(targetWorkspace, targetPath);
    if (!content) continue;
    const lines = content.content.split(/\r?\n/);
    const lineIndex = lines.findIndex((line) => line.toLowerCase().includes(query));
    if (lineIndex !== -1) {
      matches.push({
        path: file.path,
        name: basename(file.path),
        type: 'content',
        line: lineIndex + 1,
        preview: lines[lineIndex].trim().slice(0, 500),
      });
    }
  }

  return { query, path: relPath, matches };
}

async function readWorkspaceTree(workspace: Workspace, relPath: string, depth: number): Promise<FileNode[]> {
  if (workspace.boundDirs.length <= 1) return fileService.readTree(workspace, relPath, depth);
  if (!relPath) {
    const defaultFiles = await fileService.readTree(singleRootWorkspace(workspace, workspace.boundDirs[0]), '', depth);
    const roots = workspace.boundDirs.slice(1).map((dir) => rootNode(dir));
    if (depth <= 1) return [...defaultFiles, ...roots];
    const extraRoots = await Promise.all(roots.map(async (node, index) => ({
      ...node,
      children: prefixTreePaths(await fileService.readTree(singleRootWorkspace(workspace, workspace.boundDirs[index + 1]), '', depth - 1), node.path),
    })));
    return [...defaultFiles, ...extraRoots];
  }
  const { workspace: targetWorkspace, path: targetPath } = resolveWorkspaceTarget(workspace, relPath);
  return fileService.readTree(targetWorkspace, targetPath, depth);
}

function resolveWorkspaceTarget(workspace: Workspace, relPath: string): { workspace: Workspace; path: string } {
  if (workspace.boundDirs.length <= 1) return { workspace, path: relPath };
  const [rootName, ...rest] = relPath.split('/');
  const index = workspace.boundDirs.findIndex((dir) => rootPathName(dir) === rootName);
  if (index === -1) return { workspace: singleRootWorkspace(workspace, workspace.boundDirs[0]), path: relPath };
  return { workspace: singleRootWorkspace(workspace, workspace.boundDirs[index]), path: rest.join('/') };
}

function rootNode(dir: string): FileNode {
  return {
    name: rootPathName(dir),
    path: rootPathName(dir),
    type: 'directory',
  };
}

function rootPathName(dir: string): string {
  return basename(dir.replace(/[\\/]+$/, '')) || dir;
}

function singleRootWorkspace(workspace: Workspace, dir: string): Workspace {
  return { ...workspace, boundDirs: [dir] };
}

function prefixTreePaths(nodes: FileNode[], prefix: string): FileNode[] {
  return nodes.map((node) => ({
    ...node,
    path: `${prefix}/${node.path}`,
    children: node.children ? prefixTreePaths(node.children, prefix) : node.children,
  }));
}

function getWorkspaceOrThrow(workspaceId: string, resolveWorkspace?: () => Workspace | null): Workspace {
  const workspace = fileService.getWorkspace(workspaceId) ?? resolveWorkspace?.();
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
  return workspace;
}

function readInputRecord(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  return assertRecord(input);
}

function readWorkspacePath(path: string): string {
  const trimmed = path.trim();
  if (/^[a-zA-Z]:\//.test(trimmed.replace(/\\/g, '/'))) throw new Error('Absolute paths are not allowed.');
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.split('/').some((part) => part === '..')) throw new Error('Parent path traversal is not allowed.');
  return normalized;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback));
}

function readLineNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error('line must be a positive integer.');
  return value;
}

function splitContentLines(content: string): string[] {
  const lines = content.split(/\r\n|\n|\r/);
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

function flattenFiles(nodes: FileNode[]): Array<FileNode & { type: 'file' }> {
  const result: Array<FileNode & { type: 'file' }> = [];
  for (const node of nodes) {
    if (node.type === 'file') result.push(node as FileNode & { type: 'file' });
    if (node.children?.length) result.push(...flattenFiles(node.children));
  }
  return result;
}

function getAllowedWorkspaceFileToolNames(allowedTools?: BuiltInAgentToolName[]): Set<BuiltInAgentToolName> {
  const names = new Set(allowedTools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));
  const hasWorkspaceFileTools = Array.from(names).some((name) => isWorkspaceFileToolName(name));
  if (hasWorkspaceFileTools) {
    names.add('ListWorkspaceFiles');
    names.add('SearchWorkspaceFiles');
    names.add('ReadWorkspaceFile');
    names.add('ReadWorkspaceFileLines');
  }
  return names;
}

function isWorkspaceFileToolName(name: BuiltInAgentToolName): boolean {
  return name === 'ListWorkspaceFiles'
    || name === 'SearchWorkspaceFiles'
    || name === 'ReadWorkspaceFile'
    || name === 'ReadWorkspaceFileLines'
    || name === 'WriteWorkspaceFile'
    || name === 'ReplaceWorkspaceFileLine'
    || name === 'DeleteWorkspacePath'
    || name === 'MoveWorkspacePath';
}
