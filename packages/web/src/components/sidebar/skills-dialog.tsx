'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { AgentIcon } from '@/components/common/agent-icon';
import {
  Star,
  StarOff,
  Plus,
  Upload,
  Search,
  FileText,
  X,
  MoreVertical,
  Trash2,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

type FilterMode = 'all' | 'favorites' | 'agent';

export function SkillsDialog({ open, onOpenChange }: SkillsDialogProps) {
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
    if (open) {
      fetchSkills();
      fetchAgents();
    }
  }, [open, fetchSkills, fetchAgents]);

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
        // remove skill from agent
        const res = await fetch(`/api/agents/presets/${agent.id}`);
        if (!res.ok) continue;
        const preset = await res.json();
        const updatedSkills = (preset.skills || []).filter(
          (s: string) => s.replace(/\.md$/i, '') !== bindDialogSkill.name,
        );
        await fetch(`/api/agents/presets/${agent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...preset, skills: updatedSkills }),
        });
      } else if (!wasBound && shouldBeBound) {
        // add skill to agent
        const res = await fetch(`/api/agents/presets/${agent.id}`);
        if (!res.ok) continue;
        const preset = await res.json();
        const existing = (preset.skills || []).map((s: string) => s.replace(/\.md$/i, ''));
        if (!existing.includes(bindDialogSkill.name)) {
          const updatedSkills = [...(preset.skills || []), `${bindDialogSkill.name}.md`];
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

  return (
    <>
      <Dialog open={open && !bindDialogSkill} onOpenChange={onOpenChange}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>{t('title')}</DialogTitle>
                <DialogDescription>{t('description')}</DialogDescription>
              </div>
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
                    {filtered.map((skill) => (
                      <div
                        key={skill.name}
                        className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{skill.name}</span>
                              {skill.favorited && (
                                <Star className="size-3.5 text-yellow-500 fill-yellow-500" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {skill.description || skill.content.slice(0, 120).replace(/^#\s+/, '')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleToggleFavorite(skill)}
                            >
                              {skill.favorited ? (
                                <Star className="size-3.5 text-yellow-500 fill-yellow-500" />
                              ) : (
                                <StarOff className="size-3.5 text-muted-foreground" />
                              )}
                            </Button>
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
                                  onSelect={() => handleDeleteSkill(skill)}
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
            <Input
              placeholder={t('searchAgents')}
              disabled
              className="opacity-60"
              value=""
            />
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
    </>
  );
}
