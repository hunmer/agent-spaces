import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import type { HookConfig } from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile, deleteFile } from './json-store.js';

function workspaceDir(id: string) {
  return join(getDataDir(), 'workspaces', id);
}

function hooksDir(wsId: string) {
  return join(workspaceDir(wsId), 'hooks');
}

function hookPath(wsId: string, name: string) {
  return join(hooksDir(wsId), `${name}.hook.json`);
}

export function listHooks(wsId: string): HookConfig[] {
  const dir = hooksDir(wsId);
  try {
    const files = readdirSync(dir);
    return files
      .filter(f => f.endsWith('.hook.json'))
      .map(f => readJsonFile<HookConfig>(join(dir, f)))
      .filter((h): h is HookConfig => h !== null);
  } catch {
    return [];
  }
}

export function getHook(wsId: string, name: string): HookConfig | null {
  return readJsonFile<HookConfig>(hookPath(wsId, name));
}

export function saveHook(wsId: string, config: HookConfig): void {
  ensureDir(hooksDir(wsId));
  writeJsonFile(hookPath(wsId, config.name), config);
}

export function deleteHook(wsId: string, name: string): void {
  deleteFile(hookPath(wsId, name));
}

export function uploadHook(wsId: string, jsonString: string): HookConfig {
  const parsed = JSON.parse(jsonString);
  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('Hook must have a "name" string field');
  }
  if (!parsed.hooks || typeof parsed.hooks !== 'object') {
    parsed.hooks = { PreToolUse: [], PostToolUse: [] };
  }
  if (parsed.enabled === undefined) parsed.enabled = true;
  saveHook(wsId, parsed as HookConfig);
  return parsed as HookConfig;
}

export function applyToWorkspace(sourceWsId: string, name: string, targetWsId: string): void {
  const config = getHook(sourceWsId, name);
  if (!config) throw new Error(`Hook "${name}" not found in workspace ${sourceWsId}`);
  saveHook(targetWsId, config);
}
