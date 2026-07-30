import type { WorkflowTemplate } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';

const CONFIG_DIR = 'workflow-configs';
const INDEX_PATH = `${CONFIG_DIR}/index.json`;

export type MiniAppWorkflowPluginConfig = string | Record<string, unknown>;

export interface MiniAppWorkflowConfig {
  workflowId: string;
  workflowName: string;
  pluginConfigs: Record<string, MiniAppWorkflowPluginConfig>;
}

interface MiniAppWorkflowConfigIndex {
  workflowIds: string[];
}

export function miniAppWorkflowConfigPath(workflowId: string): string {
  return `${CONFIG_DIR}/${encodeURIComponent(workflowId)}.json`;
}

async function readJson<T>(projectId: string, filePath: string): Promise<T | null> {
  try {
    const { content } = await sdk.miniApp.readDataFile(projectId, filePath);
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJson(projectId: string, filePath: string, value: unknown): Promise<void> {
  await sdk.miniApp.writeDataFile(projectId, filePath, JSON.stringify(value, null, 2));
}

export async function readMiniAppWorkflowConfig(
  projectId: string,
  workflowId: string,
): Promise<MiniAppWorkflowConfig | null> {
  return readJson<MiniAppWorkflowConfig>(projectId, miniAppWorkflowConfigPath(workflowId));
}

export async function writeMiniAppWorkflowConfig(
  projectId: string,
  config: MiniAppWorkflowConfig,
): Promise<void> {
  await writeJson(projectId, miniAppWorkflowConfigPath(config.workflowId), config);
  const index = await readJson<MiniAppWorkflowConfigIndex>(projectId, INDEX_PATH) ?? { workflowIds: [] };
  if (!index.workflowIds.includes(config.workflowId)) {
    index.workflowIds.push(config.workflowId);
    await writeJson(projectId, INDEX_PATH, index);
  }
}

export async function ensureMiniAppWorkflowConfig(
  projectId: string,
  workflow: Pick<WorkflowTemplate, 'id' | 'name'>,
): Promise<MiniAppWorkflowConfig> {
  const existing = await readMiniAppWorkflowConfig(projectId, workflow.id);
  const config: MiniAppWorkflowConfig = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    pluginConfigs: existing?.pluginConfigs ?? {},
  };
  await writeMiniAppWorkflowConfig(projectId, config);
  return config;
}

export async function listMiniAppWorkflowConfigs(projectId: string): Promise<MiniAppWorkflowConfig[]> {
  const index = await readJson<MiniAppWorkflowConfigIndex>(projectId, INDEX_PATH);
  if (!index?.workflowIds?.length) return [];
  const configs = await Promise.all(index.workflowIds.map(id => readMiniAppWorkflowConfig(projectId, id)));
  return configs.filter((config): config is MiniAppWorkflowConfig => Boolean(config));
}
