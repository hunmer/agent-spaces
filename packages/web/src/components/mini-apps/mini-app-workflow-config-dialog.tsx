'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkflowTemplate } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PluginIcon } from '@/components/workflow/workflow-plugin-icon';
import { PluginConfigDialog } from '@/components/plugins/plugin-config-dialog';
import { PluginConfigSchemeControl } from '@/components/plugins/plugin-config-scheme-control';
import { pluginApi, pluginConfigSchemeApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import {
  ensureMiniAppWorkflowConfig,
  writeMiniAppWorkflowConfig,
  type MiniAppWorkflowConfig,
} from '@/lib/mini-app-workflow-config';
import { resolveServerAssetUrl } from '@/lib/server';

type EditingPlugin = {
  plugin: WorkflowPlugin;
  loadValues: () => Promise<Record<string, string>>;
};

function normalizeConfigValues(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    typeof value === 'string'
      ? value
      : value == null
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
  ]));
}

export function MiniAppWorkflowConfigDialog({
  open,
  projectId,
  workflow,
  onOpenChange,
}: {
  open: boolean;
  projectId: string;
  workflow: WorkflowTemplate | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('mini-apps');
  const [plugins, setPlugins] = useState<WorkflowPlugin[]>([]);
  const [config, setConfig] = useState<MiniAppWorkflowConfig | null>(null);
  const [editing, setEditing] = useState<EditingPlugin | null>(null);

  useEffect(() => {
    if (!open || !workflow) return;
    let cancelled = false;
    void Promise.all([
      pluginApi.list(),
      ensureMiniAppWorkflowConfig(projectId, workflow),
    ]).then(([pluginList, nextConfig]) => {
      if (cancelled) return;
      const enabled = new Set(workflow.enabledPlugins || []);
      setPlugins(pluginList.filter(plugin => enabled.has(plugin.id)));
      setConfig(nextConfig);
    });
    return () => { cancelled = true; };
  }, [open, projectId, workflow]);

  const pluginById = useMemo(() => new Map(plugins.map(plugin => [plugin.id, plugin])), [plugins]);

  const updatePluginConfig = useCallback(async (pluginId: string, value?: string | Record<string, unknown>) => {
    if (!config) return;
    const pluginConfigs = { ...config.pluginConfigs };
    if (value === undefined || value === '') delete pluginConfigs[pluginId];
    else pluginConfigs[pluginId] = value;
    const next = { ...config, pluginConfigs };
    setConfig(next);
    await writeMiniAppWorkflowConfig(projectId, next);
  }, [config, projectId]);

  const openPluginConfig = useCallback((pluginId: string) => {
    if (!workflow) return;
    const plugin = pluginById.get(pluginId);
    if (!plugin?.config?.length) return;
    setEditing({
      plugin,
      loadValues: async () => {
        const override = config?.pluginConfigs[pluginId];
        if (override && typeof override === 'object') return normalizeConfigValues(override);
        if (typeof override === 'string') return pluginConfigSchemeApi.read(pluginId, override);
        const workflowScheme = workflow.pluginConfigSchemes?.[pluginId];
        return workflowScheme
          ? pluginConfigSchemeApi.read(pluginId, workflowScheme)
          : pluginApi.getConfig(pluginId);
      },
    });
  }, [config?.pluginConfigs, pluginById, workflow]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{workflow?.name || t('workflowConfig.title')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {plugins.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('workflowConfig.noPlugins')}</div>
            ) : plugins.map(plugin => {
              const override = config?.pluginConfigs[plugin.id];
              const isCustom = Boolean(override && typeof override === 'object');
              return (
                <div key={plugin.id} className="flex min-w-0 items-center gap-2 rounded-md border p-2">
                  <PluginIcon
                    source={plugin.iconPath
                      ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
                      : { type: 'builtin', variant: 'local' }}
                    className="h-7 w-7 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{plugin.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{plugin.id}</div>
                  </div>
                  {plugin.config?.length ? (
                    <PluginConfigSchemeControl
                      pluginId={plugin.id}
                      selectedScheme={typeof override === 'string' ? override : undefined}
                      selectedLabel={isCustom ? t('workflowConfig.customConfig') : undefined}
                      defaultLabel={t('workflowConfig.followWorkflow')}
                      onSelect={(schemeName) => updatePluginConfig(plugin.id, schemeName || undefined)}
                      onEdit={() => openPluginConfig(plugin.id)}
                      className="w-40"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{t('workflowConfig.noConfig')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <PluginConfigDialog
        open={Boolean(editing)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setEditing(null); }}
        pluginId={editing?.plugin.id || null}
        pluginName={editing?.plugin.name || ''}
        config={editing?.plugin.config || []}
        loadValues={editing?.loadValues}
        saveValues={async (values) => {
          if (!editing) return;
          await updatePluginConfig(editing.plugin.id, values);
        }}
      />
    </>
  );
}
