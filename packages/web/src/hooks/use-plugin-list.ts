'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { sdk } from '@/lib/sdk';
import { fetchWithAuth } from '@/lib/auth';
import type { PluginConfigField } from '@agent-spaces/shared';

export interface PluginWithTools extends WorkflowPlugin {
  tools: { name: string; description: string; input_schema?: Record<string, unknown> }[];
}

/**
 * 加载插件列表 + 插件工具 + 开关管理
 * plugin-tool-dialog 和 workflow-node-sidebar 共用
 */
export function usePluginList({
  projectId,
  enabledPlugins,
  onEnabledPluginsChange,
  loadTools = false,
  persistEnabledPlugins = true,
}: {
  projectId: string;
  enabledPlugins: string[];
  onEnabledPluginsChange: (plugins: string[]) => void;
  /** dialog 需要 tools，sidebar 不需要 */
  loadTools?: boolean;
  /** 切换开关时是否调用 sdk.miniApp.update 持久化（mini-app 场景 true，workflow 场景 false） */
  persistEnabledPlugins?: boolean;
}) {
  const [plugins, setPlugins] = useState<WorkflowPlugin[]>([]);
  const [toolsByPlugin, setToolsByPlugin] = useState<Record<string, PluginWithTools['tools']>>({});
  const [loading, setLoading] = useState(false);

  const enabledSet = useMemo(() => new Set(enabledPlugins), [enabledPlugins]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const allPlugins = await pluginApi.list();
      setPlugins(allPlugins);

      if (loadTools) {
        const map: Record<string, PluginWithTools['tools']> = {};
        await Promise.all(
          allPlugins.map(async (p) => {
            try {
              const resp = await fetchWithAuth(`/api/plugins/${encodeURIComponent(p.id)}/tools`);
              if (resp.ok) {
                const tools = await resp.json();
                if (tools.length > 0) map[p.id] = tools;
              }
            } catch { /* ignore */ }
          }),
        );
        setToolsByPlugin(map);
      }
    } finally {
      setLoading(false);
    }
  }, [loadTools]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const togglePlugin = useCallback(async (pluginId: string) => {
    const next = new Set(enabledPlugins);
    const enabling = !next.has(pluginId);
    if (enabling) {
      next.add(pluginId);
      const plugin = plugins.find(p => p.id === pluginId);
      if (plugin && !plugin.enabled) {
        await pluginApi.enable(pluginId);
        setPlugins(items => items.map(item => item.id === pluginId ? { ...item, enabled: true } : item));
      }
    } else {
      next.delete(pluginId);
    }
    const arr = Array.from(next);
    onEnabledPluginsChange(arr);
    if (persistEnabledPlugins) {
      await sdk.miniApp.update(projectId, { enabledPlugins: arr });
    }
  }, [enabledPlugins, plugins, projectId, onEnabledPluginsChange, persistEnabledPlugins]);

  /** 拿到某个插件的 config 字段 */
  const getPluginConfig = useCallback((pluginId: string): PluginConfigField[] => {
    return plugins.find(p => p.id === pluginId)?.config || [];
  }, [plugins]);

  return { plugins, toolsByPlugin, loading, enabledSet, togglePlugin, getPluginConfig, reload };
}
