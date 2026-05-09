'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
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
import { AgentIcon } from '@/components/common/agent-icon';
import {
  Star,
  StarOff,
  Upload,
  Search,
  Plug,
  X,
  MoreVertical,
  Trash2,
  Rocket,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/lib/monaco-loader';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading editor...</div> },
);

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
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

interface McpsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FilterMode = 'all' | 'favorites' | 'agent';

export function McpsDialog({ open, onOpenChange }: McpsDialogProps) {
  const t = useTranslations('mcps');
  const tc = useTranslations('common');

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
  const [bindSelected, setBindSelected] = useState<string[]>([]);
  const [editMcp, setEditMcp] = useState<McpServerInfo | null>(null);
  const [editContent, setEditContent] = useState('');

  const fetchMcps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcps');
      if (res.ok) {
        setMcps(await res.json());
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/presets');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.map((a: AgentCandidate) => ({
          id: a.id,
          name: a.name,
          avatarUrl: a.avatarUrl,
          description: a.description,
        })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) {
      fetchMcps();
      fetchAgents();
    }
  }, [open, fetchMcps, fetchAgents]);

  const handleToggleFavorite = async (mcp: McpServerInfo) => {
    try {
      const res = await fetch(`/api/mcps/${encodeURIComponent(mcp.name)}/favorite`, { method: 'POST' });
      if (res.ok) {
        const { favorited } = await res.json();
        setMcps((prev) =>
          prev.map((m) => m.name === mcp.name ? { ...m, favorited } : m),
        );
      }
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
      const res = await fetch('/api/mcps/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonText: importText }),
      });
      if (res.ok) {
        setImportText('');
        setImportOpen(false);
        fetchMcps();
      } else {
        const data = await res.json();
        setImportError(data.error || t('importFailed'));
      }
    } catch {
      setImportError(t('importFailed'));
    }
  };

  const openBindDialog = (mcp: McpServerInfo) => {
    setBindDialogMcp(mcp);
    setBindSelected(mcp.boundAgents.map((a) => a.id));
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
      const res = await fetch(`/api/mcps/${encodeURIComponent(editMcp.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (res.ok) {
        setMcps((prev) =>
          prev.map((m) => m.name === editMcp.name ? { ...m, config } : m),
        );
        setEditMcp(null);
      }
    } catch { /* ignore */ }
  };

  const handleDeleteMcp = async (mcp: McpServerInfo) => {
    try {
      const res = await fetch(`/api/mcps/${encodeURIComponent(mcp.name)}`, { method: 'DELETE' });
      if (res.ok) {
        setMcps((prev) => prev.filter((m) => m.name !== mcp.name));
      }
    } catch { /* ignore */ }
  };

  const handleBindConfirm = async () => {
    if (!bindDialogMcp) return;

    for (const agent of agents) {
      const wasBound = bindDialogMcp.boundAgents.some((a) => a.id === agent.id);
      const shouldBeBound = bindSelected.includes(agent.id);

      if (wasBound && !shouldBeBound) {
        // Remove MCP from agent
        const res = await fetch(`/api/agents/presets/${agent.id}`);
        if (!res.ok) continue;
        const preset = await res.json();
        const mcps = (preset.mcps || {}) as Record<string, unknown>;
        const servers = { ...((mcps.mcpServers as Record<string, unknown>) || {}) };
        delete servers[bindDialogMcp.name];
        await fetch(`/api/agents/presets/${agent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...preset, mcps: { ...mcps, mcpServers: servers } }),
        });
      } else if (!wasBound && shouldBeBound) {
        // Add MCP to agent
        const res = await fetch(`/api/agents/presets/${agent.id}`);
        if (!res.ok) continue;
        const preset = await res.json();
        const mcps = (preset.mcps || {}) as Record<string, unknown>;
        const servers = { ...((mcps.mcpServers as Record<string, unknown>) || {}) };
        if (!(bindDialogMcp.name in servers)) {
          servers[bindDialogMcp.name] = bindDialogMcp.config;
          await fetch(`/api/agents/presets/${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...preset, mcps: { ...mcps, mcpServers: servers } }),
          });
        }
      }
    }

    setBindDialogMcp(null);
    fetchMcps();
  };

  const toggleBindAgent = (id: string) => {
    setBindSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

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

  const showMainDialog = open && !bindDialogMcp && !editMcp;

  return (
    <>
      {/* Main MCPs Dialog */}
      <Dialog open={showMainDialog} onOpenChange={onOpenChange}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>{t('title')}</DialogTitle>
                <DialogDescription>{t('description')}</DialogDescription>
              </div>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-1 min-h-0 gap-4 pt-2">
            {/* Left: Filters */}
            <div className="w-44 shrink-0 space-y-3">
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

            {/* Right: MCP cards */}
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
                                className="flex items-center justify-center size-5 rounded hover:bg-accent"
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

                        {/* Bound agents */}
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
        </DialogContent>
      </Dialog>

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
              theme="vs-dark"
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
      <Dialog open={!!bindDialogMcp} onOpenChange={(v) => { if (!v) setBindDialogMcp(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('bindTitle', { name: bindDialogMcp?.name || '' })}</DialogTitle>
            <DialogDescription>{t('bindDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleBindAgent(agent.id)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm transition-colors',
                  )}
                >
                  <AgentIcon agentId={agent.id} name={agent.name} avatarUrl={agent.avatarUrl} className="size-5 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{agent.name}</span>
                    {agent.description && (
                      <span className="block truncate text-xs text-muted-foreground">{agent.description}</span>
                    )}
                  </span>
                  <div
                    className={cn(
                      'flex items-center justify-center size-4 rounded border shrink-0',
                      bindSelected.includes(agent.id)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input',
                    )}
                  />
                </button>
              ))}
            </div>
            {bindSelected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {bindSelected.map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                      <AgentIcon agentId={id} name={agent?.name} className="size-3.5 rounded-full" />
                      {agent?.name || id}
                      <button type="button" onClick={() => toggleBindAgent(id)} className="hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setBindDialogMcp(null)}>
                {tc('cancel')}
              </Button>
              <Button onClick={handleBindConfirm}>
                {tc('confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
