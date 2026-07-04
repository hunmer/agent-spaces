'use client';

import { useTranslations } from 'next-intl';
import { Play, Settings, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { resolveServerAssetUrl } from '@/lib/server';
import { PluginIcon } from './workflow-plugin-icon';
import type { WorkflowPlugin } from '@/lib/workflow-plugin-api';

export interface PluginTool {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

export interface PluginToolsPanelProps {
  /** 需要渲染的插件列表（按插件分组） */
  plugins: WorkflowPlugin[];
  /** 插件 id -> 工具列表 映射 */
  toolsByPlugin: Record<string, PluginTool[]>;
  /** 当前选中的插件 id（用于高亮分组） */
  selectedPluginId?: string;
  /** 已启用的插件 id 集合（控制开关选中态） */
  enabledSet?: Set<string>;
  /**
   * 点击工具卡片时触发；未提供则工具卡片为只读展示，不响应点击。
   * 基于场景区分：PluginToolDialog 传入（可执行），PluginDetailDialog 不传（只读）。
   */
  onToolClick?: (pluginId: string, pluginName: string, pluginIconPath: string | undefined, tool: PluginTool) => void;
  /** 切换插件开关；提供则展示开关，否则隐藏 */
  onTogglePlugin?: (pluginId: string) => void;
  /** 打开配置；提供则展示配置按钮 */
  onOpenConfig?: (pluginId: string) => void;
  /** 容器额外 className（外层需自带高度） */
  className?: string;
}

/**
 * 按插件分组的工具卡片网格（通用组件）。
 * 由 plugin-tool-dialog（可执行/带开关）和 plugin-detail-dialog（只读）共用。
 */
export function PluginToolsPanel({
  plugins,
  toolsByPlugin,
  selectedPluginId,
  enabledSet,
  onToolClick,
  onTogglePlugin,
  onOpenConfig,
  className,
}: PluginToolsPanelProps) {
  const t = useTranslations('mini-apps');
  const showSwitch = Boolean(onTogglePlugin);

  return (
    <div className={`min-h-0 min-w-0 flex-1 overflow-hidden ${className || ''}`}>
      <ScrollArea className="h-full">
        <div className="space-y-4 p-4">
          {plugins.map((plugin) => {
            const tools = toolsByPlugin[plugin.id] || [];
            const isEnabled = enabledSet?.has(plugin.id);
            const hasConfig = (plugin.config?.length ?? 0) > 0;
            const isHighlighted = selectedPluginId === plugin.id;
            return (
              <div
                key={plugin.id}
                id={`plugin-section-${plugin.id}`}
                className={`rounded-md border ${isHighlighted ? 'ring-1 ring-primary/40' : ''}`}
              >
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
                  {showSwitch && hasConfig && onOpenConfig && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => onOpenConfig(plugin.id)}
                    >
                      <Settings className="h-3 w-3" />
                    </Button>
                  )}
                  {showSwitch && (
                    <Switch
                      checked={Boolean(isEnabled)}
                      onCheckedChange={() => onTogglePlugin?.(plugin.id)}
                      className="scale-75"
                    />
                  )}
                </div>
                {/* Plugin description */}
                {plugin.description && (
                  <div className="px-3 py-1 text-[11px] text-muted-foreground">{plugin.description}</div>
                )}
                {/* Tools cards grid */}
                {tools.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 p-3">
                    {tools.map((tool) => {
                      const clickable = Boolean(onToolClick);
                      return (
                        <div
                          key={tool.name}
                          className={`group flex flex-col gap-1 rounded-md border p-2 transition-colors ${clickable ? 'hover:bg-muted cursor-pointer' : ''}`}
                          onClick={clickable ? () => onToolClick?.(plugin.id, plugin.name, plugin.iconPath, tool) : undefined}
                        >
                          <div className="flex items-center gap-1.5">
                            <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="font-mono text-xs font-medium truncate">{tool.name}</span>
                          </div>
                          {tool.description && (
                            <span className="text-[11px] text-muted-foreground line-clamp-2">{tool.description}</span>
                          )}
                          {clickable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-auto h-5 self-end opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); onToolClick?.(plugin.id, plugin.name, plugin.iconPath, tool); }}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                          )}
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
