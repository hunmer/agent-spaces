import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { readJsonFile, writeJsonFile, ensureDir, getDataDir } from './json-store.js';
import { v4 as uuid } from 'uuid';

export interface MiniAppProject {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: 'react' | 'html';
  tags?: string[];
  enabledPlugins?: string[];
  agentConfigId?: string;
  enableAgents?: boolean;
  mainFile: string;
  icon?: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  createdAt: string;
  updatedAt: string;
  storeUrl?: string;
  storeChecksum?: string;
}

function baseDir(): string {
  return join(getDataDir(), 'mini-apps');
}

function indexPath(): string {
  return join(baseDir(), 'index.json');
}

function projectDir(projectId: string): string {
  return join(baseDir(), projectId);
}

export function getProjectDir(projectId: string): string {
  return projectDir(projectId);
}

function manifestPath(projectId: string): string {
  return join(projectDir(projectId), 'manifest.json');
}

function srcDir(projectId: string): string {
  return join(projectDir(projectId), 'src');
}

function safeSrcPath(projectId: string, filePath: string): string {
  if (!filePath || filePath.includes('\0')) throw new Error('Invalid file path');
  if (filePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(filePath)) {
    throw new Error('Absolute paths are not allowed');
  }
  const root = resolve(srcDir(projectId));
  const target = resolve(root, filePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Path escapes project src directory: ${filePath}`);
  }
  return target;
}

function safeProjectSubdirPath(projectId: string, dirName: 'configs' | 'data', filePath: string): string {
  if (!filePath || filePath.includes('\0')) throw new Error('Invalid file path');
  if (filePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(filePath)) {
    throw new Error('Absolute paths are not allowed');
  }
  const root = resolve(projectDir(projectId), dirName);
  const target = resolve(root, filePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Path escapes project ${dirName} directory: ${filePath}`);
  }
  return target;
}

export function touchProject(projectId: string): void {
  const manifest = readJsonFile<MiniAppProject>(manifestPath(projectId));
  if (!manifest) return;

  manifest.updatedAt = new Date().toISOString();
  writeJsonFile(manifestPath(projectId), manifest);
  const projects = listProjects();
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx !== -1) {
    projects[idx] = manifest;
    writeJsonFile(indexPath(), projects);
  }
}

// ---- CRUD ----

export function listProjects(): MiniAppProject[] {
  return readJsonFile<MiniAppProject[]>(indexPath()) ?? [];
}

/**
 * 扫描 mini-apps/ 下每个项目目录的 manifest.json，重建 index.json。
 * 每次调用都从磁盘读取最新 manifest 并写入 index.json。
 */
export function rebuildIndex(): MiniAppProject[] {
  const root = baseDir();
  if (!existsSync(root)) return [];

  const onDisk: MiniAppProject[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^wui_/.test(entry.name)) continue;
    const manifest = readJsonFile<MiniAppProject>(manifestPath(entry.name));
    if (manifest && manifest.id === entry.name) onDisk.push(manifest);
  }

  onDisk.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  writeJsonFile(indexPath(), onDisk);
  return onDisk;
}

export function getProject(projectId: string): MiniAppProject | null {
  return listProjects().find(p => p.id === projectId) ?? null;
}

