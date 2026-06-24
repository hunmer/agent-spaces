// packages/server/src/storage/workflow-store.ts
// Per-workflow directory storage: supports versions, execution logs, plugin configs.
// Legacy flat-file workflows are auto-migrated on first access.

import type { Workflow, WorkflowFolder } from '@agent-spaces/shared';
import { ensureDir, readJsonFile, writeJsonFile, deleteFile, getDataDir } from './json-store.js';
import { existsSync, readdirSync, rmSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';

// ---- Path helpers ----

export function workflowsDir() {
  return path.join(getDataDir(), 'workflows');
}

function workflowDir(workflowId: string) {
  return path.join(workflowsDir(), workflowId);
}

function workflowPath(workflowId: string) {
  return path.join(workflowDir(workflowId), 'workflow.json');
}

function workflowIndexPath() {
  return path.join(workflowsDir(), 'index.json');
}

function versionsDir(workflowId: string) {
  return path.join(workflowDir(workflowId), 'versions');
}

function executionHistoryDir(workflowId: string) {
  return path.join(workflowDir(workflowId), 'execution_history');
}

function pluginConfigsDir(workflowId: string) {
  return path.join(workflowDir(workflowId), 'plugin_configs');
}

function pluginSchemePath(workflowId: string, pluginId: string, schemeName: string) {
  return path.join(pluginConfigsDir(workflowId), pluginId, `${schemeName}.json`);
}

function workflowFoldersPath() {
  return path.join(workflowsDir(), 'folders.json');
}

function stagingPath(workflowId: string) {
  return path.join(workflowDir(workflowId), 'staging.json');
}

function operationHistoryPath(workflowId: string) {
  return path.join(workflowDir(workflowId), 'operation_history.json');
}

function chatPath(workflowId: string) {
  return path.join(workflowDir(workflowId), 'chat.json');
}

// ---- Legacy migration ----

function legacyWorkflowPath(workflowId: string) {
  return path.join(workflowsDir(), `${workflowId}.json`);
}

function migrateFromLegacyFormat(): void {
  const dir = workflowsDir();
  if (!existsSync(dir)) return;

  // Read legacy index
  const indexPath = workflowIndexPath();
  const legacyIndex = readJsonFile<{ id: string }[]>(indexPath);
  if (!Array.isArray(legacyIndex) || legacyIndex.length === 0) return;

  // Check if already migrated (has per-workflow dirs)
  const entries = readdirSync(dir, { withFileTypes: true });
  const hasWorkflowDirs = entries.some(e => e.isDirectory() && existsSync(path.join(dir, e.name, 'workflow.json')));
  if (hasWorkflowDirs) return;

  // Migrate each legacy workflow
  for (const entry of legacyIndex) {
    const legacyFile = legacyWorkflowPath(entry.id);
    if (!existsSync(legacyFile)) continue;

    try {
      const raw = JSON.parse(readFileSync(legacyFile, 'utf-8'));
      const migrated = migrateLegacyWorkflow(raw);
      ensureDir(workflowDir(migrated.id));
      writeJsonFile(workflowPath(migrated.id), migrated);
      unlinkSync(legacyFile);
    } catch {
      // Skip broken files
    }
  }

  // Remove legacy index
  unlinkSync(indexPath);
}

function migrateLegacyWorkflow(raw: any): Workflow {
  return {
    id: raw.id,
    name: raw.name,
    folderId: raw.folderId ?? null,
    description: raw.description,
    nodes: Array.isArray(raw.nodes) ? raw.nodes.map(migrateLegacyNode) : [],
    edges: Array.isArray(raw.edges) ? raw.edges.map(migrateLegacyEdge) : [],
    createdAt: typeof raw.createdAt === 'string' ? Date.parse(raw.createdAt) : (raw.createdAt || Date.now()),
    updatedAt: typeof raw.updatedAt === 'string' ? Date.parse(raw.updatedAt) : (raw.updatedAt || Date.now()),
  };
}

function migrateLegacyNode(node: any): any {
  return {
    id: node.id,
    type: node.type || 'agent',
    label: node.data?.label || node.label || '',
    position: node.position || { x: 0, y: 0 },
    data: { ...node.data },
  };
}

function migrateLegacyEdge(edge: any): any {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  };
}

// ---- CRUD ----

export function listWorkflows(folderId?: string | null): Workflow[] {
  migrateFromLegacyFormat();
  const items = readAllWorkflowFiles();
  if (folderId !== undefined) return items.filter(w => w.folderId === folderId);
  return items;
}

export function getWorkflow(workflowId: string): Workflow | null {
  migrateFromLegacyFormat();
  return readWorkflowFile(workflowId);
}

