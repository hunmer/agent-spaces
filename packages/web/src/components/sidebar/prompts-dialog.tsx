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
import { MemberPicker, type MemberCandidate } from '@/components/common/member-picker';
import { FileUpload, type FileUploadFile } from '@/components/ui/file-upload';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreVertical,
  Trash2,
  Rocket,
  Save,
  Plus,
  MessageSquare,
  Upload,
} from 'lucide-react';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading editor...</div> },
);

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
}

interface PromptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
}

export function PromptsDialog({ open, onOpenChange, standalone }: PromptsDialogProps) {
  const t = useTranslations('prompts');
  const tc = useTranslations('common');

  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [agents, setAgents] = useState<AgentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);

  // Apply dialog state
  const [applyTemplate, setApplyTemplate] = useState<PromptTemplate | null>(null);
  const [applySelected, setApplySelected] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  // Create/Edit dialog state
  const [editTemplate, setEditTemplate] = useState<PromptTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompt-templates');
      if (res.ok) setTemplates(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/prompt-templates/agents');
      if (res.ok) setAgents(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open || standalone) {
      fetchTemplates();
      fetchAgents();
    }
  }, [open, standalone, fetchTemplates, fetchAgents]);

  const handleImport = async () => {
    for (const item of uploadFiles) {
      const content = await item.file.text();
      const name = item.file.name.replace(/\.(md|txt|markdown)$/i, '');
      await fetch('/api/prompt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
    }
    setUploadFiles([]);
    setImportOpen(false);
    fetchTemplates();
  };

  const handleCreate = () => {
    setEditTemplate(null);
    setIsCreating(true);
    setEditName('');
    setEditContent('');
  };

  const handleEdit = (tmpl: PromptTemplate) => {
    setEditTemplate(tmpl);
    setIsCreating(false);
    setEditName(tmpl.name);
    setEditContent(tmpl.content);
  };

  const closeEditDialog = () => {
    setEditTemplate(null);
    setIsCreating(false);
    setEditName('');
    setEditContent('');
  };

  const handleSave = async () => {
    if (!editName.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      if (editTemplate) {
        const res = await fetch(`/api/prompt-templates/${editTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editName, content: editContent }),
        });
        if (res.ok) {
          const updated = await res.json();
          setTemplates((prev) => prev.map((t) => t.id === updated.id ? updated : t));
          closeEditDialog();
        }
      } else {
        const res = await fetch('/api/prompt-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editName, content: editContent }),
        });
        if (res.ok) {
          const created = await res.json();
          setTemplates((prev) => [...prev, created]);
          closeEditDialog();
        }
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (tmpl: PromptTemplate) => {
    try {
      const res = await fetch(`/api/prompt-templates/${tmpl.id}`, { method: 'DELETE' });
      if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== tmpl.id));
    } catch { /* ignore */ }
  };

  const openApplyDialog = (tmpl: PromptTemplate) => {
    setApplyTemplate(tmpl);
    setApplySelected([]);
  };

  const handleApply = async () => {
    if (!applyTemplate || applySelected.length === 0) return;
    setApplying(true);
    try {
      await fetch(`/api/prompt-templates/${applyTemplate.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds: applySelected }),
      });
      setApplyTemplate(null);
    } catch { /* ignore */ }
    setApplying(false);
  };

  const filtered = templates.filter((tmpl) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return tmpl.name.toLowerCase().includes(q) || tmpl.content.toLowerCase().includes(q);
  });

  const showMainView = (standalone || open) && !applyTemplate && !editTemplate && !isCreating;

  const agentCandidates: MemberCandidate[] = agents.map((a) => ({
    id: a.id,
    label: a.name,
    description: a.description,
  }));

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
                    accept={{ 'text/markdown': ['.md', '.txt'], '': ['.md', '.txt'] }}
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
            <Button variant="outline" size="sm" onClick={handleCreate}>
              <Plus className="size-3.5 mr-1" />
              {t('create')}
            </Button>
          </div>
        </div>
      </DialogHeader>

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
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {tc('loading')}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {t('empty')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-2">
                {filtered.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => handleEdit(tmpl)}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{tmpl.name}</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-1.5 text-xs"
                            onClick={() => openApplyDialog(tmpl)}
                          >
                            <Rocket className="size-3 mr-0.5" />
                            {t('apply')}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant="ghost" size="icon" className="size-6" />}
                            >
                              <MoreVertical className="size-3" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(tmpl)}
                              >
                                <Trash2 className="size-3 mr-1.5" />
                                {t('delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {tmpl.content.slice(0, 200).replace(/^#\s+/, '')}
                      </p>
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
      {/* Main view */}
      {standalone && showMainView && (
        <div className="h-full flex flex-col">
          {mainBody}
        </div>
      )}
      {!standalone && (
        <Dialog open={showMainView} onOpenChange={onOpenChange}>
          <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
            {mainBody}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={!!editTemplate || isCreating} onOpenChange={(v) => { if (!v) closeEditDialog(); }}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>
                  {editTemplate ? t('editTitle', { name: editTemplate.name }) : t('createTitle')}
                </DialogTitle>
                <DialogDescription>{t('editDescription')}</DialogDescription>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving || !editName.trim() || !editContent.trim()}>
                <Save className="size-3.5 mr-1" />
                {tc('save')}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-3 pb-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('namePlaceholder')}
            />
          </div>
          <div className="flex-1 min-h-0">
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

      {/* Apply to Agents Dialog */}
      <Dialog open={!!applyTemplate} onOpenChange={(v) => { if (!v) setApplyTemplate(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('applyTitle', { name: applyTemplate?.name || '' })}</DialogTitle>
            <DialogDescription>{t('applyDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <MemberPicker
              candidates={agentCandidates}
              selected={applySelected}
              onToggle={(id) => setApplySelected((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              )}
              searchPlaceholder={t('searchAgents')}
              emptyText={t('noAgents')}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setApplyTemplate(null)}>
                {tc('cancel')}
              </Button>
              <Button onClick={handleApply} disabled={applying || applySelected.length === 0}>
                {t('applyConfirm', { count: applySelected.length })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
