'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { fetchStoreIndex, getStoreApiBase } from '@/lib/agent-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchSelect } from '@/components/ui/search-select';
import { AgentIcon } from '@/components/common/agent-icon';
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import {
  Star,
  StarOff,
  Upload,
  Search,
  Plug,
  MoreVertical,
  Trash2,
  Rocket,
  Save,
  Store,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  [key: string]: unknown;
}

interface BoundAgent {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface McpServerInfo {
  name: string;
  description: string;
  config: McpServerConfig;
  favorited: boolean;
  boundAgents: BoundAgent[];
}

interface AgentCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
}

interface StoreMcp {
  id: string;
  name: string;
  description: string;
  filename: string;
  needsEnv?: string[];
}

interface McpsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
  selectable?: boolean;
  selectedMcps?: string[];
  onSelectedMcpsChange?: (names: string[], configs: Record<string, McpServerConfig>) => void;
}

type TabType = 'local' | 'store';
type FilterMode = 'all' | 'favorites' | 'agent';

export function McpsDialog({ open, onOpenChange, standalone, selectable, selectedMcps: externalSelected, onSelectedMcpsChange }: McpsDialogProps) {
  const t = useTranslations('mcps');
  const tc = useTranslations('common');

  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [mcps, setMcps] = useState<McpServerInfo[]>([]);
  const [agents, setAgents] = useState<AgentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterAgentId, setFilterAgentId] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [bindDialogMcp, setBindDialogMcp] = useState<McpServerInfo | null>(null);
  const [editMcp, setEditMcp] = useState<McpServerInfo | null>(null);
  const [editContent, setEditContent] = useState('');

  // Store state
  const [storeMcps, setStoreMcps] = useState<StoreMcp[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());

  const fetchMcps = useCallback(async () => {
    setLoading(true);
    try {
      setMcps((await sdk.mcps.list()) as unknown as McpServerInfo[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await sdk.agent.listPresets();
      setAgents(data.map((a: AgentCandidate) => ({
        id: a.id,
        name: a.name,
        avatarUrl: a.avatarUrl,
        description: a.description,
      })));
    } catch { /* ignore */ }
  }, []);

  const fetchStoreMcps = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await fetchStoreIndex<StoreMcp>('mcps/index.json');
      setStoreMcps(data);
    } catch { /* ignore */ }
    setStoreLoading(false);
  }, []);

  useEffect(() => {
    if (open || standalone) {
      fetchMcps();
      fetchAgents();
      fetchStoreMcps();
    }
  }, [open, standalone, fetchMcps, fetchAgents, fetchStoreMcps]);

  const handleToggleFavorite = async (mcp: McpServerInfo) => {
    try {
      const { favorited } = await sdk.mcps.toggleFavorite(mcp.name);
      setMcps((prev) =>
        prev.map((m) => m.name === mcp.name ? { ...m, favorited } : m),
      );
    } catch { /* ignore */ }
  };

  const handleImport = async () => {
    setImportError('');
    try {
      JSON.parse(importText);
    } catch {
      setImportError(t('importInvalidJson'));
      return;
    }
    try {
      await sdk.mcps.importJson(importText);
      setImportText('');
      setImportOpen(false);
      fetchMcps();
    } catch {
      setImportError(t('importFailed'));
    }
  };

  const openBindDialog = (mcp: McpServerInfo) => {
    setBindDialogMcp(mcp);
  };

  const openEditDialog = (mcp: McpServerInfo) => {
    setEditMcp(mcp);
    setEditContent(JSON.stringify(mcp.config, null, 2));
  };

  const handleSaveEdit = async () => {
    if (!editMcp) return;
    let config: McpServerConfig;
    try {
      config = JSON.parse(editContent);
    } catch {
      return;
    }
    try {
      await sdk.mcps.save(editMcp.name, config);
      setMcps((prev) =>
        prev.map((m) => m.name === editMcp.name ? { ...m, config } : m),
      );
      setEditMcp(null);
    } catch { /* ignore */ }
  };

  const handleDeleteMcp = async (mcp: McpServerInfo) => {
    try {
      await sdk.mcps.delete_(mcp.name);
      setMcps((prev) => prev.filter((m) => m.name !== mcp.name));
    } catch { /* ignore */ }
  };

  const handleBindConfirm = async (selectedIds: string[]) => {
    if (!bindDialogMcp) return;

    for (const agent of agents) {
      const shouldBeBound = selectedIds.includes(agent.id);
      const preset = await sdk.agent.getPreset(agent.id) as Record<string, any>;
      if (!preset) continue;
      const mcps = (preset.mcps || {}) as Record<string, unknown>;
      const servers = { ...((mcps.mcpServers as Record<string, unknown>) || {}) };
      if (shouldBeBound) {
        servers[bindDialogMcp.name] = bindDialogMcp.config;
      } else {
        delete servers[bindDialogMcp.name];
      }
      await sdk.agent.updatePreset(agent.id, { ...preset, mcps: { ...mcps, mcpServers: servers } });
    }

    setBindDialogMcp(null);
    fetchMcps();
  };

  // Track which store mcps are already imported locally
  const importedStoreIds = new Set(mcps.map((m) => m.name));

  const handleStoreImport = async (storeItem: StoreMcp) => {
    if (importedStoreIds.has(storeItem.name) || importingIds.has(storeItem.id)) return;
    setImportingIds((prev) => new Set(prev).add(storeItem.id));
    try {
      const base = getStoreApiBase();
      const contentUrl = base
        ? `${base.replace(/\/+$/, '')}/mcps/${storeItem.filename}`
        : `/agents-store/mcps/${storeItem.filename}`;
      const contentRes = await fetch(contentUrl);
      if (!contentRes.ok) return;
      const jsonText = await contentRes.text();
      await sdk.mcps.importJson(jsonText);
      fetchMcps();
    } catch { /* ignore */ }
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(storeItem.id);
      return next;
    });
  };

  const filteredStore = storeMcps.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
  });

  // Filtering
  const filtered = mcps.filter((mcp) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!mcp.name.toLowerCase().includes(q) && !mcp.description.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterMode === 'favorites' && !mcp.favorited) return false;
    if (filterMode === 'agent' && filterAgentId) {
      if (!mcp.boundAgents.some((a) => a.id === filterAgentId)) return false;
    }
    return true;
  });

  const selectedSet = new Set(selectable ? (externalSelected ?? []) : []);
  const selectMcpNames = (names: string[]) => {
    if (!onSelectedMcpsChange) return;
    const configs = Object.fromEntries(
      mcps
        .filter((mcp) => names.includes(mcp.name))
        .map((mcp) => [mcp.name, mcp.config]),
    );
    onSelectedMcpsChange(names, configs);
  };

  const toggleMcp = (name: string) => {
    const next = [...(externalSelected ?? [])];
    if (next.includes(name)) {
      selectMcpNames(next.filter((n) => n !== name));
    } else {
      selectMcpNames([...next, name]);
    }
  };

  const showMainDialog = (standalone || open) && !bindDialogMcp && !editMcp;

  const selectableView = (
    <div className="flex-1 min-h-0 flex flex-col gap-3 pt-2">
      <div className="relative">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('search')}
          className="pl-8"
        />
      </div>
      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('enabledCount', { count: filtered.filter((m) => selectedSet.has(m.name)).length, total: filtered.length })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              const allSelected = filtered.every((m) => selectedSet.has(m.name));
              const current = [...(externalSelected ?? [])];
              if (allSelected) {
                selectMcpNames(current.filter((n) => !filtered.some((m) => m.name === n)));
              } else {
                const added = filtered.filter((m) => !current.includes(m.name)).map((m) => m.name);
                selectMcpNames([...current, ...added]);
              }
            }}
          >
            {filtered.every((m) => selectedSet.has(m.name)) ? t('deselectAll') : t('selectAll')}
          </Button>
        </div>
      )}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            {tc('loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            {t('empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 pr-2">
            {filtered.map((mcp) => (
              <div
                key={mcp.name}
                className="rounded-lg border border-border bg-background px-3 py-2 hover:bg-accent/30 transition-colors cursor-pointer"
                onClick={() => toggleMcp(mcp.name)}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(mcp.name)}
                    onChange={() => toggleMcp(mcp.name)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-medium">{mcp.name}</span>
                    <span className="block text-[11px] text-muted-foreground line-clamp-2">
                      {mcp.description || mcp.config.command || mcp.config.url || JSON.stringify(mcp.config).slice(0, 100)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const localView = selectable ? selectableView : (
    <div className="flex flex-1 min-h-0 gap-4 pt-2">
      <div className="hidden md:flex w-44 shrink-0 flex-col gap-3">
        <div className="space-y-1">
          <Button
            variant={filterMode === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full justify-start"
            onClick={() => { setFilterMode('all'); setFilterAgentId(''); }}
          >
            <Plug className="size-3.5 mr-1.5" />
            {t('filterAll')}
          </Button>
          <Button
            variant={filterMode === 'favorites' ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full justify-start"
            onClick={() => { setFilterMode('favorites'); setFilterAgentId(''); }}
          >
            <Star className="size-3.5 mr-1.5" />
            {t('filterFavorites')}
          </Button>
        </div>

        {agents.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2">{t('filterByAgent')}</p>
            <ScrollArea className="max-h-48">
              {agents.map((agent) => (
                <Button
                  key={agent.id}
                  variant={filterMode === 'agent' && filterAgentId === agent.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => { setFilterMode('agent'); setFilterAgentId(agent.id); }}
                >
                  <AgentIcon agentId={agent.id} name={agent.name} avatarUrl={agent.avatarUrl} className="size-4 mr-1.5 rounded-full" />
                  <span className="truncate">{agent.name}</span>
                </Button>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex md:hidden flex-col gap-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-input p-0.5">
              <button
                type="button"
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  filterMode === 'all' ? 'bg-muted' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => { setFilterMode('all'); setFilterAgentId(''); }}
              >
                {t('filterAll')}
              </button>
              <button
                type="button"
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  filterMode === 'favorites' ? 'bg-muted' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => { setFilterMode('favorites'); setFilterAgentId(''); }}
              >
                <Star className="size-3 inline-block mr-0.5 -mt-px" />
                {t('filterFavorites')}
              </button>
            </div>
            {agents.length > 0 && (
              <SearchSelect
                value={filterMode === 'agent' ? filterAgentId : ''}
                onChange={(v) => {
                  if (v) { setFilterMode('agent'); setFilterAgentId(v); }
                  else { setFilterMode('all'); setFilterAgentId(''); }
                }}
                options={agents.map((a) => ({ value: a.id, label: a.name }))}
                placeholder={t('filterByAgent')}
                allowCustom={false}
                className="flex-1 min-w-0"
              />
            )}
          </div>
        </div>

        <div className="hidden md:block relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search')}
            className="pl-8"
          />
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {tc('loading')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {t('empty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 pr-2">
              {filtered.map((mcp) => (
                <div
                  key={mcp.name}
                  className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => openEditDialog(mcp)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Plug className="size-3.5 text-muted-foreground" />
                        <span className="font-medium text-sm">{mcp.name}</span>
                        <button
                          type="button"
                          className="flex items-center justify-center size-5 rounded hover:bg-accent cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(mcp); }}
                        >
                          {mcp.favorited ? (
                            <Star className="size-3.5 text-yellow-500 fill-yellow-500" />
                          ) : (
                            <StarOff className="size-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {mcp.description || mcp.config.command || mcp.config.url || JSON.stringify(mcp.config).slice(0, 100)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openBindDialog(mcp)}
                      >
                        <Rocket className="size-3.5 mr-1" />
                        {t('apply')}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" className="size-7" />
                          }
                        >
                          <MoreVertical className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteMcp(mcp)}
                          >
                            <Trash2 className="size-3.5 mr-1.5" />
                            {t('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {mcp.boundAgents.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border/50">
                      {mcp.boundAgents.map((agent) => (
                        <AgentIcon
                          key={agent.id}
                          agentId={agent.id}
                          name={agent.name}
                          avatarUrl={agent.avatarUrl}
                          className="size-5 rounded-full"
                        />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">
                        {mcp.boundAgents.length}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );

  const storeView = (
    <div className="flex flex-1 min-h-0 gap-4 pt-2">
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search')}
            className="pl-8"
          />
        </div>

        <ScrollArea className="flex-1">
          {storeLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {tc('loading')}
            </div>
          ) : filteredStore.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {t('storeEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-2">
              {filteredStore.map((item) => {
                const isImported = importedStoreIds.has(item.name);
                const isImporting = importingIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Store className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{item.name}</span>
                        </div>
                        <Button
                          variant={isImported ? 'ghost' : 'outline'}
                          size="sm"
                          className="h-6 px-1.5 text-xs shrink-0"
                          disabled={isImported || isImporting}
                          onClick={() => handleStoreImport(item)}
                        >
                          {isImported ? (
                            <>{t('imported')}</>
                          ) : isImporting ? (
                            <>{t('importing')}</>
                          ) : (
                            <>
                              <Download className="size-3 mr-0.5" />
                              {t('importTo')}
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
                      {item.needsEnv && item.needsEnv.length > 0 && (
                        <p className="text-xs text-amber-500">
                          {t('needsEnv', { keys: item.needsEnv.join(', ') })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );

  const mainBody = (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between pr-8 pt-2">
          <div className="hidden md:block">
            {standalone
              ? <h2 className="text-base font-semibold">{selectable ? t('selectTitle') : t('title')}</h2>
              : <DialogTitle>{selectable ? t('selectTitle') : t('title')}</DialogTitle>
            }
            {standalone
              ? <p className="text-xs text-muted-foreground">{selectable ? t('selectDescription') : t('description')}</p>
              : <DialogDescription>{selectable ? t('selectDescription') : t('description')}</DialogDescription>
            }
          </div>
          <div className="flex items-center gap-2">
            {!selectable && activeTab === 'local' && (
              <Popover open={importOpen} onOpenChange={setImportOpen}>
                <PopoverTrigger render={
                  <Button variant="outline" size="sm">
                    <Upload className="size-3.5 mr-1" />
                    {t('import')}
                  </Button>
                } />
                <PopoverContent className="w-96" align="end">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">{t('importTitle')}</p>
                    <Textarea
                      value={importText}
                      onChange={(e) => { setImportText(e.target.value); setImportError(''); }}
                      placeholder={'{\n  "mcpServers": {\n    "server-name": {\n      "command": "npx",\n      "args": ["-y", "package"],\n      "env": {}\n    }\n  }\n}'}
                      className="font-mono text-xs min-h-[180px] resize-none"
                    />
                    {importError && (
                      <p className="text-xs text-destructive">{importError}</p>
                    )}
                    <Button
                      size="sm"
                      onClick={handleImport}
                      disabled={!importText.trim()}
                      className="w-full"
                    >
                      {t('importConfirm')}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </DialogHeader>

      {!selectable && (
        <div className="flex items-center gap-1 border-b border-border px-1">
          {([['local', Plug, t('tabLocal')], ['store', Store, t('tabStore')]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {selectable ? selectableView : (activeTab === 'local' ? localView : storeView)}
    </>
  );

  return (
    <>
      {/* Main MCPs - standalone or dialog */}
      {standalone && showMainDialog && (
        <div className="h-full flex flex-col">
          {mainBody}
        </div>
      )}
      {!standalone && (
        <Dialog open={showMainDialog} onOpenChange={onOpenChange}>
          <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
            {mainBody}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit MCP Dialog */}
      <Dialog open={!!editMcp} onOpenChange={(v) => { if (!v) setEditMcp(null); }}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>{t('editTitle', { name: editMcp?.name || '' })}</DialogTitle>
                <DialogDescription>{t('editDescription')}</DialogDescription>
              </div>
              <Button size="sm" onClick={handleSaveEdit}>
                <Save className="size-3.5 mr-1" />
                {tc('save')}
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 pt-2">
            <MonacoEditor
              height="100%"
              language="json"
              value={editContent}
              onChange={(value) => setEditContent(value || '')}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 8 },
                renderLineHighlight: 'gutter',
                wordWrap: 'on',
                formatOnPaste: true,
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Bind Agent Dialog */}
      <AgentPickerDialog
        open={!!bindDialogMcp}
        onClose={() => setBindDialogMcp(null)}
        onSubmit={handleBindConfirm}
        title={t('bindTitle', { name: bindDialogMcp?.name || '' })}
        description={t('bindDescription')}
        agents={agents}
        initialSelected={bindDialogMcp?.boundAgents.map((a) => a.id) ?? []}
        cancelText={tc('cancel')}
        confirmText={tc('confirm')}
      />
    </>
  );
}
