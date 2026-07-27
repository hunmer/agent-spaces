import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { readJsonFile, writeJsonFile, ensureDir, getDataDir } from './json-store.js';

export interface MiniAppProject {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: 'react' | 'html';
  tags?: string[];
  extensions?: 'workspace'[];
  enabledPlugins?: string[];
  agentPermissions?: string[];
  agentConfigId?: string;
  enableAgents?: boolean;
  /** agents.json 的种子配置：服务器启动时若 agents.json 不存在，则用它落地初始化。 */
  agents?: unknown[];
  mainFile: string;
  /** 支持的设备类型，如 ['mobile', 'ipad', 'pc'] */
  devices?: string[];
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

/**
 * 解析并校验项目 src 目录下的文件绝对路径（防穿越）。
 * 供路由层以正确 MIME 流式返回 src 下的静态资源（js/css/字体等）。
 */
export function resolveSrcPath(projectId: string, filePath: string): string {
  return safeSrcPath(projectId, filePath);
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
    const manifest = readJsonFile<MiniAppProject>(manifestPath(entry.name));
    if (manifest && manifest.id === entry.name) onDisk.push(manifest);
  }

  onDisk.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  writeJsonFile(indexPath(), onDisk);
  return onDisk;
}

/** name 与已有项目重复时抛出。route 层用 instanceof 判别并返回 409。 */
export class DuplicateNameError extends Error {
  constructor(public readonly duplicateName: string) {
    super(`Mini app name already exists: ${duplicateName}`);
    this.name = 'DuplicateNameError';
  }
}

/**
 * 校验 name 在全局唯一（trim 后精确匹配、大小写敏感）。
 * @param excludeId 更新场景排除自身，避免未改名误报。
 */
function assertNameUnique(name: string, excludeId?: string): void {
  const target = name.trim();
  const conflict = listProjects().find(
    (p) => p.id !== excludeId && p.name.trim() === target,
  );
  if (conflict) throw new DuplicateNameError(name);
}

/**
 * 把 name 转成可同时用作目录名与 URL path 的 id：替换文件系统/URL 非法字符
 * （\ / : * ? " < > |、控制字符、空白）为 _，去除首尾 -_. 。保留中文等可读
 * 字符（URL 中非 ASCII 由 fetch 自动 percent-encode）。结果为空则抛错。
 *
 * 注：id 仅在创建时取 name，之后固定；改名只更新 manifest.name，不改 id/目录。
 */
