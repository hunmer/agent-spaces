'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { fetchStoreIndex } from '@/lib/agent-store';
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
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import { AgentIcon } from '@/components/common/agent-icon';
import { StoreTabPanel } from '@/components/common/store-tab-panel';
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
  Plus,
  Pencil,
  Download,
  Rocket,
  Store,
  FileText,
} from 'lucide-react';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';
import { ImportButton } from './import-button';

interface OutputStyleTemplate {
  id: string;
  name: string;
  description?: string;
  content: string;
  storeId?: string;
  createdAt: string;
  updatedAt: string;
  boundAgents?: Array<{ id: string; name: string; avatarUrl?: string }>;
}

interface StoreTemplate {
  id: string;
  name: string;
  filename: string;
}

interface AgentCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
}

interface OutputStylesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
}

type TabType = 'local' | 'store';

export function OutputStylesDialog({ open, onOpenChange, standalone }: OutputStylesDialogProps) {
  const t = useTranslations('outputStyles');
  const tc = useTranslations('common');

  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [templates, setTemplates] = useState<OutputStyleTemplate[]>([]);
  const [agents, setAgents] = useState<AgentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAgentId, setFilterAgentId] = useState('');
  const [filterType, setFilterType] = useState<'' | 'custom' | 'store'>('');

  // Store state
  const [storeTemplates, setStoreTemplates] = useState<StoreTemplate[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);

  // Create/Edit state
  const [editTemplate, setEditTemplate] = useState<OutputStyleTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Apply dialog state
  const [applyTemplate, setApplyTemplate] = useState<OutputStyleTemplate | null>(null);
  const [applying, setApplying] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await sdk.outputStyles.list());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      setAgents(await sdk.outputStyles.listAgents());
    } catch { /* ignore */ }
  }, []);

  const fetchStoreTemplates = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await fetchStoreIndex<StoreTemplate>('output-styles/index.json');
      setStoreTemplates(data);
    } catch { /* ignore */ }
    setStoreLoading(false);
  }, []);

  useEffect(() => {
    if (open || standalone) {
      fetchTemplates();
      fetchAgents();
      fetchStoreTemplates();
    }
  }, [open, standalone, fetchTemplates, fetchAgents, fetchStoreTemplates]);

  // Track which store ids are already imported locally
  const importedStoreIds = new Set(templates.filter((t) => t.storeId).map((t) => t.storeId));

  function parseFrontmatter(raw: string): { name?: string; description?: string; content: string } {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { content: raw };
    const frontmatter = match[1];
    const content = raw.slice(match[0].length);
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    return {
      name: nameMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
      content,
    };
  }

  const handleImport = async () => {
    if (uploadFiles.length === 0) return;

    if (uploadFiles.length === 1) {
      const raw = await uploadFiles[0].file.text();
      const parsed = parseFrontmatter(raw);
      const name = parsed.name || uploadFiles[0].file.name.replace(/\.(md|txt|markdown)$/i, '');
      setUploadFiles([]);
      setImportOpen(false);
      setEditTemplate(null);
      setIsCreating(true);
      setEditName(name);
      setEditDescription(parsed.description || '');
      setEditContent(parsed.content || raw);
      return;
    }

    for (const item of uploadFiles) {
      const raw = await item.file.text();
      const parsed = parseFrontmatter(raw);
      const name = parsed.name || item.file.name.replace(/\.(md|txt|markdown)$/i, '');
      await sdk.outputStyles.create({ name, content: parsed.content || raw, description: parsed.description });
    }
    setUploadFiles([]);
    setImportOpen(false);
    fetchTemplates();
  };

  const handleStoreImport = async (store: StoreTemplate) => {
    if (importedStoreIds.has(store.id) || importingIds.has(store.id)) return;
    setImportingIds((prev) => new Set(prev).add(store.id));
    try {
      const contentRes = await fetch(`/public/output-styles/${store.filename}`);
      if (!contentRes.ok) return;
      const raw = await contentRes.text();
      const parsed = parseFrontmatter(raw);
      const created = await sdk.outputStyles.create({ name: store.name, content: parsed.content || raw, storeId: store.id, description: parsed.description });
      setTemplates((prev) => [...prev, created]);
    } catch { /* ignore */ }
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(store.id);
      return next;
    });
  };

  const handleCreate = () => {
    setEditTemplate(null);
    setIsCreating(true);
    setEditName('');
    setEditDescription('');
    setEditContent('');
  };

  const handleEdit = (tmpl: OutputStyleTemplate) => {
    setEditTemplate(tmpl);
    setIsCreating(false);
    setEditName(tmpl.name);
    setEditDescription(tmpl.description || '');
    setEditContent(tmpl.content);
  };

  const closeEdit = () => {
    setEditTemplate(null);
    setIsCreating(false);
    setEditName('');
    setEditDescription('');
    setEditContent('');
  };

  const handleSave = async () => {
    if (!editName.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      const data = { name: editName, content: editContent, description: editDescription || undefined };
      const saved = editTemplate
        ? await sdk.outputStyles.update(editTemplate.id, data)
        : await sdk.outputStyles.create(data);
      setTemplates((prev) =>
        editTemplate
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [...prev, saved]
      );
      closeEdit();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (tmpl: OutputStyleTemplate) => {
    try {
      await sdk.outputStyles.delete_(tmpl.id);
      setTemplates((prev) => prev.filter((t) => t.id !== tmpl.id));
    } catch { /* ignore */ }
  };

  const openApplyDialog = (tmpl: OutputStyleTemplate) => {
    setApplyTemplate(tmpl);
  };

  const handleApply = async (selectedIds: string[]) => {
    if (!applyTemplate || selectedIds.length === 0) return;
    setApplying(true);
    try {
      await sdk.outputStyles.apply(applyTemplate.id, selectedIds);
      setApplyTemplate(null);
    } catch { /* ignore */ }
    setApplying(false);
  };

  const filtered = templates.filter((tmpl) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!tmpl.name.toLowerCase().includes(q) && !tmpl.content.toLowerCase().includes(q)) return false;
    }
    if (filterType === 'custom' && tmpl.storeId) return false;
    if (filterType === 'store' && !tmpl.storeId) return false;
    if (filterAgentId) {
      if (!tmpl.boundAgents?.some((a) => a.id === filterAgentId)) return false;
    }
    return true;
  });

  const filteredStore = storeTemplates.filter((tmpl) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return tmpl.name.toLowerCase().includes(q) || tmpl.id.toLowerCase().includes(q);
  });

  const showMainView = (standalone || open) && !applyTemplate && !editTemplate && !isCreating;

  const agentPickerItems = agents.map((a) => ({
    id: a.id,
    name: a.name,
    avatarUrl: a.avatarUrl,
    description: a.description,
  }));

  const tabs = (
    <div className="flex items-center gap-1 border-b border-border px-1">
      {([['local', FileText, t('tabLocal')], ['store', Store, t('tabStore')]] as const).map(([key, Icon, label]) => (
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
  );

  const localView = (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* Left sidebar */}
      <ScrollArea className="hidden md:block w-44 shrink-0">
        <div className="flex flex-col gap-3 pr-2">
          {/* Type filter */}
          <div className="space-y-1">
            <Button variant={!filterType ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start" onClick={() => setFilterType('')}>
              <FileText className="size-3.5 mr-1.5" />{t('filterAll')}
            </Button>
            <Button variant={filterType === 'custom' ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start" onClick={() => setFilterType('custom')}>
              <Pencil className="size-3.5 mr-1.5" />{t('filterCustom')}
            </Button>
            <Button variant={filterType === 'store' ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start" onClick={() => setFilterType('store')}>
              <Store className="size-3.5 mr-1.5" />{t('filterStore')}
            </Button>
          </div>
          {/* Agent filter */}
          {agents.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-2">{t('filterByAgent')}</p>
              {agents.map((a) => (
                <Button key={a.id} variant={filterAgentId === a.id ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start" onClick={() => setFilterAgentId(filterAgentId === a.id ? '' : a.id)}>
                  <AgentIcon agentId={a.id} name={a.name} avatarUrl={a.avatarUrl} className="size-4 mr-1.5 rounded-full" />
                  <span className="truncate">{a.name}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      {/* Right content */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="pl-8"
            />
          </div>
          <Popover open={importOpen} onOpenChange={setImportOpen}>
            <PopoverTrigger render={<ImportButton label={t('import')} />} />
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
                        <Pencil className="size-3.5 text-muted-foreground shrink-0" />
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
                      {tmpl.description || tmpl.content.slice(0, 200)}
                    </p>
                    {tmpl.boundAgents && tmpl.boundAgents.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-muted-foreground mr-0.5">{t('boundTo')}:</span>
                        {tmpl.boundAgents.map((a) => (
                          <AgentIcon key={a.id} agentId={a.id} name={a.name} avatarUrl={a.avatarUrl} className="size-4 rounded-full" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );

  const storeView = (
    <StoreTabPanel<StoreTemplate>
      items={filteredStore}
      loading={storeLoading}
      getGroup={() => ''}
      getId={(tmpl) => tmpl.id}
      allFilterText={t('filterAll')}
      searchPlaceholder={t('search')}
      emptyText={t('storeEmpty')}
      loadingText={tc('loading')}
      renderItem={(tmpl) => {
        const isImported = importedStoreIds.has(tmpl.id);
        const isImporting = importingIds.has(tmpl.id);
        return (
          <div
            className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Store className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{tmpl.name}</span>
                </div>
                <Button
                  variant={isImported ? 'ghost' : 'outline'}
                  size="sm"
                  className="h-6 px-1.5 text-xs shrink-0"
                  disabled={isImported || isImporting}
                  onClick={() => handleStoreImport(tmpl)}
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
              <p className="text-xs text-muted-foreground">
                {tmpl.id}
              </p>
            </div>
          </div>
        );
      }}
    />
  );

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
        </div>
      </DialogHeader>

      {tabs}

      <div className="flex-1 min-h-0 pt-2">
        {activeTab === 'local' ? localView : storeView}
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
      <Dialog open={!!editTemplate || isCreating} onOpenChange={(v) => { if (!v) closeEdit(); }}>
        <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editTemplate ? t('editTitle', { name: editTemplate.name }) : t('createTitle')}
            </DialogTitle>
            <DialogDescription>{t('editDescription')}</DialogDescription>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder={t('namePlaceholder')}
          />
          <Input
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
          />
          <div className="flex-1 min-h-0 overflow-hidden rounded-md border border-border">
            <MonacoEditor
              height="100%"
              language="markdown"
              value={editContent}
              onChange={(value) => setEditContent(value || '')}
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeEdit} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !editName.trim() || !editContent.trim()}>
              {saving ? tc('saving') : tc('save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply to Agents Dialog */}
      <AgentPickerDialog
        open={!!applyTemplate}
        onClose={() => setApplyTemplate(null)}
        onSubmit={handleApply}
        title={t('applyTitle', { name: applyTemplate?.name || '' })}
        description={t('applyDescription')}
        agents={agentPickerItems}
        cancelText={tc('cancel')}
        confirmText={(ids) => t('applyConfirm', { count: ids.length })}
        loading={applying}
      />
    </>
  );
}