export function createWorkflow(workflow: Workflow): void {
  ensureDir(workflowDir(workflow.id));
  writeJsonFile(workflowPath(workflow.id), workflow);
}

export function updateWorkflow(workflow: Workflow): void {
  ensureDir(workflowDir(workflow.id));
  writeJsonFile(workflowPath(workflow.id), workflow);
}

export function deleteWorkflow(workflowId: string): void {
  const dir = workflowDir(workflowId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  // Also clean up legacy flat file if it exists
  const legacy = legacyWorkflowPath(workflowId);
  if (existsSync(legacy)) unlinkSync(legacy);
}

// ---- Folders ----

export function listWorkflowFolders(): WorkflowFolder[] {
  const data = readJsonFile<{ folders: WorkflowFolder[] }>(workflowFoldersPath());
  const folders = data?.folders ?? [];
  return [...folders].sort((a, b) => a.order - b.order);
}

export function createWorkflowFolder(folder: WorkflowFolder): void {
  const folders = listWorkflowFolders();
  folders.push(folder);
  writeJsonFile(workflowFoldersPath(), { folders });
}

export function updateWorkflowFolder(id: string, updates: Partial<Omit<WorkflowFolder, 'id'>>): void {
  const folders = listWorkflowFolders();
  const idx = folders.findIndex(f => f.id === id);
  if (idx === -1) throw new Error(`Folder ${id} not found`);
  folders[idx] = { ...folders[idx], ...updates };
  writeJsonFile(workflowFoldersPath(), { folders });
}

export function deleteWorkflowFolder(id: string): void {
  const folders = listWorkflowFolders();
  const childIds = collectChildFolderIds(folders, id);
  const idsToDelete = new Set([id, ...childIds]);
  const remaining = folders.filter(f => !idsToDelete.has(f.id));
  writeJsonFile(workflowFoldersPath(), { folders: remaining });
  // Delete workflows in removed folders
  const workflows = readAllWorkflowFiles().filter(w => idsToDelete.has(w.folderId ?? ''));
  for (const wf of workflows) deleteWorkflow(wf.id);
}

// ---- Versions ----

const MAX_VERSIONS = 100;

export function listVersions(workflowId: string) {
  const dir = versionsDir(workflowId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(path.join(dir, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.createdAt - a.createdAt);
}

export function addVersion(workflowId: string, version: { id: string; workflowId: string; name: string; snapshot: { nodes: any[]; edges: any[] }; createdAt: number }) {
  const dir = versionsDir(workflowId);
  ensureDir(dir);
  writeJsonFile(path.join(dir, `${version.id}.json`), version);
  // Enforce limit
  const versions = listVersions(workflowId);
  if (versions.length > MAX_VERSIONS) {
    versions.slice(MAX_VERSIONS).forEach((v: any) => {
      const p = path.join(dir, `${v.id}.json`);
      if (existsSync(p)) unlinkSync(p);
    });
  }
  return version;
}

export function getVersion(workflowId: string, versionId: string) {
  const file = path.join(versionsDir(workflowId), `${versionId}.json`);
  return readJsonFile(file);
}

export function deleteVersion(workflowId: string, versionId: string) {
  const file = path.join(versionsDir(workflowId), `${versionId}.json`);
  if (existsSync(file)) unlinkSync(file);
}

export function clearVersions(workflowId: string) {
  const dir = versionsDir(workflowId);
  if (!existsSync(dir)) return;
  readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => unlinkSync(path.join(dir, f)));
}

// ---- Execution Logs ----

const MAX_LOGS = 100;

export function listExecutionLogs(workflowId: string) {
  const dir = executionHistoryDir(workflowId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const p = path.join(dir, f);
      try {
        return { log: JSON.parse(readFileSync(p, 'utf-8')), mtime: statSync(p).mtimeMs };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.mtime - a.mtime)
    .map((item: any) => item.log);
}

export function addExecutionLog(workflowId: string, log: any) {
  const dir = executionHistoryDir(workflowId);
  ensureDir(dir);
  writeJsonFile(path.join(dir, `${log.id}.json`), log);
  // Enforce limit
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length > MAX_LOGS) {
    files.map(f => ({ f, mtime: statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(MAX_LOGS)
      .forEach(item => { try { unlinkSync(path.join(dir, item.f)); } catch { /* ignore */ } });
  }
  return log;
}

export function listAllExecutionLogs(limit = 50) {
  const dir = workflowsDir();
  if (!existsSync(dir)) return [];
  const results: any[] = [];
  const wDirs = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const wDir of wDirs) {
    const wId = wDir.name;
    const historyDir = executionHistoryDir(wId);
    if (!existsSync(historyDir)) continue;
    // Read workflow name for display
    let workflowName = wId;
    const wfPath = workflowPath(wId);
    if (existsSync(wfPath)) {
      try { workflowName = JSON.parse(readFileSync(wfPath, 'utf-8')).name || wId; } catch { /* ignore */ }
    }
    readdirSync(historyDir)
      .filter(f => f.endsWith('.json'))
      .forEach(f => {
        try {
          const log = JSON.parse(readFileSync(path.join(historyDir, f), 'utf-8'));
          results.push({ ...log, workflowName });
        } catch { /* ignore */ }
      });
  }
  return results
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, limit);
}

export function getExecutionLog(workflowId: string, logId: string) {
  return readJsonFile(path.join(executionHistoryDir(workflowId), `${logId}.json`));
}

export function getExecutionLogPath(workflowId: string, logId: string) {
  return path.join(executionHistoryDir(workflowId), `${logId}.json`);
}

export function getWorkflowPath(workflowId: string) {
  return workflowPath(workflowId);
}

export function deleteExecutionLog(workflowId: string, logId: string) {
  const file = path.join(executionHistoryDir(workflowId), `${logId}.json`);
  if (existsSync(file)) unlinkSync(file);
}

export function clearExecutionLogs(workflowId: string) {
  const dir = executionHistoryDir(workflowId);
  if (!existsSync(dir)) return;
  readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => unlinkSync(path.join(dir, f)));
}

// ---- Staging ----

export function loadStaging(workflowId: string): any[] {
  return readJsonFile<any[]>(stagingPath(workflowId)) ?? [];
}

export function saveStaging(workflowId: string, nodes: any[]) {
  ensureDir(workflowDir(workflowId));
  writeJsonFile(stagingPath(workflowId), nodes);
}

export function clearStaging(workflowId: string) {
  const file = stagingPath(workflowId);
  if (existsSync(file)) unlinkSync(file);
}

// ---- Operation History ----

export function loadOperationHistory(workflowId: string): any[] {
  return readJsonFile<any[]>(operationHistoryPath(workflowId)) ?? [];
}

export function saveOperationHistory(workflowId: string, entries: any[]) {
  ensureDir(workflowDir(workflowId));
  writeJsonFile(operationHistoryPath(workflowId), entries);
}

export function clearOperationHistory(workflowId: string) {
  const file = operationHistoryPath(workflowId);
  if (existsSync(file)) unlinkSync(file);
}

// ---- Workflow Agent Chat ----

export function loadChat(workflowId: string): any[] {
  return readJsonFile<any[]>(chatPath(workflowId)) ?? [];
}

export function saveChat(workflowId: string, messages: any[]) {
  ensureDir(workflowDir(workflowId));
  writeJsonFile(chatPath(workflowId), messages);
}

export function clearChat(workflowId: string) {
  const file = chatPath(workflowId);
  if (existsSync(file)) unlinkSync(file);
}

// ---- Plugin Schemes ----

export function listPluginSchemes(workflowId: string, pluginId: string): string[] {
  const dir = path.join(pluginConfigsDir(workflowId), pluginId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
}

export function readPluginScheme(workflowId: string, pluginId: string, schemeName: string): Record<string, string> {
  const file = pluginSchemePath(workflowId, pluginId, schemeName);
  if (!existsSync(file)) throw new Error(`Plugin scheme ${schemeName} not found`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>) {
  const dir = path.join(pluginConfigsDir(workflowId), pluginId);
  ensureDir(dir);
  writeJsonFile(pluginSchemePath(workflowId, pluginId, schemeName), data);
}

export function deletePluginScheme(workflowId: string, pluginId: string, schemeName: string) {
  const file = pluginSchemePath(workflowId, pluginId, schemeName);
  if (existsSync(file)) unlinkSync(file);
}

// ---- Internal helpers ----

function readAllWorkflowFiles(): Workflow[] {
  const dir = workflowsDir();
  if (!existsSync(dir)) return [];
  const items: Workflow[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, 'workflow.json');
    if (!existsSync(file)) continue;
    try { items.push(JSON.parse(readFileSync(file, 'utf-8'))); }
    catch { /* skip broken */ }
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

function readWorkflowFile(workflowId: string): Workflow | null {
  const file = workflowPath(workflowId);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return null; }
}

function collectChildFolderIds(folders: WorkflowFolder[], parentId: string): string[] {
  const children = folders.filter(f => f.parentId === parentId);
  return children.reduce<string[]>((acc, child) => [...acc, child.id, ...collectChildFolderIds(folders, child.id)], []);
}

// Need statSync for execution log sorting
import { statSync } from 'node:fs';
