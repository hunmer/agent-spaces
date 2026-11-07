'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Workflow } from '@agent-spaces/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import {
  Layers, Loader2, Search, Tag, User, Wrench,
} from 'lucide-react';
import { resolveServerAssetUrl } from '@/lib/server';
import { PluginIcon } from './workflow-plugin-icon';

type PickerPlugin = WorkflowPlugin & {
  nodeCount: number;
};

export function WorkflowPluginPickerDialog({
  open,
  onOpenChange,
  workflow,
  onWorkflowChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow;
  onWorkflowChange: (workflow: Workflow) => void;
}) {
  const [plugins, setPlugins] = useState<PickerPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('__all__');
  const t = useTranslations('workflows');

  const enabledSet = useMemo(() => new Set(workflow.enabledPlugins || []), [workflow.enabledPlugins]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadPlugins() {
      setLoading(true);
      try {
        const list = await pluginApi.listWorkflowPlugins();
        const withCounts = await Promise.all(list.map(async (plugin) => {
          try {
            const nodes = await pluginApi.getWorkflowNodes(plugin.id);
            return { ...plugin, nodeCount: nodes.length };
          } catch {
            return { ...plugin, nodeCount: 0 };
          }
        }));
        if (!cancelled) setPlugins(withCounts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPlugins();
    return () => { cancelled = true; };
  }, [open]);

  const typeOptions = useMemo(() => {
    const types = new Set(plugins.map(plugin => plugin.type).filter(Boolean));
    return ['all', ...Array.from(types)] as string[];
  }, [plugins]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plugin of plugins) {
      for (const tag of plugin.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [plugins]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      if (typeFilter !== 'all' && plugin.type !== typeFilter) return false;
      if (tagFilter !== '__all__' && !(plugin.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      return plugin.name.toLowerCase().includes(q)
        || plugin.description.toLowerCase().includes(q)
        || (plugin.tags || []).some(tag => tag.toLowerCase().includes(q));
    });
  }, [plugins, query, tagFilter, typeFilter]);

  function togglePlugin(pluginId: string) {
    const next = new Set(workflow.enabledPlugins || []);
    if (next.has(pluginId)) next.delete(pluginId);
    else next.add(pluginId);
    onWorkflowChange({ ...workflow, enabledPlugins: Array.from(next) });
  }

  function typeLabel(type: string) {
    if (type === 'all') return t('pluginPicker.typeAll');
    if (type === 'server') return t('pluginPicker.typeServer');
    if (type === 'client') return t('pluginPicker.typeClient');
    return type;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('pluginPicker.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('pluginPicker.searchPlaceholder')}
              className="h-8 pl-8"
            />
          </div>
          {tags.length > 0 && (
            <Select value={tagFilter} onValueChange={(value) => setTagFilter(value || '__all__')}>
              <SelectTrigger className="h-8 w-[140px] shrink-0 text-xs">
                <SelectValue placeholder={t('pluginPicker.filterByTag')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('pluginPicker.allTags')}</SelectItem>
                {tags.map(tag => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap gap-1 px-1">
          {typeOptions.map(type => (
            <Button
              key={type}
              variant={typeFilter === type ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setTypeFilter(type)}
            >
              {typeLabel(type)}
            </Button>
          ))}
        </div>

        <ScrollArea className="max-h-[400px]">
          <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 lg:grid-cols-4">
            {loading && (
              <div className="col-span-full flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('pluginPicker.loading')}
              </div>
            )}
            {!loading && filtered.map((plugin) => {
              const enabled = enabledSet.has(plugin.id);
              const iconSource = plugin.iconPath
                ? { type: 'url' as const, url: resolveServerAssetUrl(`/api/plugins/${encodeURIComponent(plugin.id)}/icon`) }
                : { type: 'builtin' as const, variant: 'local' as const };
              return (
                <HoverCard key={plugin.id} openDelay={400} closeDelay={150}>
                  <HoverCardTrigger>
                    <button
                      type="button"
                      className={`flex min-h-[124px] w-full cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 transition-all hover:border-primary/30 hover:bg-muted/50 ${
                        enabled ? 'border-primary/50 bg-primary/5' : 'border-border'
                      }`}
                      onClick={() => togglePlugin(plugin.id)}
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                        enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                      >
                        <PluginIcon source={iconSource} className="h-5 w-5" />
                      </div>
                      <span className="w-full truncate text-center text-xs font-medium leading-tight">
                        {plugin.name}
                      </span>
                      {enabled && <Badge variant="default" className="h-4 px-1.5 py-0 text-[10px]">{t('pluginPicker.enabled')}</Badge>}
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72" side="top">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-sm font-semibold">{plugin.name}</h4>
                        <Badge variant={enabled ? 'default' : 'secondary'} className="text-[10px]">
                          {t('pluginPicker.nodeCount', { count: plugin.nodeCount })}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{plugin.description}</p>
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        {plugin.author?.name && (
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 opacity-70" />
                            <span>{plugin.author.name}</span>
                          </div>
                        )}
                        {plugin.version && (
                          <div className="flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 opacity-70" />
                            <span>v{plugin.version}</span>
                          </div>
                        )}
                        {plugin.type && (
                          <div className="flex items-center gap-1.5">
                            <Wrench className="h-3.5 w-3.5 opacity-70" />
                            <span>{t('pluginPicker.typePlugin', { type: typeLabel(plugin.type) })}</span>
                          </div>
                        )}
                        {plugin.tags?.length ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            {plugin.tags.map(tag => (
                              <Badge key={tag} variant="outline" className="h-4 px-1 py-0 text-[10px] font-normal">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p className="border-t pt-1 text-[10px] text-muted-foreground/70">
                        {t('pluginPicker.clickToToggle', { action: t(enabled ? 'pluginPicker.disable' : 'pluginPicker.enable') })}
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
            {!loading && filtered.length === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                {query ? t('pluginPicker.noMatch') : t('pluginPicker.noAvailable')}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