export function createProject(input: {
  name: string;
  description?: string;
  type: 'react' | 'html';
  tags?: string[];
  mainFile: string;
  files?: Record<string, string>;
}): MiniAppProject {
  const id = `wui_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  const project: MiniAppProject = {
    id,
    name: input.name,
    description: input.description,
    version: '1.0.0',
    type: input.type,
    tags: input.tags ?? [],
    mainFile: input.mainFile,
    createdAt: now,
    updatedAt: now,
  };

  ensureDir(projectDir(id));
  ensureDir(srcDir(id));
  writeJsonFile(manifestPath(id), project);

  if (input.files) {
    for (const [filePath, content] of Object.entries(input.files)) {
      const fullPath = join(srcDir(id), filePath);
      ensureDir(dirname(fullPath));
      writeFileSync(fullPath, content, 'utf-8');
    }
  }

  const projects = listProjects();
  projects.push(project);
  writeJsonFile(indexPath(), projects);

  return project;
}

export function updateProject(projectId: string, updates: Partial<Pick<MiniAppProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'agentConfigId' | 'enableAgents' | 'mainFile' | 'icon' | 'avatarUrl' | 'backgroundUrl'>>): MiniAppProject {
  const projects = listProjects();
  const index = projects.findIndex(p => p.id === projectId);
  if (index === -1) throw new Error(`Project not found: ${projectId}`);

  const updated = {
    ...projects[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  projects[index] = updated;
  writeJsonFile(indexPath(), projects);
  writeJsonFile(manifestPath(projectId), updated);
  return updated;
}

export function deleteProject(projectId: string): void {
  const projects = listProjects().filter(p => p.id !== projectId);
  writeJsonFile(indexPath(), projects);

  const dir = projectDir(projectId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

// ---- Files ----

export function getFileTree(projectId: string): string[] {
  return getFileManifest(projectId).map((entry) => entry.path);
}

export interface MiniAppFileEntry {
  path: string;
  mtimeMs: number;
}

/** Flat file list with mtime, so clients can diff for incremental refresh. */
export function getFileManifest(projectId: string): MiniAppFileEntry[] {
  const dir = srcDir(projectId);
  if (!existsSync(dir)) return [];

  const files: MiniAppFileEntry[] = [];
  function walk(d: string, prefix: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(d, entry.name), rel);
      } else {
        files.push({ path: rel, mtimeMs: statSync(join(d, entry.name)).mtimeMs });
      }
    }
  }
  walk(dir, '');
  return files;
}

export function readFile(projectId: string, filePath: string): string | null {
  const fullPath = safeSrcPath(projectId, filePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}

export function writeFile(projectId: string, filePath: string, content: string): void {
  const fullPath = safeSrcPath(projectId, filePath);
  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, content, 'utf-8');
  touchProject(projectId);
}

export function writeBinaryFile(projectId: string, filePath: string, buffer: Buffer): number {
  const fullPath = safeSrcPath(projectId, filePath);
  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, buffer);
  touchProject(projectId);
  return buffer.byteLength;
}

export function deleteFile(projectId: string, filePath: string): void {
  const fullPath = safeSrcPath(projectId, filePath);
  if (!existsSync(fullPath)) return;
  const isDir = statSync(fullPath).isDirectory();
  rmSync(fullPath, { recursive: isDir, force: true });
  touchProject(projectId);
}

export function renameFile(projectId: string, fromPath: string, toPath: string): void {
  const from = safeSrcPath(projectId, fromPath);
  const to = safeSrcPath(projectId, toPath);
  if (!existsSync(from)) throw new Error(`File not found: ${fromPath}`);
  ensureDir(dirname(to));
  renameSync(from, to);
  touchProject(projectId);
}

export function createFolder(projectId: string, dirPath: string): void {
  const fullPath = safeSrcPath(projectId, dirPath);
  ensureDir(fullPath);
  touchProject(projectId);
}

export function readConfig(projectId: string, filePath: string): unknown | null {
  const fullPath = safeProjectSubdirPath(projectId, 'configs', filePath);
  if (!existsSync(fullPath)) return null;
  return JSON.parse(readFileSync(fullPath, 'utf-8'));
}

export function writeConfig(projectId: string, filePath: string, value: unknown): void {
  const fullPath = safeProjectSubdirPath(projectId, 'configs', filePath);
  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, JSON.stringify(value, null, 2), 'utf-8');
  touchProject(projectId);
}

/** 扫描 configs 目录，返回所有 .json 文件的 { 相对路径: 解析值 }。 */
export function listConfigs(projectId: string): Record<string, unknown> {
  const root = join(projectDir(projectId), 'configs');
  const result: Record<string, unknown> = {};
  if (!existsSync(root)) return result;
  function walk(d: string, prefix: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(d, entry.name), rel);
      } else if (entry.name.endsWith('.json')) {
        try {
          result[rel] = JSON.parse(readFileSync(join(d, entry.name), 'utf-8'));
        } catch {
          /* skip malformed config */
        }
      }
    }
  }
  walk(root, '');
  return result;
}

export function writeDataFile(projectId: string, filePath: string, content: Buffer | string): number {
  const fullPath = safeProjectSubdirPath(projectId, 'data', filePath);
  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, content);
  touchProject(projectId);
  return Buffer.byteLength(content);
}

// ---- ZIP Import ----

export function importFromDir(extractDir: string, manifest: Partial<MiniAppProject> & { name: string; type: 'react' | 'html'; mainFile: string }): MiniAppProject {
  const id = `wui_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  const project: MiniAppProject = {
    id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version ?? '1.0.0',
    type: manifest.type,
    tags: manifest.tags ?? [],
    enabledPlugins: manifest.enabledPlugins,
    agentConfigId: manifest.agentConfigId,
    mainFile: manifest.mainFile,
    icon: manifest.icon,
    avatarUrl: manifest.avatarUrl,
    backgroundUrl: manifest.backgroundUrl,
    createdAt: now,
    updatedAt: now,
    storeUrl: manifest.storeUrl,
    storeChecksum: manifest.storeChecksum,
  };

  const targetDir = projectDir(id);
  ensureDir(targetDir);
  writeJsonFile(manifestPath(id), project);

  const targetSrc = srcDir(id);
  ensureDir(targetSrc);
  const contentRoot = resolveContentRoot(extractDir, manifest.mainFile);
  if (existsSync(join(contentRoot, 'src'))) {
    copyDirSync(join(contentRoot, 'src'), targetSrc);
  } else {
    copyDirSync(contentRoot, targetSrc);
  }

  const projects = listProjects();
  projects.push(project);
  writeJsonFile(indexPath(), projects);

  return project;
}

