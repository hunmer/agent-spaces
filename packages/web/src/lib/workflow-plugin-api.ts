'use client';

import type { NodeTypeDefinition, PluginConfigField, PluginMeta } from '@agent-spaces/shared';
import { sdk } from './sdk';
import { fetchWithAuth } from './auth';

export type WorkflowPlugin = PluginMeta & {
  config?: PluginConfigField[];
};

export type WorkflowPluginTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  outputs: unknown[];
};

export type StoreWorkflowPlugin = Omit<WorkflowPlugin, 'enabled'> & {
  path: string;
  iconUrl?: string;
  updatedAt?: string;
  /** 插件目录下实际存在的文件清单（相对路径），安装时按清单逐个下载 */
  files?: string[];
};

const LOCALE_STORAGE_KEY = 'agent-spaces-locale';

function getPluginLocaleQuery(): string {
  if (typeof window === 'undefined') return '';
  const locale = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (locale !== 'en' && locale !== 'zh') return '';
  return `?locale=${encodeURIComponent(locale)}`;
}

const pendingWorkflowPluginList = new Map<string, Promise<PluginMeta[]>>();
const pendingWorkflowNodes = new Map<string, Promise<NodeTypeDefinition[]>>();

type ElectronPluginApi = {
  clientPlugins?: {
    listWorkflowPlugins?: () => Promise<PluginMeta[]>;
    getWorkflowNodes?: (pluginId: string) => Promise<NodeTypeDefinition[]>;
    installFromStore?: (pluginId: string, sourceUrl: string, md5?: string, files?: string[]) => Promise<PluginMeta>;
    uninstall?: (pluginId: string) => Promise<{ success: boolean }>;
  };
};

function getElectronPluginApi() {
  if (typeof window === 'undefined') return undefined;
  return (window as typeof window & { electronAPI?: ElectronPluginApi }).electronAPI?.clientPlugins;
}

async function listClientWorkflowPlugins(): Promise<PluginMeta[]> {
  try {
    return await (getElectronPluginApi()?.listWorkflowPlugins?.() ?? Promise.resolve([]));
  } catch (error) {
    console.warn('[pluginApi] failed to list client workflow plugins', error);
    return [];
  }
}

function mergeWorkflowPlugins(serverPlugins: PluginMeta[], clientPlugins: PluginMeta[]): PluginMeta[] {
  const merged = new Map<string, PluginMeta>();
  for (const plugin of serverPlugins) merged.set(plugin.id, plugin);
  for (const plugin of clientPlugins) merged.set(plugin.id, plugin);
  return [...merged.values()];
}

function isClientPluginType(type: PluginMeta['type']): boolean {
  return type === 'client' || type === 'both';
}

function clearPluginRequestCache() {
  pendingWorkflowPluginList.clear();
  pendingWorkflowNodes.clear();
}

export const pluginApi = {
  list(): Promise<PluginMeta[]> {
    return sdk.workflowPlugin.listAll(getPluginLocaleQuery());
  },
  listWorkflowPlugins(): Promise<PluginMeta[]> {
    const localeQuery = getPluginLocaleQuery();
    const pending = pendingWorkflowPluginList.get(localeQuery);
    if (pending) return pending;

    const request = Promise.all([
      sdk.workflowPlugin.listWorkflow(localeQuery),
      listClientWorkflowPlugins(),
    ]).then(([serverPlugins, clientPlugins]) => mergeWorkflowPlugins(serverPlugins, clientPlugins)).finally(() => {
      pendingWorkflowPluginList.delete(localeQuery);
    });
    pendingWorkflowPluginList.set(localeQuery, request);
    return request;
  },
  enable(pluginId: string): Promise<PluginMeta> {
    clearPluginRequestCache();
    return sdk.workflowPlugin.enable(pluginId);
  },
  disable(pluginId: string): Promise<PluginMeta> {
    clearPluginRequestCache();
    return sdk.workflowPlugin.disable(pluginId);
  },
  async uninstall(pluginId: string, runtimeType?: PluginMeta['type']): Promise<{ success: boolean }> {
    clearPluginRequestCache();
    if (isClientPluginType(runtimeType)) {
      return await (getElectronPluginApi()?.uninstall?.(pluginId) ?? Promise.reject(new Error('当前客户端不支持本地 client 插件卸载')));
    }
    return sdk.workflowPlugin.uninstall(pluginId);
  },
  async installFromStore(pluginId: string, sourceUrl?: string, md5?: string, runtimeType?: PluginMeta['type'], files?: string[]): Promise<PluginMeta> {
    clearPluginRequestCache();
    if (isClientPluginType(runtimeType)) {
      if (!sourceUrl) throw new Error('缺少 client 插件安装地址');
      return await (getElectronPluginApi()?.installFromStore?.(pluginId, sourceUrl, md5, files) ?? Promise.reject(new Error('当前客户端不支持本地 client 插件安装')));
    }
    return sdk.workflowPlugin.installFromStore(pluginId, sourceUrl, md5, files);
  },
  getWorkflowNodes(pluginId: string): Promise<NodeTypeDefinition[]> {
    const localeQuery = getPluginLocaleQuery();
    const cacheKey = `${pluginId}:${localeQuery}`;
    const pending = pendingWorkflowNodes.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      const clientPlugins = await listClientWorkflowPlugins();
      if (clientPlugins.some(plugin => plugin.id === pluginId)) {
        const plugin = clientPlugins.find(item => item.id === pluginId);
        const nodes = await (getElectronPluginApi()?.getWorkflowNodes?.(pluginId) ?? Promise.resolve([]));
        return nodes.map(node => ({
          ...node,
          pluginId,
          data: {
            ...(node as NodeTypeDefinition & { data?: Record<string, unknown> }).data,
            pluginId,
            pluginType: plugin?.type || 'client',
          },
        } as NodeTypeDefinition));
      }
      return sdk.workflowPlugin.getWorkflowNodes(pluginId, localeQuery);
    })().finally(() => {
      pendingWorkflowNodes.delete(cacheKey);
    });
    pendingWorkflowNodes.set(cacheKey, request);
    return request;
  },
  getTools(pluginId: string): Promise<WorkflowPluginTool[]> {
    return fetchWithAuth(`/api/plugins/${encodeURIComponent(pluginId)}/tools${getPluginLocaleQuery()}`).then((r) => r.json());
  },
  getConfig(pluginId: string): Promise<Record<string, string>> {
    return sdk.workflowPlugin.getConfig(pluginId);
  },
  saveConfig(pluginId: string, data: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    return sdk.workflowPlugin.saveConfig(pluginId, data);
  },
};

export const workflowPluginSchemeApi = {
  list(workflowId: string, pluginId: string): Promise<string[]> {
    return sdk.workflowPlugin.listSchemes(workflowId, pluginId);
  },
  create(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return sdk.workflowPlugin.createScheme(workflowId, pluginId, schemeName);
  },
  read(workflowId: string, pluginId: string, schemeName: string): Promise<Record<string, string>> {
    return sdk.workflowPlugin.readScheme(workflowId, pluginId, schemeName);
  },
  save(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): Promise<void> {
    return sdk.workflowPlugin.saveScheme(workflowId, pluginId, schemeName, data);
  },
  delete(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return sdk.workflowPlugin.deleteScheme(workflowId, pluginId, schemeName);
  },
};
