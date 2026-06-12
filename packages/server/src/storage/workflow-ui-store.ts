import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { readJsonFile, writeJsonFile, ensureDir, getDataDir } from './json-store.js';
import { v4 as uuid } from 'uuid';

export interface WorkflowUiProject {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: 'react' | 'html';
  tags?: string[];
  enabledPlugins?: string[];
  agentConfigId?: string;
  mainFile: string;
  icon?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
  storeUrl?: string;
  storeChecksum?: string;
}

function baseDir(): string {
  return join(getDataDir(), 'workflows-ui');
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
  const manifest = readJsonFile<WorkflowUiProject>(manifestPath(projectId));
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

export function listProjects(): WorkflowUiProject[] {
  // 惰性自愈：每次列出前校验磁盘目录数与索引是否一致，不一致则重建。
  // 这样手动新增 wui_* 文件夹后，下次调用即可被发现。
  const root = baseDir();
  if (existsSync(root)) {
    const dirIds = readdirSync(root, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^wui_/.test(e.name))
      .map(e => e.name)
      .filter(id => existsSync(manifestPath(id)));
    const indexed = readJsonFile<WorkflowUiProject[]>(indexPath()) ?? [];
    const indexedIds = indexed.map(p => p?.id).filter(Boolean);
    const same = dirIds.length === indexedIds.length
      && dirIds.every(id => indexedIds.includes(id));
    if (!same) return rebuildIndex().projects;
  }
  return readJsonFile<WorkflowUiProject[]>(indexPath()) ?? [];
}

/**
 * 扫描 workflows-ui/ 下每个项目目录的 manifest.json，重建 index.json。
 * 用于磁盘上存在项目但 index.json 缺失/损坏时的自愈（手动拷入、文件被删、版本迁移）。
 * 返回（重建前后是否变化, 当前项目列表）。
 */
export function rebuildIndex(): { changed: boolean; projects: WorkflowUiProject[] } {
  const root = baseDir();
  if (!existsSync(root)) return { changed: false, projects: [] };

  const onDisk: WorkflowUiProject[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^wui_/.test(entry.name)) continue;
    const manifest = readJsonFile<WorkflowUiProject>(manifestPath(entry.name));
    if (manifest && manifest.id === entry.name) onDisk.push(manifest);
  }

  // 按 createdAt 稳定排序，避免每次重建顺序抖动
  onDisk.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const indexed = readJsonFile<WorkflowUiProject[]>(indexPath()) ?? [];
  const sameLength = indexed.length === onDisk.length
    && indexed.every((p, i) => p?.id === onDisk[i]?.id);

  if (!sameLength) {
    writeJsonFile(indexPath(), onDisk);
    return { changed: true, projects: onDisk };
  }
  return { changed: false, projects: onDisk };
}

export function getProject(projectId: string): WorkflowUiProject | null {
  return listProjects().find(p => p.id === projectId) ?? null;
}

export function createProject(input: {
  name: string;
  description?: string;
  type: 'react' | 'html';
  tags?: string[];
  mainFile: string;
  files?: Record<string, string>;
}): WorkflowUiProject {
  const id = `wui_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  const project: WorkflowUiProject = {
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

export function updateProject(projectId: string, updates: Partial<Pick<WorkflowUiProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'agentConfigId' | 'mainFile' | 'icon' | 'avatarUrl'>>): WorkflowUiProject {
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

export interface WorkflowUiFileEntry {
  path: string;
  mtimeMs: number;
}

/** Flat file list with mtime, so clients can diff for incremental refresh. */
export function getFileManifest(projectId: string): WorkflowUiFileEntry[] {
  const dir = srcDir(projectId);
  if (!existsSync(dir)) return [];

  const files: WorkflowUiFileEntry[] = [];
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

export function importFromDir(extractDir: string, manifest: Partial<WorkflowUiProject> & { name: string; type: 'react' | 'html'; mainFile: string }): WorkflowUiProject {
  const id = `wui_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  const project: WorkflowUiProject = {
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
  if (existsSync(join(extractDir, 'src'))) {
    copyDirSync(join(extractDir, 'src'), targetSrc);
  } else {
    copyDirSync(extractDir, targetSrc);
  }

  const projects = listProjects();
  projects.push(project);
  writeJsonFile(indexPath(), projects);

  return project;
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
