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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileUpload, type FileUploadFile } from '@/components/ui/file-upload';
import { SearchSelect } from '@/components/ui/search-select';
import { AgentIcon } from '@/components/common/agent-icon';
import {
  Star,
  StarOff,
  Upload,
  Search,
  FileText,
  X,
  MoreVertical,
  Trash2,
  Rocket,
  Save,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/lib/monaco-loader';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading editor...</div> },
);

interface BoundAgent {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface SkillInfo {
  name: string;
  description: string;
  filename: string;
  content: string;
  favorited: boolean;
  boundAgents: BoundAgent[];
}

interface AgentCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
}

interface SkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
}

type FilterMode = 'all' | 'favorites' | 'agent';

interface SkillSyncItem {
  agentId: string;
  agentName: string;
  skillName: string;
  globalMtime: string;
  agentMtime: string;
}

export function SkillsDialog({ open, onOpenChange, standalone }: SkillsDialogProps) {
  const t = useTranslations('skills');
  const tc = useTranslations('common');

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [agents, setAgents] = useState<AgentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterAgentId, setFilterAgentId] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);
  const [bindDialogSkill, setBindDialogSkill] = useState<SkillInfo | null>(null);
  const [bindSelected, setBindSelected] = useState<string[]>([]);
  const [editSkill, setEditSkill] = useState<SkillInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [syncItems, setSyncItems] = useState<SkillSyncItem[]>([]);
  const [syncSelected, setSyncSelected] = useState<Set<string>>(new Set());
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/skills');
      if (res.ok) {
        setSkills(await res.json());
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
    if (open || standalone) {
      fetchSkills();
      fetchAgents();
    }
  }, [open, standalone, fetchSkills, fetchAgents]);

  const handleToggleFavorite = async (skill: SkillInfo) => {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}/favorite`, { method: 'POST' });
      if (res.ok) {
        const { favorited } = await res.json();
        setSkills((prev) =>
          prev.map((s) => s.name === skill.name ? { ...s, favorited } : s),
        );
      }
    } catch { /* ignore */ }
  };

  const handleImport = async () => {
    for (const item of uploadFiles) {
      const content = await item.file.text();
      await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: item.file.name, content }),
      });
    }
    setUploadFiles([]);
    setImportOpen(false);
    fetchSkills();
  };

  const openBindDialog = (skill: SkillInfo) => {
    setBindDialogSkill(skill);
    setBindSelected(skill.boundAgents.map((a) => a.id));
  };

  const openEditDialog = (skill: SkillInfo) => {
    setEditSkill(skill);
    setEditContent(skill.content);
  };

  const handleSaveEdit = async () => {
    if (!editSkill) return;
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(editSkill.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setSkills((prev) =>
          prev.map((s) => s.name === editSkill.name ? { ...s, content: editContent } : s),
        );
        setEditSkill(null);
      }
    } catch { /* ignore */ }
  };

  const handleDeleteSkill = async (skill: SkillInfo) => {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}`, { method: 'DELETE' });
      if (res.ok) {
        setSkills((prev) => prev.filter((s) => s.name !== skill.name));
      }
    } catch { /* ignore */ }
  };

  const handleBindConfirm = async () => {
    if (!bindDialogSkill) return;

    for (const agent of agents) {
      const wasBound = bindDialogSkill.boundAgents.some((a) => a.id === agent.id);
      const shouldBeBound = bindSelected.includes(agent.id);

      if (wasBound && !shouldBeBound) {
        const res = await fetch(`/api/agents/presets/${agent.id}`);
        if (!res.ok) continue;
        const preset = await res.json();
        const updatedSkills = (preset.skills || []).filter(
          (s: string) => s.replace(/\.md$/i, '') !== bindDialogSkill.name,
        );
        console.log('[skills] remove skill', bindDialogSkill.name, 'from agent', agent.name, 'updatedSkills:', updatedSkills);
        await fetch(`/api/agents/presets/${agent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...preset, skills: updatedSkills }),
        });
      } else if (!wasBound && shouldBeBound) {
        const res = await fetch(`/api/agents/presets/${agent.id}`);
        if (!res.ok) continue;
        const preset = await res.json();
        const existing = (preset.skills || []).map((s: string) => s.replace(/\.md$/i, ''));
        if (!existing.includes(bindDialogSkill.name)) {
          const updatedSkills = [...(preset.skills || []), `${bindDialogSkill.name}.md`];
          console.log('[skills] add skill', bindDialogSkill.name, 'to agent', agent.name, 'updatedSkills:', updatedSkills);
          await fetch(`/api/agents/presets/${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...preset, skills: updatedSkills }),
          });
        }
      }
    }

    setBindDialogSkill(null);
    fetchSkills();
  };

  const toggleBindAgent = (id: string) => {
    setBindSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSyncCheck = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch('/api/skills/sync-check');
      if (res.ok) {
        const items: SkillSyncItem[] = await res.json();
        setSyncItems(items);
        setSyncSelected(new Set(items.map((item) => `${item.agentId}::${item.skillName}`)));
        setSyncOpen(true);
      }
    } catch { /* ignore */ }
    setSyncLoading(false);
  };

  const handleSyncConfirm = async () => {
    const items = syncItems.filter((item) => syncSelected.has(`${item.agentId}::${item.skillName}`));
    if (items.length === 0) return;
    try {
      const res = await fetch('/api/skills/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map((i) => ({ agentId: i.agentId, skillName: i.skillName })) }),
      });
      if (res.ok) {
        setSyncOpen(false);
        fetchSkills();
      }
    } catch { /* ignore */ }
  };

  const toggleSyncItem = (agentId: string, skillName: string) => {
    const key = `${agentId}::${skillName}`;
    setSyncSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Filtering
  const filtered = skills.filter((skill) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!skill.name.toLowerCase().includes(q) && !skill.content.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterMode === 'favorites' && !skill.favorited) return false;
    if (filterMode === 'agent' && filterAgentId) {
      if (!skill.boundAgents.some((a) => a.id === filterAgentId)) return false;
    }
    return true;
  });

  const showMainDialog = (standalone || open) && !bindDialogSkill && !editSkill;

  // Extract main body content (DialogHeader + filters + cards)
  const mainBody = (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <div className="hidden md:block">
            {standalone
              ? <h2 className="text-base font-semibold">{t('title')}</h2>
              : <DialogTitle>{t('title')}</DialogTitle>
            }
            {standalone
              ? <p className="text-xs text-muted-foreground">{t('description')}</p>
              : <DialogDescription>{t('description')}</DialogDescription>
            }
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0 pt-2">
            <Button variant="outline" size="sm" onClick={handleSyncCheck} disabled={syncLoading}>
              <RefreshCw className={cn("size-3.5 mr-1", syncLoading && "animate-spin")} />
              {t('syncToAgents')}
            </Button>
            <Popover open={importOpen} onOpenChange={setImportOpen}>
            <PopoverTrigger render={
              <Button variant="outline" size="sm">
                <Upload className="size-3.5 mr-1" />
                {t('import')}
              </Button>
            } />
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <p className="text-sm font-medium">{t('importTitle')}</p>
                <FileUpload
                  value={uploadFiles}
                  onChange={setUploadFiles}
                  accept={{ 'text/markdown': ['.md'], '': ['.md'] }}
                  placeholder={t('importPlaceholder')}
                  maxFiles={10}
                />
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={uploadFiles.length === 0}
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
        {/* Desktop: Left sidebar filters */}
        <div className="hidden md:flex w-44 shrink-0 flex-col gap-3">
          <div className="space-y-1">
            <Button
              variant={filterMode === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start"
              onClick={() => { setFilterMode('all'); setFilterAgentId(''); }}
            >
              <FileText className="size-3.5 mr-1.5" />
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

        {/* Right: Skill cards */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Mobile: Top filters */}
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

          {/* Desktop: Search bar */}
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
                {filtered.map((skill) => (
                  <div
                    key={skill.name}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => openEditDialog(skill)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{skill.name}</span>
                          <button
                            type="button"
                            className="flex items-center justify-center size-5 rounded hover:bg-accent"
                            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(skill); }}
                          >
                            {skill.favorited ? (
                              <Star className="size-3.5 text-yellow-500 fill-yellow-500" />
                            ) : (
                              <StarOff className="size-3.5 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {skill.description || skill.content.slice(0, 120).replace(/^#\s+/, '')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openBindDialog(skill)}
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
                              onClick={() => handleDeleteSkill(skill)}
                            >
                              <Trash2 className="size-3.5 mr-1.5" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Bound agents */}
                    {skill.boundAgents.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border/50">
                        {skill.boundAgents.map((agent) => (
                          <AgentIcon
                            key={agent.id}
                            agentId={agent.id}
                            name={agent.name}
                            avatarUrl={agent.avatarUrl}
                            className="size-5 rounded-full"
                          />
                        ))}
                        <span className="text-xs text-muted-foreground ml-1">
                          {skill.boundAgents.length}
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
    </>
  );

  return (
    <>
      {/* Main Skills - standalone or dialog */}
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

      {/* Edit Skill Dialog */}
      <Dialog open={!!editSkill} onOpenChange={(v) => { if (!v) setEditSkill(null); }}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>{t('editTitle', { name: editSkill?.name || '' })}</DialogTitle>
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
              language="markdown"
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
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Bind Agent Dialog */}
      <Dialog open={!!bindDialogSkill} onOpenChange={(v) => { if (!v) setBindDialogSkill(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('bindTitle', { name: bindDialogSkill?.name || '' })}</DialogTitle>
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
              <Button variant="outline" onClick={() => setBindDialogSkill(null)}>
                {tc('cancel')}
              </Button>
              <Button onClick={handleBindConfirm}>
                {tc('confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync to Agents Dialog */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('syncTitle')}</DialogTitle>
            <DialogDescription>{t('syncDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {syncItems.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                {t('syncEmpty')}
              </div>
            ) : (
              <ScrollArea className="max-h-72">
                <div className="space-y-1">
                  {syncItems.map((item) => {
                    const key = `${item.agentId}::${item.skillName}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSyncItem(item.agentId, item.skillName)}
                        className="flex items-center gap-3 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm transition-colors"
                      >
                        <div
                          className={cn(
                            'flex items-center justify-center size-4 rounded border shrink-0',
                            syncSelected.has(key)
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-input',
                          )}
                        />
                        <AgentIcon agentId={item.agentId} name={item.agentName} className="size-5 rounded-full" />
                        <span className="min-w-0 flex-1 truncate">{item.agentName}</span>
                        <span className="text-muted-foreground text-xs shrink-0">{item.skillName}.md</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
            {syncItems.length > 0 && (
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setSyncOpen(false)}>
                  {tc('cancel')}
                </Button>
                <Button onClick={handleSyncConfirm} disabled={syncSelected.size === 0}>
                  {t('syncConfirm')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
