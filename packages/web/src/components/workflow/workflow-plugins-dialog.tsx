'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workflow } from '@agent-spaces/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchStoreIndex, resolveStoreUrl } from '@/lib/agent-store';
import { pluginApi, type StoreWorkflowPlugin, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { toPinyinSearchKey } from '@/lib/utils';
import {
  ArrowDownUp, PackagePlus, RefreshCw, Search, Store,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LocalPluginCard, StorePluginCard } from './workflow-plugin-card';
import { WorkflowPluginConfigDialog } from './workflow-plugin-config-dialog';
import { useLocale } from '@/components/layout/locale-provider';

type PluginTab = 'local' | 'store';
type SortBy = 'default' | 'name' | 'status' | 'time';

function compareVersion(left: string | undefined, right: string | undefined): number {
  const parse = (value: string | undefined) => String(value || '0')
    .trim()
    .replace(/^[vV]/, '')
    .split(/[.+-]/)
    .map(part => {
      const match = part.match(/^\d+/);
      return match ? Number(match[0]) : 0;
    });

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function WorkflowPluginsDialog({
  open,
  onOpenChange,
  workflow,
  onWorkflowChange,
  missingPluginIds = [],
  initialSearch = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow | null;
  onWorkflowChange: (workflow: Workflow) => void;
  missingPluginIds?: string[];
  initialSearch?: string;
}) {
  const [activeTab, setActiveTab] = useState<PluginTab>('local');
  const [plugins, setPlugins] = useState<WorkflowPlugin[]>([]);
  const [storePlugins, setStorePlugins] = useState<StoreWorkflowPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('__all__');
  const [status, setStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [configPlugin, setConfigPlugin] = useState<WorkflowPlugin | null>(null);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string[]>([]);
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const pendingRef = useRef<string[]>([]);
  const inFlightRef = useRef<Set<string>>(new Set());
  const failedRef = useRef<Set<string>>(new Set());
  const successCountRef = useRef(0);
  const failCountRef = useRef(0);
  const { locale } = useLocale();
  const t = useTranslations('workflows.pluginsDialog');

  const enabledPluginIds = useMemo(() => new Set(workflow?.enabledPlugins || []), [workflow?.enabledPlugins]);
  const installedPluginIds = useMemo(() => new Set(plugins.map(plugin => plugin.id)), [plugins]);
  const missingInstalledPlugins = useMemo(() => missingPluginIds
    .map(id => plugins.find(plugin => plugin.id === id))
    .filter((plugin): plugin is WorkflowPlugin => Boolean(plugin)), [missingPluginIds, plugins]);
  const missingUninstalledPluginIds = useMemo(() => missingPluginIds
    .filter(id => !installedPluginIds.has(id)), [missingPluginIds, installedPluginIds]);
  const workflowStorePlugins = useMemo(() => storePlugins.filter(plugin => plugin.hasWorkflow), [storePlugins]);
  const sourcePlugins = activeTab === 'store' ? workflowStorePlugins : plugins;

  const storePluginById = useMemo(() => new Map(storePlugins.map(p => [p.id, p])), [storePlugins]);
  const needsUpdateMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const plugin of plugins) {
      const sp = storePluginById.get(plugin.id);
      if (sp?.version && compareVersion(sp.version, plugin.version) > 0) map.set(plugin.id, true);
    }
    return map;
  }, [plugins, storePluginById]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const plugin of sourcePlugins) {
      for (const item of plugin.tags || []) set.add(item);
    }
    return Array.from(set).sort();
  }, [sourcePlugins]);

  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = plugins.filter((plugin) => {
      if (q && !plugin.id.toLowerCase().includes(q) && !plugin.name.toLowerCase().includes(q) && !plugin.description.toLowerCase().includes(q) && !toPinyinSearchKey(plugin.name).includes(q) && !toPinyinSearchKey(plugin.description).includes(q)) return false;
      if (tag !== '__all__' && !(plugin.tags || []).includes(tag)) return false;
      const inWorkflow = enabledPluginIds.has(plugin.id);
      if (status === 'enabled' && !inWorkflow) return false;
      if (status === 'disabled' && inWorkflow) return false;
      return true;
    });
    if (sortBy === 'default') return filtered;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'status') {
        const diff = (enabledPluginIds.has(a.id) ? 0 : 1) - (enabledPluginIds.has(b.id) ? 0 : 1);
        if (diff !== 0) return diff;
      }
      if (sortBy === 'time') {
        return (b.installedAt ?? 0) - (a.installedAt ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  }, [plugins, query, tag, status, enabledPluginIds, sortBy]);

  const filteredStore = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = workflowStorePlugins.filter((plugin) => {
      if (q && !plugin.id.toLowerCase().includes(q) && !plugin.name.toLowerCase().includes(q) && !plugin.description.toLowerCase().includes(q) && !toPinyinSearchKey(plugin.name).includes(q) && !toPinyinSearchKey(plugin.description).includes(q)) return false;
      if (tag !== '__all__' && !(plugin.tags || []).includes(tag)) return false;
      return true;
    });
    if (sortBy === 'default') return filtered;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'status') {
        const diff = (installedPluginIds.has(a.id) ? 0 : 1) - (installedPluginIds.has(b.id) ? 0 : 1);
        if (diff !== 0) return diff;
      }
      if (sortBy === 'time') {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      }
      return a.name.localeCompare(b.name);
    });
  }, [workflowStorePlugins, query, tag, installedPluginIds, sortBy]);

  async function loadPlugins() {
    setLoading(true);
    try {
      setPlugins(await pluginApi.listWorkflowPlugins());
    } finally {
      setLoading(false);
    }
  }

  async function loadStorePlugins() {
    setStoreLoading(true);
    try {
      try {
        const data = await fetchStoreIndex<StoreWorkflowPlugin>(`plugins/index_${locale}.json`);
        setStorePlugins(data);
      } catch {
        setStorePlugins(await fetchStoreIndex<StoreWorkflowPlugin>('plugins/index.json'));
      }
    } catch {
      setStorePlugins([]);
    } finally {
      setStoreLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadPlugins();
    void loadStorePlugins();
  }, [open, locale]);

  // 仅在对话框打开时按传入的初始词初始化一次搜索；安装插件会让父组件的
  // missingPluginSearch(=initialSearch) 变化，不应反复重置用户当前的搜索状态
  useEffect(() => {
    if (!open) return;
    const keyword = initialSearch.trim();
    if (!keyword) return;
    setActiveTab('store');
    setQuery(keyword);
    setTag('__all__');
    setStatus('all');
    setSortBy('default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function updateWorkflowPlugins(pluginId: string, enabled: boolean) {
    if (!workflow) return;
    const current = new Set(workflow.enabledPlugins || []);
    if (enabled) current.add(pluginId);
    else current.delete(pluginId);
    onWorkflowChange({ ...workflow, enabledPlugins: Array.from(current) });
  }

  async function togglePlugin(plugin: WorkflowPlugin) {
    const nextEnabled = !enabledPluginIds.has(plugin.id);
    if (nextEnabled && !plugin.enabled) {
      await pluginApi.enable(plugin.id);
      setPlugins(items => items.map(item => item.id === plugin.id ? { ...item, enabled: true } : item));
    }

    if (!workflow) return;

    const enabledSet = new Set(workflow.enabledPlugins || []);
    if (nextEnabled) enabledSet.add(plugin.id);
    else enabledSet.delete(plugin.id);

    let nodes = workflow.nodes;
    if (nextEnabled) {
      try {
        const nodeDefs = await pluginApi.getWorkflowNodes(plugin.id);
        if (nodeDefs.length) {
          const defMap = new Map(nodeDefs.map(d => [d.type, d]));
          nodes = workflow.nodes.map(node => {
            const def = defMap.get(node.type);
            if (!def) return node;
            const newData = {
              ...((def as typeof def & { data?: Record<string, unknown> }).data || {}),
              ...node.data,
            };
            for (const prop of def.properties || []) {
              if (prop.default !== undefined && !(prop.key in newData)) {
                newData[prop.key] = prop.default;
              }
            }
            return { ...node, data: newData };
          });
        }
      } catch { /* best-effort */ }
    }

    onWorkflowChange({ ...workflow, enabledPlugins: Array.from(enabledSet), nodes });
  }

  async function uninstallPlugin(plugin: WorkflowPlugin) {
    try {
      await pluginApi.uninstall(plugin.id, plugin.type);
      toast.success(t('uninstalled', { name: plugin.name }));
    } catch (error: any) {
      toast.warning(error?.message || t('uninstallFailed'));
    }
    setPlugins(items => items.filter(item => item.id !== plugin.id));
    updateWorkflowPlugins(plugin.id, false);
  }

  async function installPlugin(plugin: StoreWorkflowPlugin) {
    if (installingIds.has(plugin.id)) return;
    setInstallingIds(prev => new Set(prev).add(plugin.id));
    try {
      const installed = await pluginApi.installFromStore(plugin.id, resolveStoreUrl(`plugins/${plugin.path}`), plugin.md5, plugin.type, plugin.files);
      setPlugins(items => {
        const idx = items.findIndex(item => item.id === installed.id);
        return idx >= 0 ? items.map((item, i) => i === idx ? { ...item, ...installed } : item) : [...items, installed];
      });
      updateWorkflowPlugins(installed.id, true);
      toast.success(t('installed', { name: installed.name }));
    } catch (error: any) {
      toast.error(error?.message || t('installFailed'));
    } finally {
      setInstallingIds(prev => {
        const next = new Set(prev);
        next.delete(plugin.id);
        return next;
      });
    }
  }

  function syncUpdateState() {
    setPending([...pendingRef.current]);
    setInFlight(new Set(inFlightRef.current));
    setFailedIds(new Set(failedRef.current));
  }

  const UPDATE_CONCURRENCY = 4;

  function pumpUpdate() {
    while (inFlightRef.current.size < UPDATE_CONCURRENCY) {
      const id = pendingRef.current.shift();
      if (!id) break;
      inFlightRef.current.add(id);
      void runUpdateOne(id);
    }
    syncUpdateState();
  }

  async function runUpdateOne(id: string) {
    const sp = storePluginById.get(id);
    let ok = false;
    try {
      if (sp) {
        const installed = await pluginApi.installFromStore(id, resolveStoreUrl(`plugins/${sp.path}`), sp.md5, sp.type, sp.files);
        setPlugins(items => items.map(item => item.id === installed.id ? { ...item, ...installed } : item));
        failedRef.current.delete(id);
        ok = true;
      }
    } catch {
      failedRef.current.add(id);
    } finally {
      if (ok) successCountRef.current += 1;
      else failCountRef.current += 1;
      inFlightRef.current.delete(id);
      syncUpdateState();
      // 队列与执行中均空 => 本批次结束，输出汇总
      if (pendingRef.current.length === 0 && inFlightRef.current.size === 0) {
        const s = successCountRef.current;
        const f = failCountRef.current;
        successCountRef.current = 0;
        failCountRef.current = 0;
        if (s > 0 || f > 0) {
          if (f > 0) toast.warning(t('updateSummary', { success: s, fail: f }));
          else toast.success(t('updated', { count: s }));
        }
      } else {
        pumpUpdate();
      }
    }
  }

  function enqueueUpdate(ids: string[]) {
    const existing = new Set<string>([...pendingRef.current, ...inFlightRef.current]);
    let added = 0;
    for (const id of ids) {
      if (!existing.has(id)) {
        pendingRef.current.push(id);
        added += 1;
      }
      // 重新入队视为重试，先清除上次的失败标记
      failedRef.current.delete(id);
    }
    if (added > 0) {
      pumpUpdate();
    } else {
      syncUpdateState();
    }
  }

  function removeFromQueue(id: string) {
    const idx = pendingRef.current.indexOf(id);
    if (idx < 0) return;
    pendingRef.current.splice(idx, 1);
    syncUpdateState();
  }

  function cancelUpdateAll() {
    const cancelled = pendingRef.current.length;
    if (cancelled === 0) return;
    pendingRef.current = [];
    syncUpdateState();
    toast.info(t('updateCancelled', { count: cancelled }));
  }

  function handleUpdatePlugin(plugin: WorkflowPlugin) {
    const id = plugin.id;
    // 已在等待队列中：从队列移除（正在执行中的无法移除）
    if (pending.includes(id)) {
      removeFromQueue(id);
      return;
    }
    if (inFlight.has(id)) return;
    enqueueUpdate([id]);
  }

  function handleUpdateAll() {
    enqueueUpdate(plugins.filter(p => needsUpdateMap.has(p.id)).map(p => p.id));
  }

  async function handleRefresh() {
    if (activeTab === 'store') await loadStorePlugins();
    else await Promise.all([loadPlugins(), loadStorePlugins()]);
  }

  function clearFilters() {
    setQuery('');
    setTag('__all__');
    setStatus('all');
    setSortBy('default');
  }

  function switchTab(tab: PluginTab) {
    setActiveTab(tab);
    setTag('__all__');
    setStatus('all');
    setSortBy('default');
  }

  async function enableMissingInstalledPlugins() {
    if (!workflow) return;
    const nextEnabledIds = new Set(workflow.enabledPlugins || []);
    const nextPlugins = [...plugins];
    for (const plugin of missingInstalledPlugins) {
      if (!nextEnabledIds.has(plugin.id)) {
        if (!plugin.enabled) {
          await pluginApi.enable(plugin.id);
          const index = nextPlugins.findIndex(item => item.id === plugin.id);
          if (index >= 0) nextPlugins[index] = { ...nextPlugins[index], enabled: true };
        }
        nextEnabledIds.add(plugin.id);
      }
    }
    setPlugins(nextPlugins);
    onWorkflowChange({ ...workflow, enabledPlugins: Array.from(nextEnabledIds) });
  }

  function searchStorePlugin(pluginId: string) {
    setActiveTab('store');
    setQuery(pluginId);
    setTag('__all__');
    setStatus('all');
    setSortBy('default');
  }

  const hasFilters = query || tag !== '__all__' || status !== 'all';
  const currentLoading = activeTab === 'store' ? storeLoading : loading;
  const filtered = activeTab === 'store' ? filteredStore : filteredLocal;
  const updateInProgress = pending.length > 0 || inFlight.size > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 overflow-x-hidden rounded-none p-0 sm:h-[85vh] sm:w-[80vw] sm:max-h-[85vh] sm:max-w-none sm:rounded-xl">
          <DialogHeader className="flex flex-row flex-wrap items-center gap-2 border-b px-4 py-2 pr-10">
            <DialogTitle className="text-sm font-semibold">{t('title')}</DialogTitle>
            <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
              <Button
                variant={activeTab === 'local' ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => switchTab('local')}
              >
                <PackagePlus className="h-3.5 w-3.5" />
                {t('tabLocal')}
              </Button>
              <Button
                variant={activeTab === 'store' ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => switchTab('store')}
              >
                <Store className="h-3.5 w-3.5" />
                {t('tabStore')}
              </Button>
            </div>
            <div className="flex-1" />
            {updateInProgress ? (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-orange-600 border-orange-300 hover:bg-orange-50" onClick={cancelUpdateAll} disabled={pending.length === 0}>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {t('cancelUpdate', { count: pending.length })}
              </Button>
            ) : needsUpdateMap.size > 0 && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-orange-600 border-orange-300 hover:bg-orange-50" disabled={installingIds.size > 0} onClick={handleUpdateAll}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t('updateAll', { count: needsUpdateMap.size })}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleRefresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${currentLoading ? 'animate-spin' : ''}`} />
              {t('refresh')}
            </Button>
          </DialogHeader>

          <div className="border-b px-4 py-2">
            {missingPluginIds.length > 0 && (
              <div className="mb-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{t('missingTitle')}</div>
                  <div className="text-orange-700">
                    {t('missingSummary', { added: missingInstalledPlugins.length, missing: missingUninstalledPluginIds.length })}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    {missingInstalledPlugins.length > 0 && (
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={enableMissingInstalledPlugins}>
                        {t('enableMissing')}
                      </Button>
                    )}
                    {missingUninstalledPluginIds.map(pluginId => (
                      <Button key={pluginId} variant="outline" size="sm" className="h-6 px-2 text-xs bg-white" onClick={() => searchStorePlugin(pluginId)}>
                        {t('searchPlugin', { id: pluginId })}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="h-7 pl-8 text-xs"
                />
              </div>
              {tags.length > 0 && (
                <Select value={tag} onValueChange={(value) => setTag(value || '__all__')}>
                  <SelectTrigger className="h-7 w-[140px] text-xs">
                    <SelectValue placeholder={t('filterByTag')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('allTags')}</SelectItem>
                    {tags.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {activeTab === 'local' && (
                <Select value={status} onValueChange={(value) => setStatus((value || 'all') as typeof status)}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue placeholder={t('statusAll')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('statusAll')}</SelectItem>
                    <SelectItem value="enabled">{t('statusAdded')}</SelectItem>
                    <SelectItem value="disabled">{t('statusNotAdded')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={sortBy} onValueChange={(value) => setSortBy((value || 'default') as SortBy)}>
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <ArrowDownUp className="h-3.5 w-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('sortDefault')}</SelectItem>
                  <SelectItem value="name">{t('sortName')}</SelectItem>
                  <SelectItem value="status">{activeTab === 'local' ? t('sortStatusLocal') : t('sortStatusStore')}</SelectItem>
                  <SelectItem value="time">{activeTab === 'local' ? t('sortTimeLocal') : t('sortTimeStore')}</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearFilters}>{t('clear')}</Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1" viewportClassName="overflow-x-hidden">
            <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
              {activeTab === 'local' && filteredLocal.map((plugin) => (
                <LocalPluginCard
                  key={plugin.id}
                  plugin={plugin}
                  inWorkflow={enabledPluginIds.has(plugin.id)}
                  disabled={!workflow}
                  needsUpdate={Boolean(needsUpdateMap.get(plugin.id))}
                  updateQueued={pending.includes(plugin.id) || inFlight.has(plugin.id)}
                  updating={inFlight.has(plugin.id)}
                  updateFailed={failedIds.has(plugin.id)}
                  onToggleAction={() => togglePlugin(plugin)}
                  onConfigAction={() => setConfigPlugin(plugin)}
                  onUninstallAction={() => uninstallPlugin(plugin)}
                  onUpdateAction={() => handleUpdatePlugin(plugin)}
                  projectId={workflow?.id}
                  enabledPlugins={workflow?.enabledPlugins}
                  onEnabledPluginsChange={(plugins) => {
                    if (workflow) onWorkflowChange({ ...workflow, enabledPlugins: plugins });
                  }}
                />
              ))}

              {activeTab === 'store' && filteredStore.map((plugin) => (
                <StorePluginCard
                  key={plugin.id}
                  plugin={plugin}
                  installed={installedPluginIds.has(plugin.id)}
                  installing={installingIds.has(plugin.id)}
                  onInstallAction={() => installPlugin(plugin)}
                />
              ))}

              {!currentLoading && filtered.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p className="text-sm">{activeTab === 'store' ? t('emptyStore') : t('emptyLocal')}</p>
                  <p className="mt-1 text-xs">{activeTab === 'store' ? t('emptyHintStore') : t('emptyHintLocal')}</p>
                </div>
              )}
              {currentLoading && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <RefreshCw className="mb-2 h-6 w-6 animate-spin" />
                  <p className="text-sm">{activeTab === 'store' ? t('loadingStore') : t('loadingLocal')}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <WorkflowPluginConfigDialog
        open={Boolean(configPlugin)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setConfigPlugin(null); }}
        pluginId={configPlugin?.id || null}
        pluginName={configPlugin?.name || ''}
        config={configPlugin?.config || []}
      />
    </>
  );
}
