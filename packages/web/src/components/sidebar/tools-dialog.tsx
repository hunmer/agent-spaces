'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import {
  BUILT_IN_AGENT_TOOL_CATEGORIES,
  BUILT_IN_AGENT_TOOLS,
  type BuiltInAgentToolCategoryName,
  type BuiltInAgentToolName,
} from '@agent-spaces/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Hash,
  Terminal,
  Database,
  Workflow,
  Files,
  Users,
  Search,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentIcon } from '@/components/common/agent-icon';

interface ToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
  selectable?: boolean;
  selectedTools?: BuiltInAgentToolName[];
  onSelectedToolsChange?: (tools: BuiltInAgentToolName[]) => void;
}

interface AgentToolsPreset {
  id: string;
  name?: string;
  avatarUrl?: string;
  tools?: string[];
}

const TOOL_CATEGORY_ICONS: Record<string, typeof Hash> = {
  Hash,
  Users,
  Terminal,
  Database,
  Files,
  Workflow,
};

const TOOL_CATEGORIES = Object.entries(BUILT_IN_AGENT_TOOL_CATEGORIES)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([key, meta]) => ({
    key: key as BuiltInAgentToolCategoryName,
    icon: TOOL_CATEGORY_ICONS[meta.icon] ?? Hash,
  }));

type BuiltInToolView = {
  name: BuiltInAgentToolName;
  label: string;
  description: string;
  category?: BuiltInAgentToolCategoryName;
};

const ALL_TOOLS = (BUILT_IN_AGENT_TOOLS ?? []) as readonly BuiltInToolView[];

function compareTools(a: BuiltInToolView, b: BuiltInToolView) {
  const aOrder = a.category ? BUILT_IN_AGENT_TOOL_CATEGORIES[a.category]?.order ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  const bOrder = b.category ? BUILT_IN_AGENT_TOOL_CATEGORIES[b.category]?.order ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return ALL_TOOLS.findIndex((tool) => tool.name === a.name) - ALL_TOOLS.findIndex((tool) => tool.name === b.name);
}

