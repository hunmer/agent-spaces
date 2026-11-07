import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { getWorkspace } from '../storage/workspace-store.js';

export const DEFAULT_WORKSPACE_PROMPT = '结果使用中文回复';

function getWorkspacePromptPath(workspaceId: string): string {
  return join(getDataDir(), 'workspaces', workspaceId, 'prompt.md');
}

export function readWorkspacePrompt(workspaceId: string): string {
  if (!getWorkspace(workspaceId)) return DEFAULT_WORKSPACE_PROMPT;

  const promptPath = getWorkspacePromptPath(workspaceId);
  if (!existsSync(promptPath)) return DEFAULT_WORKSPACE_PROMPT;

  return readFileSync(promptPath, 'utf-8');
}

export function writeWorkspacePrompt(workspaceId: string, prompt: string): string | null {
  if (!getWorkspace(workspaceId)) return null;

  const promptPath = getWorkspacePromptPath(workspaceId);
  ensureDir(join(getDataDir(), 'workspaces', workspaceId));
  writeFileSync(promptPath, prompt, 'utf-8');
  return prompt;
}
