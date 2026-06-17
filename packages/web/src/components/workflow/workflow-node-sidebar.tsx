'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { NodeTypeDefinition, OutputField, PluginConfigField, Workflow } from '@agent-spaces/shared';
import { LOOP_BREAK_NODE_TYPE } from '@agent-spaces/shared';

/** 侧边栏隐藏的节点类型（仅在节点选择对话框中可见）。 */
const SIDEBAR_HIDDEN_NODE_TYPES = new Set<string>([LOOP_BREAK_NODE_TYPE]);
import { useLocalizedNodeDefinitionsByCategory, useLocalizedSearchNodeDefinitions } from '@/lib/workflow-nodes';
import { toPinyinSearchKey } from '@/lib/utils';
import { pluginApi, workflowPluginSchemeApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible, CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandGroup, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { WorkflowPluginConfigDialog } from './workflow-plugin-config-dialog';
import { Search, ChevronDown, ChevronRight, Plus, Settings, Trash2, LayoutList, LayoutGrid } from 'lucide-react';
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
}: {
  workflow?: Workflow | null;
  onWorkflowChange?: (workflow: Workflow) => void;
  onOpenPluginPicker?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [workflowPlugins, setWorkflowPlugins] = useState<WorkflowPlugin[]>([]);
  const [categoryPluginMap, setCategoryPluginMap] = useState<Record<string, string>>({});
  const [schemeMap, setSchemeMap] = useState<Record<string, string[]>>({});
  const [configPlugin, setConfigPlugin] = useState<{
    id: string;
    name: string;
    config: PluginConfigField[];
    schemeName?: string;
  } | null>(null);
  const [newSchemeDialogOpen, setNewSchemeDialogOpen] = useState(false);
  const [newSchemeName, setNewSchemeName] = useState('');
  const [newSchemePluginId, setNewSchemePluginId] = useState<string | null>(null);
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
        setSchemeMap({});
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

  const loadSchemes = useCallback(async () => {
    if (!workflow?.id) return;
    const pluginIds = Array.from(new Set(Object.values(categoryPluginMap)));
    const next: Record<string, string[]> = {};
    for (const pluginId of pluginIds) {
      try {
        next[pluginId] = await workflowPluginSchemeApi.list(workflow.id, pluginId);
      } catch {
        next[pluginId] = [];
      }
    }
    setSchemeMap(next);
  }, [workflow?.id, categoryPluginMap]);

  useEffect(() => {
    void loadSchemes();
  }, [loadSchemes]);

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

  const openPluginConfig = useCallback((pluginId: string) => {
    const plugin = pluginById.get(pluginId);
    if (!plugin?.config?.length) return;
    setConfigPlugin({
      id: plugin.id,
      name: plugin.name,
      config: plugin.config,
      schemeName: selectedScheme(plugin.id) || undefined,
    });
  }, [pluginById, selectedScheme]);

  const createScheme = useCallback(async () => {
    if (!workflow?.id || !newSchemePluginId || !newSchemeName.trim()) return;
    const name = newSchemeName.trim();
    await workflowPluginSchemeApi.create(workflow.id, newSchemePluginId, name);
    await loadSchemes();
    selectScheme(newSchemePluginId, name);
    setNewSchemeDialogOpen(false);
  }, [workflow?.id, newSchemePluginId, newSchemeName, loadSchemes, selectScheme]);

  const deleteCurrentScheme = useCallback(async (pluginId: string) => {
    const schemeName = selectedScheme(pluginId);
    if (!workflow?.id || !schemeName) return;
    await workflowPluginSchemeApi.delete(workflow.id, pluginId, schemeName);
    selectScheme(pluginId, '');
    await loadSchemes();
  }, [workflow?.id, selectedScheme, selectScheme, loadSchemes]);

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
                      <>
                        <Popover>
                          <PopoverTrigger
                            nativeButton={false}
                            render={<span />}
                            className="inline-flex h-5 max-w-[92px] items-center gap-0.5 rounded px-1.5 text-[10px] hover:bg-muted cursor-pointer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="truncate">{selectedScheme(categoryPluginMap[category]) || t('sidebar.defaultConfig')}</span>
                            <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
                          </PopoverTrigger>
                          <PopoverContent className="w-44 p-0" align="end">
                            <Command>
                              <CommandList>
                                <CommandGroup>
                                  <CommandItem value="__default__" className="text-xs" onSelect={() => selectScheme(categoryPluginMap[category], '')}>
                                    {t('sidebar.defaultConfig')}
                                  </CommandItem>
                                  {(schemeMap[categoryPluginMap[category]] || []).map(name => (
                                    <CommandItem key={name} value={name} className="text-xs" onSelect={() => selectScheme(categoryPluginMap[category], name)}>
                                      {name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                                <CommandGroup>
                                  <CommandItem
                                    className="text-xs text-primary"
                                    onSelect={() => {
                                      setNewSchemePluginId(categoryPluginMap[category]);
                                      setNewSchemeName('');
                                      setNewSchemeDialogOpen(true);
                                    }}
                                  >
                                    <Plus className="mr-1 h-3 w-3" /> 新增方案
                                  </CommandItem>
                                  {selectedScheme(categoryPluginMap[category]) ? (
                                    <CommandItem className="text-xs text-destructive" onSelect={() => deleteCurrentScheme(categoryPluginMap[category])}>
                                      <Trash2 className="mr-1 h-3 w-3" /> 删除当前方案
                                    </CommandItem>
                                  ) : null}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={(event) => { event.stopPropagation(); openPluginConfig(categoryPluginMap[category]); }}>
                          <Settings className="h-3 w-3" />
                        </Button>
                      </>
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
                              <span className="text-[10px] text-muted-foreground font-mono ml-auto">{node.type}</span>
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
      <AlertDialog open={newSchemeDialogOpen} onOpenChange={setNewSchemeDialogOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sidebar.newSchemeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sidebar.newSchemeDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={newSchemeName} onChange={(event) => setNewSchemeName(event.target.value)} placeholder={t('sidebar.schemeNamePlaceholder')} className="text-sm" />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('sidebar.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={!newSchemeName.trim()} onClick={createScheme}>{t('sidebar.create')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <WorkflowPluginConfigDialog
        open={Boolean(configPlugin)}
        onOpenChange={(open) => { if (!open) setConfigPlugin(null); }}
        pluginId={configPlugin?.id || null}
        pluginName={configPlugin?.name || ''}
        config={configPlugin?.config || []}
        workflowId={workflow?.id}
        schemeName={configPlugin?.schemeName}
      />
    </div>
  );
}