export function ToolsDialog({ open, onOpenChange, standalone, selectable, selectedTools: externalSelected, onSelectedToolsChange }: ToolsDialogProps) {
  const t = useTranslations('tools');

  const toolLabel = useCallback((tool: { name: string; label: string }) => {
    const key = `items.${tool.name}.label` as const;
    return t.has(key) ? t(key) : tool.label;
  }, [t]);
  const toolDesc = useCallback((tool: { name: string; description: string }) => {
    const key = `items.${tool.name}.description` as const;
    return t.has(key) ? t(key) : tool.description;
  }, [t]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [detailTool, setDetailTool] = useState<{ name: string; label: string; description: string } | null>(null);
  const [internalSelected, setInternalSelected] = useState<Set<BuiltInAgentToolName>>(new Set());
  const [agentsWithTools, setAgentsWithTools] = useState<Array<{ id: string; name: string; avatarUrl?: string; tools: string[] }>>([]);
  const [filterAgentId, setFilterAgentId] = useState('');

  useEffect(() => {
    if (open || standalone) {
      sdk.agent.listPresets()
        .then((data) => {
          setAgentsWithTools((data as AgentToolsPreset[]).map((a) => ({
            id: a.id,
            name: a.name || a.id,
            avatarUrl: a.avatarUrl,
            tools: Array.isArray(a.tools) ? a.tools : [],
          })));
        })
        .catch(() => {});
    }
  }, [open, standalone]);

  const selected = selectable ? new Set<BuiltInAgentToolName>(externalSelected ?? internalSelected) : new Set<BuiltInAgentToolName>();

  const toggleTool = (toolName: BuiltInAgentToolName) => {
    const next = new Set<BuiltInAgentToolName>(selected);
    if (next.has(toolName)) {
      next.delete(toolName);
    } else {
      next.add(toolName);
    }
    if (onSelectedToolsChange) {
      onSelectedToolsChange(ALL_TOOLS.map((t) => t.name).filter((n) => next.has(n)));
    } else {
      setInternalSelected(next);
    }
  };

  const searchableTools = useMemo(() => {
    let tools = ALL_TOOLS;
    if (filterAgentId) {
      const agent = agentsWithTools.find((a) => a.id === filterAgentId);
      if (agent) {
        const agentTools = new Set(agent.tools);
        tools = tools.filter((t) => agentTools.has(t.name));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tools = tools.filter((t) => toolLabel(t).toLowerCase().includes(q) || toolDesc(t).toLowerCase().includes(q));
    }
    return [...tools].sort(compareTools);
  }, [filterAgentId, searchQuery, agentsWithTools, toolDesc, toolLabel]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<BuiltInAgentToolCategoryName, number>> = {};
    for (const tool of searchableTools) {
      if (!tool.category) continue;
      counts[tool.category] = (counts[tool.category] ?? 0) + 1;
    }
    return counts;
  }, [searchableTools]);

  const filteredTools = useMemo(() => {
    if (activeCategory === 'all') return searchableTools;
    return searchableTools.filter((tool) => tool.category === activeCategory);
  }, [activeCategory, searchableTools]);

  const mainBody = (
    <>
      <DialogHeader className="shrink-0">
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('title')}</DialogDescription>
      </DialogHeader>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 pt-2">
        {/* Left: Categories */}
        <div className="hidden md:flex w-44 shrink-0 flex-col gap-1">
          <Button
            variant={activeCategory === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="justify-start"
            onClick={() => setActiveCategory('all')}
          >
            <Wrench className="size-3.5 mr-1.5" />
            {t('filterAll')}
            <span className="ml-auto text-[10px] text-muted-foreground">{searchableTools.length}</span>
          </Button>
          {TOOL_CATEGORIES.map(({ key, icon: Icon }) => (
            <Button
              key={key}
              variant={activeCategory === key ? 'secondary' : 'ghost'}
              size="sm"
              className="justify-start"
              onClick={() => setActiveCategory(key)}
            >
              <Icon className="size-3.5 mr-1.5" />
              {t(`categories.${key}`)}
              <span className="ml-auto text-[10px] text-muted-foreground">{categoryCounts[key] ?? 0}</span>
            </Button>
          ))}

          {/* Agent filter section */}
          {agentsWithTools.length > 0 && (
            <div className="space-y-1 mt-2">
              <p className="text-xs font-medium text-muted-foreground px-2">{t('filterByAgent')}</p>
              {agentsWithTools.map((a) => (
                <Button
                  key={a.id}
                  variant={filterAgentId === a.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setFilterAgentId(filterAgentId === a.id ? '' : a.id)}
                >
                  <AgentIcon agentId={a.id} name={a.name} avatarUrl={a.avatarUrl} className="size-4 mr-1.5 rounded-full" />
                  <span className="truncate">{a.name}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Tool cards */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Mobile: top filters */}
          <div className="flex md:hidden flex-col gap-2">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('search')} className="pl-8" />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button type="button" className={cn('shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors', activeCategory === 'all' ? 'bg-muted' : 'text-muted-foreground hover:text-foreground', "cursor-pointer")} onClick={() => setActiveCategory('all')}>
                {t('filterAll')} ({searchableTools.length})
              </button>
              {TOOL_CATEGORIES.map(({ key }) => (
                <button key={key} type="button" className={cn('shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors', activeCategory === key ? 'bg-muted' : 'text-muted-foreground hover:text-foreground', "cursor-pointer")} onClick={() => setActiveCategory(key)}>
                  {t(`categories.${key}`)} ({categoryCounts[key] ?? 0})
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: search */}
          <div className="hidden md:block relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('search')} className="pl-8" />
          </div>

          {selectable && filteredTools.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t('enabledCount', { count: filteredTools.filter((t) => selected.has(t.name)).length, total: filteredTools.length })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  const allSelected = filteredTools.every((t) => selected.has(t.name));
                  const next = new Set<BuiltInAgentToolName>(selected);
                  if (allSelected) {
                    filteredTools.forEach((t) => next.delete(t.name));
                  } else {
                    filteredTools.forEach((t) => next.add(t.name));
                  }
                  if (onSelectedToolsChange) {
                    onSelectedToolsChange(ALL_TOOLS.map((t) => t.name).filter((n) => next.has(n)));
                  } else {
                    setInternalSelected(next);
                  }
                }}
              >
                {filteredTools.every((t) => selected.has(t.name)) ? t('deselectAll') : t('selectAll')}
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1">
            {filteredTools.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('empty')}</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 pr-2">
                {filteredTools.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-lg border border-border bg-background px-3 py-2 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => {
                      if (selectable) {
                        toggleTool(tool.name);
                      } else {
                        setDetailTool(tool);
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {selectable && (
                        <input
                          type="checkbox"
                          checked={selected.has(tool.name)}
                          onChange={() => toggleTool(tool.name)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 size-3.5 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-medium">{toolLabel(tool)}</span>
                        <span className="block text-[11px] text-muted-foreground line-clamp-2">{toolDesc(tool)}</span>
                        {(() => {
                          const boundAgents = agentsWithTools.filter((a) => a.tools.includes(tool.name));
                          if (boundAgents.length === 0) return null;
                          return (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[10px] text-muted-foreground mr-0.5">{t('boundTo')}:</span>
                              {boundAgents.map((a) => (
                                <AgentIcon key={a.id} agentId={a.id} name={a.name} avatarUrl={a.avatarUrl} className="size-3.5 rounded-full" />
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      {selectable && (
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setDetailTool(tool); }}
                        >
                          <Search className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </>
  );

  return (
    <>
      {standalone && open && (
        <div className="h-full flex flex-col">
          {mainBody}
        </div>
      )}
      {!standalone && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
            {mainBody}
          </DialogContent>
        </Dialog>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailTool} onOpenChange={(v) => { if (!v) setDetailTool(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailTool ? toolLabel(detailTool) : null}</DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground">{detailTool?.name}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">{detailTool ? toolDesc(detailTool) : null}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
