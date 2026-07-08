"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, PackagePlus, Settings, Puzzle, Grid3x3, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { resolveServerAssetUrl } from '@/lib/server';
import { WorkflowPluginsDialog } from '@/components/workflow/workflow-plugins-dialog';
import { MiniAppToolExecuteDialog } from '@/components/mini-apps/mini-app-tool-execute-dialog';
import { WorkflowPluginConfigDialog } from '@/components/workflow/workflow-plugin-config-dialog';
import { PluginIcon } from '@/components/workflow/workflow-plugin-icon';
import { usePluginList } from '@/hooks/use-plugin-list';
import { PluginToolsPanel, type PluginTool } from './plugin-tools-panel';
import type { PluginConfigField, Workflow } from '@agent-spaces/shared';

interface PluginToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  enabledPlugins: string[];
  onEnabledPluginsChange: (plugins: string[]) => void;
  defaultPluginId?: string;
  persistEnabledPlugins?: boolean;
  selectable?: boolean;
  selectedTools?: Array<{ pluginId: string; toolName: string }>;
  onSelectedToolsChange?: (tools: Array<{ pluginId: string; toolName: string }>) => void;
  showPluginSwitch?: boolean;
}

export function PluginToolDialog({
  open,
  onOpenChange,
  projectId,
  enabledPlugins,
  onEnabledPluginsChange,
  defaultPluginId,
  persistEnabledPlugins = true,
  selectable = false,
  selectedTools = [],
  onSelectedToolsChange,
  showPluginSwitch = true,
}: PluginToolDialogProps) {
  const t = useTranslations('mini-apps');
  const isMobile = useIsMobile();
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
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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
    if (selectable) return;
    setExecuteDialog({ pluginId, pluginName, pluginIconPath, tool });
  }, [selectable]);

  const handleOpenConfig = useCallback((pluginId: string) => {
    const config = getPluginConfig(pluginId);
    const plugin = plugins.find((p) => p.id === pluginId);
    if (!plugin || !config.length) return;
    setConfigPlugin({ id: plugin.id, name: plugin.name, config });
  }, [getPluginConfig, plugins]);

  const toggleToolSelection = useCallback((pluginId: string, toolName: string) => {
    if (!onSelectedToolsChange) return;
    const exists = selectedTools.some((item) => item.pluginId === pluginId && item.toolName === toolName);
    if (exists) {
      onSelectedToolsChange(selectedTools.filter((item) => !(item.pluginId === pluginId && item.toolName === toolName)));
      return;
    }
    onSelectedToolsChange([...selectedTools, { pluginId, toolName }]);
  }, [onSelectedToolsChange, selectedTools]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!flex !h-[100dvh] !max-h-none !w-screen !max-w-none !flex-col !overflow-hidden !rounded-none !p-0 sm:!h-[85vh] sm:!max-h-[85vh] sm:!w-[80vw] sm:!rounded-xl"
      >
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> {t('pluginTools.title')}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="me-8 h-6 gap-1 text-xs" onClick={() => setPluginsDialogOpen(true)}>
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
        ) : (() => {
          const pluginsPanel = (
            <div className={isMobile ? "h-full bg-muted/20" : "w-56 shrink-0 border-r border-border bg-muted/20"}>
              <ScrollArea className="h-full">
                <div className="space-y-0.5 p-2">
                  {plugins.map((plugin) => {
                    const isEnabled = enabledSet.has(plugin.id);
                    const tools = toolsByPlugin[plugin.id] || [];
                    const hasConfig = (plugin.config?.length ?? 0) > 0;
                    const isSelected = selectedPluginId === plugin.id;
                    return (
                      <div
                        key={plugin.id}
                        className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-muted/60 ${isSelected ? 'bg-muted ring-1 ring-primary/40' : ''}`}
                        onClick={() => handleSelectPlugin(plugin.id)}
                      >
                        <PluginIcon
                          source={plugin.iconPath
                            ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
                            : { type: 'builtin', variant: 'local' }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{plugin.name}</div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {tools.length > 0 ? <span>{tools.length} tools</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {hasConfig ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={(e) => { e.stopPropagation(); handleOpenConfig(plugin.id); }}
                            >
                              <Settings className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                        {showPluginSwitch ? (
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => togglePlugin(plugin.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="scale-[0.65] shrink-0"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          );

          const toolsPanel = (
            <PluginToolsPanel
              plugins={plugins}
              toolsByPlugin={toolsByPlugin}
              selectedPluginId={selectedPluginId}
              enabledSet={enabledSet}
              onToolClick={selectable ? undefined : handleOpenToolDialog}
              onTogglePlugin={togglePlugin}
              onOpenConfig={handleOpenConfig}
              selectable={selectable}
              selectedTools={selectedTools}
              onToggleToolSelection={toggleToolSelection}
              onSelectedToolsChange={onSelectedToolsChange}
              showPluginSwitch={showPluginSwitch}
            />
          );

          if (isMobile) {
            return (
              <Tabs defaultValue="plugins" className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
                <TabsList className="w-full">
                  <TabsTrigger value="plugins">
                    <Puzzle className="size-4" />
                    {t('pluginTools.pluginsTab')}
                  </TabsTrigger>
                  <TabsTrigger value="tools">
                    <Grid3x3 className="size-4" />
                    {t('pluginTools.toolsTab')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="plugins" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {pluginsPanel}
                </TabsContent>
                <TabsContent value="tools" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {toolsPanel}
                </TabsContent>
              </Tabs>
            );
          }

          return (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {pluginsPanel}
              {toolsPanel}
            </div>
          );
        })()}
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
        onOpenChange={(nextOpen) => { if (!nextOpen) setConfigPlugin(null); }}
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
        onWorkflowChange={(workflow) => {
          onEnabledPluginsChange(workflow.enabledPlugins || []);
        }}
      />
    </Dialog>
  );
}
