import { existsSync, mkdirSync, writeFileSync, createWriteStream, rmSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import yauzl from 'yauzl';
import { v4 as uuid } from 'uuid';
import * as store from '../storage/mini-app-store.js';
import type { MiniAppProject } from '../storage/mini-app-store.js';
import { unloadServices } from './mini-app-services.js';
import { executeDb as dbExecuteDb, executeDbTransaction as dbExecuteDbTransaction, closeProjectDbs } from '../storage/mini-app-db.js';

export { store };
export type { MiniAppProject };

// ---- CRUD ----

export function listProjects(): MiniAppProject[] {
  return store.listProjects();
}

export function getProject(projectId: string): MiniAppProject {
  const project = store.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

export function createProject(input: {
  name: string;
  description?: string;
  type: 'react' | 'html';
  tags?: string[];
}): MiniAppProject {
  const mainFile = input.type === 'react' ? 'index.jsx' : 'index.html';
  const claudeMd = `# ${input.name}

> This file is auto-generated. Keep it up-to-date as the project evolves.

## Project Overview

<!-- Describe what this project does, its purpose and main features. -->

## File Structure

<!-- Keep this in sync with the actual files. Example:
- \`index.jsx\` — Entry point, main layout
- \`components/Header.jsx\` — Header component
- \`hooks/useData.js\` — Data fetching hook
- \`utils/api.js\` — API helpers
-->

## Key Design Decisions

<!-- Record important decisions, patterns, and constraints here. -->

## Dependencies

<!-- External resources, plugins, or API integrations used. -->

## Notes

<!-- Anything future-you or the Agent should know before editing. -->
`;

  const defaultFiles: Record<string, string> = input.type === 'react'
    ? {
        'index.jsx': `const { Button, Card, CardContent } = window.AgentSpacesUI;

function App() {
  return (
    <Card>
      <CardContent>
        <Button>Hello World</Button>
      </CardContent>
    </Card>
  );
}

export default App;
`,
        'CLAUDE.md': claudeMd,
      }
    : {
        'index.html': `<!DOCTYPE html>
<html>
<head><title>${input.name}</title></head>
<body>
  <h1>Hello World</h1>
  <script>
    console.log('loaded');
  </script>
</body>
</html>`,
        'CLAUDE.md': claudeMd,
      };

  return store.createProject({
    ...input,
    mainFile,
    files: defaultFiles,
  });
}

export function updateProject(
  projectId: string,
  updates: Partial<Pick<MiniAppProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'agentConfigId' | 'mainFile' | 'icon' | 'avatarUrl' | 'backgroundUrl'>>,
): MiniAppProject {
  return store.updateProject(projectId, updates);
}

export function deleteProject(projectId: string): void {
  closeProjectDbs(projectId);
  store.deleteProject(projectId);
  unloadServices(projectId);
}

// ---- Files ----

export function getFileTree(projectId: string): string[] {
  return store.getFileTree(projectId);
}

export function getFileManifest(projectId: string) {
  return store.getFileManifest(projectId);
}

export function readFile(projectId: string, filePath: string): string {
  const content = store.readFile(projectId, filePath);
  if (content === null) throw new Error(`File not found: ${filePath}`);
  return content;
}

export function writeFile(projectId: string, filePath: string, content: string): void {
  store.writeFile(projectId, filePath, content);
}

export function writeBinaryFile(projectId: string, filePath: string, buffer: Buffer): number {
  return store.writeBinaryFile(projectId, filePath, buffer);
}

export function deleteFile(projectId: string, filePath: string): void {
  store.deleteFile(projectId, filePath);
}

export function renameFile(projectId: string, fromPath: string, toPath: string): void {
  store.renameFile(projectId, fromPath, toPath);
}

export function createFolder(projectId: string, dirPath: string): void {
  store.createFolder(projectId, dirPath);
}

export function readConfig(projectId: string, filePath: string): unknown | null {
  return store.readConfig(projectId, filePath);
}

export function writeConfig(projectId: string, filePath: string, value: unknown): void {
  store.writeConfig(projectId, filePath, value);
}

export function listConfigs(projectId: string): Record<string, unknown> {
  return store.listConfigs(projectId);
}

export function writeDataFile(projectId: string, filePath: string, content: Buffer | string): number {
  return store.writeDataFile(projectId, filePath, content);
}

// ---- DB (SQLite via better-sqlite3) ----
export function executeDb(
  projectId: string,
  dbName: string,
  mode: 'all' | 'get' | 'run' | 'exec',
  sql: string,
  params?: unknown[] | Record<string, unknown>,
): unknown {
  const result = dbExecuteDb(projectId, dbName, mode, sql, params);
  store.touchProject(projectId);
  return result;
}

export function executeDbTransaction(
  projectId: string,
  dbName: string,
  statements: { sql: string; params?: unknown[] | Record<string, unknown> }[],
): void {
  dbExecuteDbTransaction(projectId, dbName, statements);
  store.touchProject(projectId);
}

// ---- ZIP Export ----

export async function exportZip(projectId: string): Promise<Buffer> {
  const project = store.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const archiver = (await import('archiver')).default;
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  // Add manifest (strip internal fields)
  const { id, createdAt, updatedAt, ...manifest } = project;
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  // Add source files
  for (const filePath of store.getFileTree(projectId)) {
    const content = store.readFile(projectId, filePath);
    if (content !== null) {
      archive.append(content, { name: `src/${filePath}` });
    }
  }

  // Add icon file if exists
  if (manifest.icon) {
    const iconPath = join(store.getProjectDir(projectId), manifest.icon);
    if (existsSync(iconPath)) {
      archive.file(iconPath, { name: manifest.icon });
    }
  }

  // Add avatar file if exists
  if (manifest.avatarUrl) {
    const avatarPath = join(store.getProjectDir(projectId), manifest.avatarUrl);
    if (existsSync(avatarPath)) {
      archive.file(avatarPath, { name: manifest.avatarUrl });
    }
  }

  await archive.finalize();
  return Buffer.concat(chunks);
}

// ---- ZIP Import ----

export async function importZip(
  zipBuffer: Buffer,
  manifest: { name?: string; type?: 'react' | 'html'; description?: string; id?: string; storeUrl?: string; storeChecksum?: string },
): Promise<MiniAppProject> {
  const extractDir = join(tmpdir(), `wui-import-${uuid()}`);
  mkdirSync(extractDir, { recursive: true });

  try {
    const zipPath = join(extractDir, 'upload.zip');
    writeFileSync(zipPath, zipBuffer);

    // Extract using yauzl (cross-platform, no PowerShell)
    await extractZip(zipPath, join(extractDir, 'content'));

    // Find manifest
    const contentDir = join(extractDir, 'content');
    const manifestFile = findFile(contentDir, 'manifest.json') ?? findFile(contentDir, 'plugin.json');

    let projectManifest: Record<string, any> = {};
    if (manifestFile) {
      try {
        projectManifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
      } catch { /* ignore invalid manifest */ }
    }

    // Determine type
    const type =
      manifest.type ??
      projectManifest.type ??
      (findFile(contentDir, 'index.jsx') || findFile(contentDir, 'index.tsx') ? 'react' : 'html');
    const mainFile = type === 'react' ? 'index.jsx' : 'index.html';
    const name = manifest.name ?? projectManifest.name ?? 'Imported Project';

    // Source directory: prefer src/ subdirectory
    const srcBase = existsSync(join(contentDir, 'src')) ? join(contentDir, 'src') : contentDir;

    const project = store.importFromDir(srcBase, {
      name,
      type: type as 'react' | 'html',
      description: manifest.description ?? projectManifest.description,
      mainFile,
      tags: projectManifest.tags,
      enabledPlugins: projectManifest.enabledPlugins,
      icon: projectManifest.icon,
      avatarUrl: projectManifest.avatarUrl,
      // 商店导入：传稳定 id / storeUrl / storeChecksum，使服务端按 id 关联已安装项（新建或更新）
      id: manifest.id,
      storeUrl: manifest.storeUrl,
      storeChecksum: manifest.storeChecksum,
    });

    // Copy icon file if present
    if (projectManifest.icon && typeof projectManifest.icon === 'string') {
      const iconSrc = join(contentDir, projectManifest.icon);
      if (existsSync(iconSrc)) {
        copyFileSync(iconSrc, join(store.getProjectDir(project.id), projectManifest.icon));
      }
    }

    // Copy avatar file if present
    if (projectManifest.avatarUrl && typeof projectManifest.avatarUrl === 'string') {
      const avatarSrc = join(contentDir, projectManifest.avatarUrl);
      if (existsSync(avatarSrc)) {
        copyFileSync(avatarSrc, join(store.getProjectDir(project.id), projectManifest.avatarUrl));
      }
    }

    return project;
  } finally {
    try { rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function findFile(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === name) return join(dir, name);
    if (entry.isDirectory()) {
      const found = findFile(join(dir, entry.name), name);
      if (found) return found;
    }
  }
  return null;
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(destDir, { recursive: true });
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error('Failed to open zip'));

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        // Validate path safety
        const entryPath = entry.fileName;
        if (entryPath.includes('..') || entryPath.startsWith('/') || /^[a-zA-Z]:/.test(entryPath)) {
          zipfile.readEntry();
          return;
        }

        const fullPath = join(destDir, entryPath);

        if (/\/$/.test(entryPath)) {
          // Directory entry
          mkdirSync(fullPath, { recursive: true });
          zipfile.readEntry();
        } else {
          // File entry
          mkdirSync(dirname(fullPath), { recursive: true });
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            const writeStream = createWriteStream(fullPath);
            writeStream.on('close', () => zipfile.readEntry());
            writeStream.on('error', reject);
            readStream.on('error', reject);
            readStream.pipe(writeStream);
          });
        }
      });

      zipfile.on('end', resolve);
      zipfile.on('error', reject);
    });
  });
}
