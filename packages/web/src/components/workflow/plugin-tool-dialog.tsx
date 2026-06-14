"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, PackagePlus, Play, Settings, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { resolveServerAssetUrl } from '@/lib/server';
import { WorkflowPluginsDialog } from '@/components/workflow/workflow-plugins-dialog';
import { MiniAppToolExecuteDialog } from '@/components/mini-apps/mini-app-tool-execute-dialog';
import { WorkflowPluginConfigDialog } from '@/components/workflow/workflow-plugin-config-dialog';
import { PluginIcon } from '@/components/workflow/workflow-plugin-icon';
import { usePluginList } from '@/hooks/use-plugin-list';
import type { PluginConfigField, Workflow } from '@agent-spaces/shared';

interface PluginTool {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

interface PluginToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  enabledPlugins: string[];
  onEnabledPluginsChange: (plugins: string[]) => void;
  /** 打开时默认选中并滚动到的插件 id */
  defaultPluginId?: string;
  /** 切换开关时是否调用 sdk.miniApp.update 持久化；mini-app 场景 true，workflow 场景 false（由 workflow 自行持久化） */
  persistEnabledPlugins?: boolean;
}

export function PluginToolDialog({
  open,
  onOpenChange,
  projectId,
  enabledPlugins,
  onEnabledPluginsChange,
  defaultPluginId,
  persistEnabledPlugins = true,
}: PluginToolDialogProps) {
  const t = useTranslations('mini-apps');
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const [pluginsDialogOpen, setPluginsDialogOpen] = useState(false);
  const [selectedPluginId, setSelectedPluginId] = useState<string | undefined>(defaultPluginId);
  const [executeDialog, setExecuteDialog] = useState<{
    pluginId: string;
    pluginName: string;
    pluginIconPath?: string;
    tool: PluginTool;
  } | null>(null);
  const [configPlugin, setConfigPlugin] = useState<{
    id: string;
    name: string;
    config: PluginConfigField[];
  } | null>(null);

  const adapterWorkflow: Workflow = useMemo(() => ({
    id: projectId,
    name: '',
    folderId: null,
    nodes: [],
    edges: [],
    createdAt: 0,
    updatedAt: 0,
    enabledPlugins,
  }), [projectId, enabledPlugins]);

  const { plugins, toolsByPlugin, loading, enabledSet, togglePlugin, getPluginConfig, reload } = usePluginList({
    projectId,
    enabledPlugins,
    onEnabledPluginsChange,
    loadTools: true,
    persistEnabledPlugins,
  });

  const scrollToPlugin = useCallback((pluginId: string) => {
    const el = document.getElementById(`plugin-section-${pluginId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 打开时默认选中并滚动到指定插件
  useEffect(() => {
    if (!open || !defaultPluginId) return;
    setSelectedPluginId(defaultPluginId);
    const timer = setTimeout(() => scrollToPlugin(defaultPluginId), 60);
    return () => clearTimeout(timer);
  }, [open, defaultPluginId, scrollToPlugin]);

  const handleSelectPlugin = useCallback((pluginId: string) => {
    setSelectedPluginId(pluginId);
    scrollToPlugin(pluginId);
  }, [scrollToPlugin]);

  const handleOpenToolDialog = useCallback((pluginId: string, pluginName: string, pluginIconPath: string | undefined, tool: PluginTool) => {
    setExecuteDialog({ pluginId, pluginName, pluginIconPath, tool });
  }, []);

  const handleOpenConfig = useCallback((pluginId: string) => {
    const config = getPluginConfig(pluginId);
    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin || !config.length) return;
    setConfigPlugin({ id: plugin.id, name: plugin.name, config });
  }, [getPluginConfig, plugins]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!w-[80vw] !h-[85vh] !max-h-[85vh] !max-w-none sm:!max-w-none !flex !flex-col !overflow-hidden !p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> {t('pluginTools.title')}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs me-8" onClick={() => setPluginsDialogOpen(true)}>
              <PackagePlus className="h-3 w-3" /> {t('pluginTools.store')}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('pluginTools.noPlugins')}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: plugin list */}
            <div className="w-56 shrink-0 border-r border-border bg-muted/20">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-0.5">
                  {plugins.map((plugin) => {
                    const isEnabled = enabledSet.has(plugin.id);
                    const tools = toolsByPlugin[plugin.id] || [];
                    const hasConfig = (plugin.config?.length ?? 0) > 0;
                    const isSelected = selectedPluginId === plugin.id;
                    return (
                      <div
                        key={plugin.id}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/60 cursor-pointer transition-colors group ${isSelected ? 'bg-muted ring-1 ring-primary/40' : ''}`}
                        onClick={() => handleSelectPlugin(plugin.id)}
                      >
                        <PluginIcon
                          source={plugin.iconPath
                            ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
                            : { type: 'builtin', variant: 'local' }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{plugin.name}</div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {tools.length > 0 && <span>{tools.length} tools</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {hasConfig && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={(e) => { e.stopPropagation(); handleOpenConfig(plugin.id); }}
                            >
                              <Settings className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => togglePlugin(plugin.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="scale-[0.65] shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Right: tools grid */}
            <div className="flex-1 min-w-0" ref={rightScrollRef}>
              <ScrollArea className="h-full">
                <div className="space-y-4 p-4">
                  {plugins.map((plugin) => {
                    const isEnabled = enabledSet.has(plugin.id);
                    const tools = toolsByPlugin[plugin.id] || [];
                    const hasConfig = (plugin.config?.length ?? 0) > 0;
                    return (
                      <div key={plugin.id} id={`plugin-section-${plugin.id}`} className={`rounded-md border ${selectedPluginId === plugin.id ? 'ring-1 ring-primary/40' : ''}`}>
                        {/* Group header */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
                          <PluginIcon
                            source={plugin.iconPath
                              ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
                              : { type: 'builtin', variant: 'local' }}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium">{plugin.name}</span>
                            <span className="ml-1.5 text-[10px] text-muted-foreground">{plugin.version}</span>
                            {tools.length > 0 && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">{t('pluginTools.tools', { count: tools.length })}</Badge>
                            )}
                          </div>
                          {hasConfig && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleOpenConfig(plugin.id)}
                            >
                              <Settings className="h-3 w-3" />
                            </Button>
                          )}
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => togglePlugin(plugin.id)}
                            className="scale-75"
                          />
                        </div>
                        {/* Plugin description */}
                        <div className="px-3 py-1 text-[11px] text-muted-foreground">{plugin.description}</div>
                        {/* Tools cards grid */}
                        {tools.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 p-3">
                            {tools.map((tool) => (
                              <div
                                key={tool.name}
                                className="group flex flex-col gap-1 rounded-md border p-2 hover:bg-muted cursor-pointer transition-colors"
                                onClick={() => handleOpenToolDialog(plugin.id, plugin.name, plugin.iconPath, tool)}
                              >
                                <div className="flex items-center gap-1.5">
                                  <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  <span className="font-mono text-xs font-medium truncate">{tool.name}</span>
                                </div>
                                {tool.description && (
                                  <span className="text-[11px] text-muted-foreground line-clamp-2">{tool.description}</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-auto h-5 self-end opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => { e.stopPropagation(); handleOpenToolDialog(plugin.id, plugin.name, plugin.iconPath, tool); }}
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 pb-3 text-[11px] text-muted-foreground">No tools available</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

      </DialogContent>

      <MiniAppToolExecuteDialog
        open={!!executeDialog}
        onOpenChange={(nextOpen) => { if (!nextOpen) setExecuteDialog(null); }}
        pluginId={executeDialog?.pluginId ?? ''}
        pluginName={executeDialog?.pluginName ?? ''}
        pluginIconPath={executeDialog?.pluginIconPath}
        tool={executeDialog?.tool ?? null}
      />

      <WorkflowPluginConfigDialog
        open={Boolean(configPlugin)}
        onOpenChange={(o) => { if (!o) setConfigPlugin(null); }}
        pluginId={configPlugin?.id || null}
        pluginName={configPlugin?.name || ''}
        config={configPlugin?.config || []}
      />

      <WorkflowPluginsDialog
        open={pluginsDialogOpen}
        onOpenChange={(nextOpen) => {
          setPluginsDialogOpen(nextOpen);
          if (!nextOpen) reload();
        }}
        workflow={adapterWorkflow}
        onWorkflowChange={(wf) => {
          const next = wf.enabledPlugins || [];
          onEnabledPluginsChange(next);
        }}
      />
    </Dialog>
  );
}
