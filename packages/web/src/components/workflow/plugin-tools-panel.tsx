'use client';

import { useTranslations } from 'next-intl';
import { Play, Settings, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { resolveServerAssetUrl } from '@/lib/server';
import { PluginIcon } from './workflow-plugin-icon';
import type { WorkflowPlugin } from '@/lib/workflow-plugin-api';

export interface PluginTool {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

export interface PluginToolsPanelProps {
  plugins: WorkflowPlugin[];
  toolsByPlugin: Record<string, PluginTool[]>;
  selectedPluginId?: string;
  enabledSet?: Set<string>;
  onToolClick?: (pluginId: string, pluginName: string, pluginIconPath: string | undefined, tool: PluginTool) => void;
  onTogglePlugin?: (pluginId: string) => void;
  onOpenConfig?: (pluginId: string) => void;
  selectable?: boolean;
  selectedTools?: Array<{ pluginId: string; toolName: string }>;
  onToggleToolSelection?: (pluginId: string, toolName: string) => void;
  onSelectedToolsChange?: (tools: Array<{ pluginId: string; toolName: string }>) => void;
  showPluginSwitch?: boolean;
  className?: string;
}

export function PluginToolsPanel({
  plugins,
  toolsByPlugin,
  selectedPluginId,
  enabledSet,
  onToolClick,
  onTogglePlugin,
  onOpenConfig,
  selectable = false,
  selectedTools = [],
  onToggleToolSelection,
  onSelectedToolsChange,
  showPluginSwitch = true,
  className,
}: PluginToolsPanelProps) {
  const t = useTranslations('mini-apps');
  const showSwitch = Boolean(onTogglePlugin) && showPluginSwitch;
  const selectedSet = new Set(selectedTools.map((item) => `${item.pluginId}:${item.toolName}`));

  return (
    <div className={`min-h-0 min-w-0 flex-1 overflow-hidden ${className || ''}`}>
      <ScrollArea className="h-full">
        <div className="space-y-4 p-4">
          {plugins.map((plugin) => {
            const tools = toolsByPlugin[plugin.id] || [];
            const isEnabled = enabledSet?.has(plugin.id);
            const hasConfig = (plugin.config?.length ?? 0) > 0;
            const isHighlighted = selectedPluginId === plugin.id;
            const pluginAllSelected = tools.length > 0 && tools.every((tool) => selectedSet.has(`${plugin.id}:${tool.name}`));

            return (
              <div
                key={plugin.id}
                id={`plugin-section-${plugin.id}`}
                className={`rounded-md border ${isHighlighted ? 'ring-1 ring-primary/40' : ''}`}
              >
                <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
                  <PluginIcon
                    source={plugin.iconPath
                      ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
                      : { type: 'builtin', variant: 'local' }}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium">{plugin.name}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground">{plugin.version}</span>
                    {tools.length > 0 ? (
                      <Badge variant="secondary" className="ml-2 text-[10px]">{t('pluginTools.tools', { count: tools.length })}</Badge>
                    ) : null}
                  </div>
                  {selectable && tools.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        if (onSelectedToolsChange) {
                          const withoutCurrentPlugin = selectedTools.filter((item) => item.pluginId !== plugin.id);
                          const next = pluginAllSelected
                            ? withoutCurrentPlugin
                            : [
                                ...withoutCurrentPlugin,
                                ...tools.map((tool) => ({ pluginId: plugin.id, toolName: tool.name })),
                              ];
                          onSelectedToolsChange(next);
                          return;
                        }
                        tools.forEach((tool) => {
                          const selected = selectedSet.has(`${plugin.id}:${tool.name}`);
                          if (pluginAllSelected ? selected : !selected) {
                            onToggleToolSelection?.(plugin.id, tool.name);
                          }
                        });
                      }}
                    >
                      {pluginAllSelected ? 'Clear' : 'Select'}
                    </Button>
                  ) : null}
                  {showSwitch && hasConfig && onOpenConfig ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => onOpenConfig(plugin.id)}
                    >
                      <Settings className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {showSwitch ? (
                    <Switch
                      checked={Boolean(isEnabled)}
                      onCheckedChange={() => onTogglePlugin?.(plugin.id)}
                      className="scale-75"
                    />
                  ) : null}
                </div>
                {plugin.description ? (
                  <div className="px-3 py-1 text-[11px] text-muted-foreground">{plugin.description}</div>
                ) : null}
                {tools.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {tools.map((tool) => {
                      const clickable = Boolean(onToolClick);
                      return (
                        <div
                          key={tool.name}
                          className={`group flex flex-col gap-1 rounded-md border p-2 transition-colors ${clickable ? 'cursor-pointer hover:bg-muted' : ''}`}
                          onClick={clickable ? () => onToolClick?.(plugin.id, plugin.name, plugin.iconPath, tool) : undefined}
                        >
                          <div className="flex items-start gap-1.5">
                            <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate font-mono text-xs font-medium">{tool.name}</span>
                            {selectable ? (
                              <Checkbox
                                checked={selectedSet.has(`${plugin.id}:${tool.name}`)}
                                onCheckedChange={() => onToggleToolSelection?.(plugin.id, tool.name)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : null}
                          </div>
                          {tool.description ? (
                            <span className="line-clamp-2 text-[11px] text-muted-foreground">{tool.description}</span>
                          ) : null}
                          {clickable ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-auto h-5 self-end opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={(e) => { e.stopPropagation(); onToolClick?.(plugin.id, plugin.name, plugin.iconPath, tool); }}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
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
  );
}