/**
 * ZIP 解压后内容可能被多余的顶层目录包裹（如 `ai_creator_tool-master/`，
 * 甚至双重嵌套）。从 extractDir 向下定位真正的内容根：
 *  - 若当前目录直接含 `src/` 子目录（标准布局）→ 当前即内容根
 *  - 若当前目录含 mainFile（扁平布局）→ 当前即内容根
 *  - 否则下钻唯一子目录继续判断，最多 4 层，找不到则回退 extractDir
 */
function resolveContentRoot(extractDir: string, mainFile: string): string {
  const isContentRoot = (dir: string): boolean =>
    existsSync(join(dir, 'src')) ||
    (!!mainFile && existsSync(join(dir, mainFile)));

  let current = extractDir;
  for (let depth = 0; depth < 4; depth++) {
    if (isContentRoot(current)) return current;
    const entries = readdirSync(current, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (entries.length !== 1) break;
    current = join(current, entries[0].name);
  }
  return extractDir;
}

function copyDirSync(src: string, dest: string): void {
  ensureDir(dest);
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

// ---- Agents config & chat ----

/** 读取项目 agents.json（多 agent 配置）。缺失返回 null。 */
export function readAgentsConfig(projectId: string): unknown[] | null {
  const filePath = join(projectDir(projectId), 'agents.json');
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** 读取单条 agent 的完整配置（含 apiKey，仅供编辑器加载）。缺失返回 null。 */
export function readAgentConfig(projectId: string, agentId: string): Record<string, unknown> | null {
  const configs = readAgentsConfig(projectId);
  if (!configs) return null;
  return configs.find(
    (c): c is Record<string, unknown> =>
      !!c && typeof c === 'object' && !Array.isArray(c) && (c as Record<string, unknown>).id === agentId,
  ) ?? null;
}

/**
 * 写入/更新一条 agent config 到 agents.json（整条替换；不存在则追加）。
 * @returns 写入的 entry
 */
export function upsertAgentConfig(
  projectId: string,
  agentId: string,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const filePath = join(projectDir(projectId), 'agents.json');
  const configs: unknown[] = readAgentsConfig(projectId) ?? [];
  const idx = configs.findIndex(
    (c) => !!c && typeof c === 'object' && !Array.isArray(c) && (c as Record<string, unknown>).id === agentId,
  );
  if (idx >= 0) configs[idx] = entry;
  else configs.push(entry);
  writeJsonFile(filePath, configs);
  touchProject(projectId);
  return entry;
}

export interface MiniAppChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  route?: string;
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
  timestamp: string;
}

function chatDir(projectId: string, sessionId: string): string {
  return join(projectDir(projectId), 'chat', sessionId);
}

function safeSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
    throw new Error('Invalid sessionId');
  }
  return sessionId;
}

function safeMessageId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error('Invalid messageId');
  }
  return id;
}

/** 保存一条聊天消息到 chat/{sessionId}/{messageId}.json */
export function saveAgentChat(projectId: string, message: MiniAppChatMessage): void {
  safeSessionId(message.sessionId);
  safeMessageId(message.id);
  const dir = chatDir(projectId, message.sessionId);
  ensureDir(dir);
  writeFileSync(join(dir, `${message.id}.json`), JSON.stringify(message, null, 2), 'utf-8');
}

/** 列出某 session 的全部消息，按 timestamp 升序。 */
export function listAgentChats(projectId: string, sessionId: string): MiniAppChatMessage[] {
  safeSessionId(sessionId);
  const dir = chatDir(projectId, sessionId);
  if (!existsSync(dir)) return [];
  const messages: MiniAppChatMessage[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.json')) continue;
    try {
      const msg = JSON.parse(readFileSync(join(dir, entry.name), 'utf-8'));
      if (msg && typeof msg === 'object' && typeof msg.timestamp === 'string') {
        messages.push(msg as MiniAppChatMessage);
      }
    } catch { /* skip malformed */ }
  }
  messages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return messages;
}