function safeNameId(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  if (!cleaned) throw new Error('Invalid project name: results in empty id');
  return cleaned;
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
  assertNameUnique(input.name);
  const id = safeNameId(input.name);
  if (existsSync(projectDir(id))) throw new DuplicateNameError(input.name);
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

export function updateProject(projectId: string, updates: Partial<Pick<MiniAppProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'agentPermissions' | 'agentConfigId' | 'enableAgents' | 'mainFile' | 'icon' | 'avatarUrl' | 'backgroundUrl' | 'devices'>>): MiniAppProject {
  if (updates.name !== undefined) assertNameUnique(updates.name, projectId);
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

// 读取 data 目录下的文件为 Buffer（缩略图生成、本地资源访问等用）。
export function readDataFile(projectId: string, filePath: string): Buffer | null {
  const fullPath = safeProjectSubdirPath(projectId, 'data', filePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
}

// 解析 data 目录下文件的绝对路径（不要求存在），供需要 fs 路径的调用方使用。
export function resolveDataPath(projectId: string, filePath: string): string {
  return safeProjectSubdirPath(projectId, 'data', filePath);
}

// ---- ZIP Import ----

export function importFromDir(extractDir: string, manifest: Partial<MiniAppProject> & { name: string; type: 'react' | 'html'; mainFile: string }): MiniAppProject {
  // id：优先用调用方传入的稳定 id（商店模板 id），否则从 name 生成。创建后固定不变。
  // 这样商店模板可按 id 判断「已安装」、按 updatedAt 判断「有更新」。
  let id: string;
  try {
    id = manifest.id ? safeNameId(manifest.id) : safeNameId(manifest.name);
  } catch {
    // 名称清洗后为空（如纯符号/全下划线的文件名），回退到带时间戳的默认 id，避免导入直接失败
    id = `imported-${Date.now()}`;
  }
  const contentRoot = resolveContentRoot(extractDir, manifest.mainFile);
  const existing = getProject(id);

  if (existing) {
    // ---- 更新模式：覆盖源码，保留用户配置字段，刷新 updatedAt ----
    // 仅模板内容相关字段（type/mainFile/icon/storeUrl/storeChecksum）跟随新版本；
    // name/description/tags/enabledPlugins/agentConfigId/agents/avatarUrl/backgroundUrl/version 等用户配置保留。
    const updated: MiniAppProject = {
      ...existing,
      type: manifest.type ?? existing.type,
      mainFile: manifest.mainFile ?? existing.mainFile,
      icon: manifest.icon ?? existing.icon,
      agentPermissions: manifest.agentPermissions ?? existing.agentPermissions,
      storeUrl: manifest.storeUrl ?? existing.storeUrl,
      storeChecksum: manifest.storeChecksum ?? existing.storeChecksum,
      updatedAt: new Date().toISOString(),
    };

    // 全量覆盖 src —— 商店版本即最新全集
    const targetSrc = srcDir(id);
    rmSync(targetSrc, { recursive: true, force: true });
    ensureDir(targetSrc);
    if (existsSync(join(contentRoot, 'src'))) {
      copyDirSync(join(contentRoot, 'src'), targetSrc);
    } else {
      copyDirSync(contentRoot, targetSrc);
    }

    writeJsonFile(manifestPath(id), updated);
    const projects = listProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx !== -1) projects[idx] = updated;
    else projects.push(updated);
    writeJsonFile(indexPath(), projects);
    return updated;
  }

  // ---- 新建模式 ----
  assertNameUnique(manifest.name);
  const now = new Date().toISOString();
  const project: MiniAppProject = {
    id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version ?? '1.0.0',
    type: manifest.type,
    tags: manifest.tags ?? [],
    enabledPlugins: manifest.enabledPlugins,
    agentPermissions: manifest.agentPermissions,
    agentConfigId: manifest.agentConfigId,
    agents: manifest.agents,
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

/** agents.json 是否已在磁盘上存在（不解析内容，仅判存在，避免把损坏文件误判为「缺失」）。 */
export function agentsConfigExists(projectId: string): boolean {
  return existsSync(join(projectDir(projectId), 'agents.json'));
}

/**
 * 整体覆盖写入项目 agents.json。用于服务器启动时从 manifest.agents 种子首次落地。
 * 不触碰 manifest 的 updatedAt —— 这是后台初始化，不应污染项目的「最近编辑」时间戳。
 */
export function writeAgentsConfig(projectId: string, configs: unknown[]): void {
  writeJsonFile(join(projectDir(projectId), 'agents.json'), configs);
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
  const storedEntry = toStoredAgentConfig(entry);
  const idx = configs.findIndex(
    (c) => !!c && typeof c === 'object' && !Array.isArray(c) && (c as Record<string, unknown>).id === agentId,
  );
  if (idx >= 0) configs[idx] = storedEntry;
  else configs.push(storedEntry);
  writeJsonFile(filePath, configs);
  touchProject(projectId);
  return storedEntry;
}

function toStoredAgentConfig(entry: Record<string, unknown>): Record<string, unknown> {
  const { apiKey: _apiKey, apiBase: _apiBase, baseURL: _baseURL, ...stored } = entry;
  void _apiKey;
  void _apiBase;
  void _baseURL;
  return stored;
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
  // 按 timestamp 升序；时间戳相同（同毫秒落盘的 user/agent 对）时以 role 兜底，
  // 保证 user 排在 agent 之前，避免重载后历史消息顺序错乱。
  messages.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
    if (a.role !== b.role) return a.role === 'user' ? -1 : 1;
    return 0;
  });
  return messages;
}

/** 清空某 session 的聊天消息。提供 agentId 时仅删该 agent 的消息，否则删整个 session。 */
export function clearAgentChats(projectId: string, sessionId: string, agentId?: string): void {
  safeSessionId(sessionId);
  const dir = chatDir(projectId, sessionId);
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.json')) continue;
    const file = join(dir, entry.name);
    if (agentId) {
      try {
        const msg = JSON.parse(readFileSync(file, 'utf-8'));
        if (!msg || typeof msg !== 'object' || (msg as MiniAppChatMessage).agentId !== agentId) continue;
      } catch { continue; }
    }
    rmSync(file, { force: true });
  }
}
