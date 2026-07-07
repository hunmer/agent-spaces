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
  Download,
  Store,
  FileText,
  Pencil,
} from 'lucide-react';
import { AgentIcon } from '@/components/common/agent-icon';
import { StoreTabPanel } from '@/components/common/store-tab-panel';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';
import { useImport } from './import-panel/use-import';
import { FileImportMenu } from './import-panel/import-menu';
import { ImportPreviewPanel } from './import-panel/import-preview-panel';
import { ImportFileInputs } from './import-panel/import-file-inputs';

interface PromptTemplate {
  id: string;
  name: string;
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

interface PromptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
}

type TabType = 'local' | 'store';

export function PromptsDialog({ open, onOpenChange, standalone }: PromptsDialogProps) {
  const t = useTranslations('prompts');
  const tc = useTranslations('common');

  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
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
  const importState = useImport({
    onImportBatch: async (items) => {
      for (const item of items) {
        await sdk.prompts.create({ name: item.name, content: item.content });
      }
      setImportOpen(false);
      fetchTemplates();
    },
  });

  // Apply dialog state
  const [applyTemplate, setApplyTemplate] = useState<PromptTemplate | null>(null);
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
      setTemplates(await sdk.prompts.list());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      setAgents(await sdk.prompts.listAgents());
    } catch { /* ignore */ }
  }, []);

  const fetchStoreTemplates = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await fetchStoreIndex<StoreTemplate>('prompt/index.json');
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


  const handleStoreImport = async (store: StoreTemplate) => {
    if (importedStoreIds.has(store.id) || importingIds.has(store.id)) return;
    setImportingIds((prev) => new Set(prev).add(store.id));
    try {
      const contentRes = await fetch(`/public/prompt/${store.filename}`);
      if (!contentRes.ok) return;
      const content = await contentRes.text();
      const created = await sdk.prompts.create({ name: store.name, content, storeId: store.id });
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
        const updated = await sdk.prompts.update(editTemplate.id, { name: editName, content: editContent });
        setTemplates((prev) => prev.map((t) => t.id === updated.id ? updated : t));
        closeEditDialog();
      } else {
        const created = await sdk.prompts.create({ name: editName, content: editContent });
        setTemplates((prev) => [...prev, created]);
        closeEditDialog();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (tmpl: PromptTemplate) => {
    try {
      await sdk.prompts.delete_(tmpl.id);
      setTemplates((prev) => prev.filter((t) => t.id !== tmpl.id));
    } catch { /* ignore */ }
  };

  const openApplyDialog = (tmpl: PromptTemplate) => {
    setApplyTemplate(tmpl);
  };

  const handleApply = async (selectedIds: string[]) => {
    if (!applyTemplate || selectedIds.length === 0) return;
    setApplying(true);
    try {
      await sdk.prompts.apply(applyTemplate.id, selectedIds);
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
    <div className="flex items-center gap-1 rounded-md bg-muted/50 p-0.5">
      {([['local', FileText, t('tabLocal')], ['store', Store, t('tabStore')]] as const).map(([key, Icon, label]) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            activeTab === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
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
        </div>
        {importState.importDialogOpen ? (
          <ImportPreviewPanel
            items={importState.importItems}
            onItemsChange={importState.setImportItems}
            onConfirm={importState.handleImportConfirm}
            onCancel={importState.handleImportCancel}
            defaultGroup={importState.importDefaultGroup}
          />
        ) : (
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
        )}
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
        <div className="flex items-center justify-between gap-2 pr-12">
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
          <div className="flex items-center gap-1.5">
            {tabs}
            <FileImportMenu
              label={t('import')}
              triggers={importState}
              enabled={{ md: true, folder: true, zip: true }}
              open={importOpen}
              onOpenChange={setImportOpen}
            />
            <ImportFileInputs
              mdInputRef={importState.mdInputRef}
              folderInputRef={importState.folderInputRef}
              zipInputRef={importState.zipInputRef}
              handleMdSelect={importState.handleMdSelect}
              handleFolderSelect={importState.handleFolderSelect}
              handleZipSelect={importState.handleZipSelect}
            />
            <Button variant="outline" size="sm" onClick={handleCreate}>
              <Plus className="size-3.5 mr-1" />
              {t('create')}
            </Button>
          </div>
        </div>
      </DialogHeader>

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
