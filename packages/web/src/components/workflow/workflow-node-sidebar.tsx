'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { NodeTypeDefinition, OutputField, PluginConfigField, Workflow } from '@agent-spaces/shared';
import { LOOP_BREAK_NODE_TYPE } from '@agent-spaces/shared';

/** 侧边栏隐藏的节点类型（仅在节点选择对话框中可见）。 */
const SIDEBAR_HIDDEN_NODE_TYPES = new Set<string>([LOOP_BREAK_NODE_TYPE]);
import { useLocalizedNodeDefinitionsByCategory, useLocalizedSearchNodeDefinitions } from '@/lib/workflow-nodes';
import { toPinyinSearchKey, copyToClipboard } from '@/lib/utils';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible, CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import { PluginConfigDialog } from '@/components/plugins/plugin-config-dialog';
import { PluginConfigSchemeControl } from '@/components/plugins/plugin-config-scheme-control';
import { Search, ChevronDown, ChevronRight, Plus, LayoutList, LayoutGrid, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { WorkflowNodeDefinitionIcon } from './workflow-node-icon';
import { JsonViewer, type JsonValue } from '@/components/viewers/json-viewer';
import { WORKFLOW_NODE_DRAG_MIME } from './workflow-drag-types';

function stringToHsl(str: string, s: number, l: number): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = hash % 360;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** 把 OutputField（含 children）递归构建为 JsonViewer 可展开的嵌套结构。 */
function outputFieldToJson(field: OutputField): JsonValue {
  const isArray = field.type === 'array' || field.type.endsWith('[]');
  if (field.type === 'object' || isArray) {
    const obj: Record<string, JsonValue> = field.children?.length
      ? Object.fromEntries(field.children.map(c => [c.key, outputFieldToJson(c)]))
      : {};
    return isArray ? [obj] : obj;
  }
  return field.type;
}

export function WorkflowNodeSidebar({
  workflow,
  onWorkflowChange,
  onOpenPluginPicker,
  onNodeAdd,
}: {
  workflow?: Workflow | null;
  onWorkflowChange?: (workflow: Workflow) => void;
  onOpenPluginPicker?: () => void;
  onNodeAdd?: (nodeType: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [workflowPlugins, setWorkflowPlugins] = useState<WorkflowPlugin[]>([]);
  const [categoryPluginMap, setCategoryPluginMap] = useState<Record<string, string>>({});
  const [configPlugin, setConfigPlugin] = useState<{
    id: string;
    name: string;
    config: PluginConfigField[];
    schemeName?: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const t = useTranslations('workflows');

  const allCategories = useLocalizedNodeDefinitionsByCategory();
  const searchResults = useLocalizedSearchNodeDefinitions(searchQuery);

  const enabledPlugins = useMemo(() => workflow?.enabledPlugins || [], [workflow?.enabledPlugins]);

  useEffect(() => {
    let cancelled = false;
    async function loadPluginNodes() {
      if (!enabledPlugins.length) {
        setWorkflowPlugins([]);
        setCategoryPluginMap({});
        return;
      }
      const plugins = await pluginApi.listWorkflowPlugins();
      const enabledSet = new Set(enabledPlugins);
      const activePlugins = plugins.filter(plugin => enabledSet.has(plugin.id));
      const catMap: Record<string, string> = {};
      for (const plugin of activePlugins) {
        try {
          const nodes = await pluginApi.getWorkflowNodes(plugin.id);
          for (const node of nodes) {
            if (node.category) catMap[node.category] = plugin.id;
          }
        } catch (error) {
          console.warn('[WorkflowNodeSidebar] failed to load plugin nodes', plugin.id, error);
        }
      }
      if (cancelled) return;
      setWorkflowPlugins(activePlugins);
      setCategoryPluginMap(catMap);
    }
    void loadPluginNodes();
    return () => { cancelled = true; };
  }, [enabledPlugins]);

  const categories = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const grouped: Record<string, NodeTypeDefinition[]> = {};
      const seen = new Set<string>();
      const add = (def: NodeTypeDefinition) => {
        if (seen.has(def.type)) return;
        if (def.manualCreate === false || SIDEBAR_HIDDEN_NODE_TYPES.has(def.type)) return;
        seen.add(def.type);
        if (!grouped[def.category]) grouped[def.category] = [];
        grouped[def.category].push(def);
      };
      // 文本匹配（label/type），再补充拼音匹配（label 全拼/首字母），按 type 去重
      searchResults.forEach(add);
      for (const nodes of Object.values(allCategories)) {
        for (const def of nodes) {
          if (toPinyinSearchKey(def.label).includes(q)) add(def);
        }
      }
      return grouped;
    }
    const grouped: Record<string, typeof searchResults> = {};
    for (const [category, nodes] of Object.entries(allCategories)) {
      const filtered = nodes.filter(node => !SIDEBAR_HIDDEN_NODE_TYPES.has(node.type));
      if (filtered.length) grouped[category] = filtered;
    }
    return grouped;
  }, [searchQuery, searchResults, allCategories]);

  const pluginById = useMemo(() => new Map(workflowPlugins.map(plugin => [plugin.id, plugin])), [workflowPlugins]);

  const toggleCategory = useCallback((cat: string) => {
    setOpenCategories(prev => ({ ...prev, [cat]: prev[cat] === undefined ? false : !prev[cat] }));
  }, []);

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData(WORKFLOW_NODE_DRAG_MIME, nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleNodeClick = useCallback((nodeType: string) => {
    onNodeAdd?.(nodeType);
  }, [onNodeAdd]);

  const selectedScheme = useCallback((pluginId: string) => {
    return workflow?.pluginConfigSchemes?.[pluginId] || '';
  }, [workflow?.pluginConfigSchemes]);

  const selectScheme = useCallback((pluginId: string, schemeName: string) => {
    if (!workflow || !onWorkflowChange) return;
    const schemes = { ...(workflow.pluginConfigSchemes || {}) };
    if (schemeName) schemes[pluginId] = schemeName;
    else delete schemes[pluginId];
    onWorkflowChange({ ...workflow, pluginConfigSchemes: schemes });
  }, [workflow, onWorkflowChange]);

  const openPluginConfig = useCallback((pluginId: string, schemeName?: string) => {
    const plugin = pluginById.get(pluginId);
    if (!plugin?.config?.length) return;
    setConfigPlugin({
      id: plugin.id,
      name: plugin.name,
      config: plugin.config,
      schemeName,
    });
  }, [pluginById]);

  return (
    <div className="border-r border-border bg-background flex flex-col h-full w-full shrink-0">
      <div className="p-2 border-b border-border">
        <div className="relative flex items-center gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('sidebar.searchNodes')}
              className="pl-7 h-7 text-xs"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setViewMode(m => m === 'list' ? 'grid' : 'list')}>
            {viewMode === 'list' ? <LayoutGrid className="h-3.5 w-3.5" /> : <LayoutList className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onOpenPluginPicker}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {Object.entries(categories).map(([category, nodes]) => (
              <Collapsible
                key={category}
                open={openCategories[category] !== false}
                onOpenChange={() => toggleCategory(category)}
              >
                <div
                  className="flex items-center w-full px-2 py-1 text-xs font-medium rounded hover:brightness-95"
                  style={{
                    backgroundColor: stringToHsl(category, 40, 92),
                    color: stringToHsl(category, 50, 30),
                  }}
                >
                  <span className="cursor-pointer shrink-0" onClick={() => toggleCategory(category)}>
                    {openCategories[category] !== false ? (
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    ) : (
                      <ChevronRight className="h-3 w-3 opacity-60" />
                    )}
                  </span>
                  <span className="truncate ml-1">{category}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {categoryPluginMap[category] && pluginById.get(categoryPluginMap[category])?.config?.length ? (
                      <PluginConfigSchemeControl
                        pluginId={categoryPluginMap[category]}
                        selectedScheme={selectedScheme(categoryPluginMap[category])}
                        onSelect={(schemeName) => selectScheme(categoryPluginMap[category], schemeName)}
                        onEdit={(schemeName) => openPluginConfig(categoryPluginMap[category], schemeName)}
                        className="max-w-[124px]"
                        legacyWorkflowId={workflow?.id}
                      />
                    ) : null}
                    <span className="text-[10px]">{nodes.length}</span>
                  </span>
                </div>
                <CollapsibleContent>
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-1 mt-0.5' : 'space-y-0.5 mt-0.5'}>
                    {nodes.map((node) => (
                      <HoverCard key={node.type} openDelay={400} closeDelay={100}>
                        <HoverCardTrigger className={viewMode === 'grid' ? 'flex flex-col' : undefined}>
                          <div
                            draggable
                            className={viewMode === 'grid'
                              ? 'flex flex-col items-center gap-1 px-2 py-2 text-xs rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing text-center'
                              : 'flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing'}
                            onClick={() => handleNodeClick(node.type)}
                            onDragStart={(e) => onDragStart(e, node.type)}
                          >
                            <WorkflowNodeDefinitionIcon definition={node} className={viewMode === 'grid' ? 'h-5 w-5 shrink-0 text-muted-foreground' : 'h-3.5 w-3.5 shrink-0 text-muted-foreground'} />
                            <div className="min-w-0 w-full">
                              <div className="truncate">{node.label}</div>
                              {node.description && viewMode === 'list' && (
                                <div className="text-[10px] text-muted-foreground truncate">{node.description}</div>
                              )}
                            </div>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72 p-3" side="right">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <WorkflowNodeDefinitionIcon definition={node} className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-sm font-semibold">{node.label}</span>
                              <span className="flex items-center gap-1 ml-auto">
                                <span className="text-[10px] text-muted-foreground font-mono">{node.type}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 shrink-0"
                                  onClick={() => {
                                    void copyToClipboard(node.type);
                                    toast.success(t('sidebar.idCopied'));
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </span>
                            </div>
                            {node.description && (
                              <p className="text-xs text-muted-foreground">{node.description}</p>
                            )}
                            {node.properties?.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('sidebar.params')}</div>
                                {node.properties.map(prop => (
                                  <div key={prop.key} className="flex items-center gap-1.5 text-xs">
                                    <span className="font-mono text-muted-foreground">{prop.key}</span>
                                    <span
                                      className="text-[10px] px-1 rounded font-medium"
                                      style={{ backgroundColor: stringToHsl(prop.type, 45, 90), color: stringToHsl(prop.type, 55, 35) }}
                                    >{prop.type}</span>
                                    {prop.dataType && prop.dataType !== 'string' && (
                                      <span
                                        className="text-[10px] px-1 rounded font-medium"
                                        style={{ backgroundColor: stringToHsl(prop.dataType, 45, 90), color: stringToHsl(prop.dataType, 55, 35) }}
                                      >{prop.dataType}</span>
                                    )}
                                    {prop.required && <span className="text-[10px] text-destructive">*</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {node.outputs && node.outputs.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('sidebar.outputs')}</div>
                                <JsonViewer
                                  data={Object.fromEntries(node.outputs!.map(o => [o.key, outputFieldToJson(o)]))}
                                  rootName=""
                                  defaultExpanded={2}
                                  mini
                                  className="text-[10px]"
                                />
                              </div>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </div>
      <PluginConfigDialog
        open={Boolean(configPlugin)}
        onOpenChange={(open) => { if (!open) setConfigPlugin(null); }}
        pluginId={configPlugin?.id || null}
        pluginName={configPlugin?.name || ''}
        config={configPlugin?.config || []}
        schemeName={configPlugin?.schemeName}
        legacyWorkflowId={workflow?.id}
      />
    </div>
  );
}
