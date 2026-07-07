'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
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
import { AgentIcon } from '@/components/common/agent-icon';
import {
  Search,
  MoreVertical,
  Trash2,
  Save,
  Plus,
  FileText,
  Folder,
  Rocket,
} from 'lucide-react';
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import { cn } from '@/lib/utils';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';
import { useImport } from './import-panel/use-import';
import { FileImportMenu } from './import-panel/import-menu';
import { ImportPreviewPanel } from './import-panel/import-preview-panel';
import { ImportFileInputs } from './import-panel/import-file-inputs';

interface AgentInfo {
  agentId: string;
  agentName: string;
  commandCount: number;
  avatarUrl?: string;
}

interface CommandItem {
  name: string;
  content: string;
  group: string;
  agentId: string;
  agentName?: string;
}

interface AgentCommandsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentCommandsDialog({ open, onOpenChange }: AgentCommandsDialogProps) {
  const t = useTranslations('agentCommands');
  const tc = useTranslations('common');

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [allCommands, setAllCommands] = useState<CommandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAgentId, setFilterAgentId] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const importState = useImport({
    onImportBatch: async (items) => {
      const targetAgentId = filterAgentId || (agents.length > 0 ? agents[0].agentId : '');
      if (!targetAgentId) return;
      for (const item of items) {
        await sdk.agentCommands.create(targetAgentId, { name: item.name, content: item.content });
      }
      setImportOpen(false);
      fetchAllCommands();
    },
  });

  const [editCommand, setEditCommand] = useState<CommandItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editAgentId, setEditAgentId] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Apply state
  const [applyCommand, setApplyCommand] = useState<CommandItem | null>(null);
  const [applying, setApplying] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await sdk.agentCommands.listAgents() as unknown as AgentInfo[];
      setAgents(data);
      if (data.length > 0 && !filterAgentId) {
        setEditAgentId(data[0].agentId);
      }
    } catch { /* ignore */ }
  }, [filterAgentId]);

  const fetchAllCommands = useCallback(async () => {
    setLoading(true);
    try {
      setAllCommands(await sdk.agentCommands.listAll() as unknown as CommandItem[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchAgents();
      fetchAllCommands();
    }
  }, [open, fetchAgents, fetchAllCommands]);

  const groups = Array.from(new Set(allCommands.map((c) => c.group).filter(Boolean)));

  const filtered = allCommands.filter((cmd) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!cmd.name.toLowerCase().includes(q) && !cmd.content.toLowerCase().includes(q)) return false;
    }
    if (filterAgentId && cmd.agentId !== filterAgentId) return false;
    if (filterGroup) {
      if (filterGroup === '__none__') {
        if (cmd.group) return false;
      } else if (cmd.group !== filterGroup) return false;
    }
    return true;
  });

  const getAgentAvatarUrl = (agentId: string) => {
    const agent = agents.find((a) => a.agentId === agentId);
    return agent?.avatarUrl;
  };

  const handleCreate = () => {
    setEditCommand(null);
    setIsCreating(true);
    setEditName('');
    setEditContent('');
    setEditGroup('');
    setEditAgentId(filterAgentId || (agents.length > 0 ? agents[0].agentId : ''));
  };

  const handleEdit = (cmd: CommandItem) => {
    setEditCommand(cmd);
    setIsCreating(false);
    setEditName(cmd.name);
    setEditContent(cmd.content);
    setEditGroup(cmd.group);
    setEditAgentId(cmd.agentId);
  };

  const closeEditDialog = () => {
    setEditCommand(null);
    setIsCreating(false);
    setEditName('');
    setEditContent('');
    setEditGroup('');
  };

  const handleSave = async () => {
    if (!editName.trim() || !editContent.trim() || !editAgentId) return;
    setSaving(true);
    try {
      if (editCommand) {
        await sdk.agentCommands.update(editAgentId, editCommand.name, { content: editContent, group: editGroup });
        closeEditDialog();
        fetchAllCommands();
      } else {
        await sdk.agentCommands.create(editAgentId, { name: editName, content: editContent, group: editGroup || undefined });
        closeEditDialog();
        fetchAllCommands();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (cmd: CommandItem) => {
    try {
      const query = cmd.group ? `?group=${encodeURIComponent(cmd.group)}` : '';
      await sdk.agentCommands.delete_(cmd.agentId, cmd.name, query);
      fetchAllCommands();
    } catch { /* ignore */ }
  };

  const openApplyDialog = (cmd: CommandItem) => {
    setApplyCommand(cmd);
  };

  const handleApply = async (selectedIds: string[]) => {
    if (!applyCommand || selectedIds.length === 0) return;
    setApplying(true);
    try {
      await sdk.agentCommands.apply(applyCommand.agentId, applyCommand.name, { group: applyCommand.group, agentIds: selectedIds });
      setApplyCommand(null);
      fetchAllCommands();
    } catch { /* ignore */ }
    setApplying(false);
  };

  const showMainView = open && !editCommand && !isCreating && !applyCommand;

  const mainBody = (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between gap-2 pr-12">
          <div className="hidden md:block">
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <FileImportMenu
              label={t('import')}
              triggers={importState}
              enabled={{ md: true, folder: true, zip: true, external: true }}
              external={{
                kinds: ['commands'],
                defaultKind: 'commands',
                targetAgentId: filterAgentId || agents[0]?.agentId || '',
                agents: agents.map((agent) => ({ id: agent.agentId, name: agent.agentName })),
                onImported: fetchAllCommands,
              }}
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

      {importState.importDialogOpen ? (
        <ImportPreviewPanel
          items={importState.importItems}
          onItemsChange={importState.setImportItems}
          onConfirm={importState.handleImportConfirm}
          onCancel={importState.handleImportCancel}
          defaultGroup={importState.importDefaultGroup}
        />
      ) : (
      <div className="flex flex-1 min-h-0 gap-4 pt-2">
        {/* Left: Filters */}
        <ScrollArea className="hidden md:block w-44 shrink-0">
          <div className="flex flex-col gap-3 pr-2">
            <div className="space-y-1">
              <Button
                variant={!filterAgentId && !filterGroup ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start"
                onClick={() => { setFilterAgentId(''); setFilterGroup(''); }}
              >
                <FileText className="size-3.5 mr-1.5" />
                {t('allAgents')}
              </Button>
            </div>

            {agents.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2">{t('selectAgent')}</p>
                {agents.map((agent) => (
                  <Button
                    key={agent.agentId}
                    variant={filterAgentId === agent.agentId ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => { setFilterAgentId(agent.agentId); setFilterGroup(''); }}
                  >
                    <AgentIcon agentId={agent.agentId} name={agent.agentName} avatarUrl={agent.avatarUrl} className="size-4 mr-1.5 rounded-full" />
                    <span className="truncate">{agent.agentName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{agent.commandCount}</span>
                  </Button>
                ))}
              </div>
            )}

            {groups.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2">{t('filterGroups')}</p>
                {groups.map((group) => (
                  <Button
                    key={group}
                    variant={filterGroup === group ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => { setFilterGroup(filterGroup === group ? '' : group); setFilterAgentId(''); }}
                  >
                    <Folder className="size-3.5 mr-1.5" />
                    <span className="truncate">{group}</span>
                  </Button>
                ))}
                {allCommands.some((c) => !c.group) && (
                  <Button
                    variant={filterGroup === '__none__' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => { setFilterGroup(filterGroup === '__none__' ? '' : '__none__'); setFilterAgentId(''); }}
                  >
                    <FileText className="size-3.5 mr-1.5" />
                    {t('filterNoGroup')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Right: Commands list */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
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
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 border',
                  !filterAgentId && !filterGroup ? 'bg-muted border-muted' : 'border-input text-muted-foreground',
                )}
                onClick={() => { setFilterAgentId(''); setFilterGroup(''); }}
              >
                {t('allAgents')}
              </button>
              {agents.slice(0, 5).map((agent) => (
                <button
                  key={agent.agentId}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 border',
                    filterAgentId === agent.agentId ? 'bg-muted border-muted' : 'border-input text-muted-foreground',
                  )}
                  onClick={() => { setFilterAgentId(agent.agentId); setFilterGroup(''); }}
                >
                  {agent.agentName}
                </button>
              ))}
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

          <ScrollArea className="flex-1 min-h-0">
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
                {filtered.map((cmd) => (
                  <div
                    key={`${cmd.agentId}-${cmd.group}-${cmd.name}`}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => handleEdit(cmd)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{cmd.name}</span>
                          {cmd.group && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              {cmd.group}
                            </span>
                          )}
                          {!filterAgentId && (
                            <AgentIcon agentId={cmd.agentId} name={cmd.agentName || cmd.agentId} avatarUrl={getAgentAvatarUrl(cmd.agentId)} className="size-4 rounded-full" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {cmd.content.slice(0, 120).replace(/^#\s+/, '')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-1.5 text-xs"
                          onClick={() => openApplyDialog(cmd)}
                        >
                          <Rocket className="size-3 mr-0.5" />
                          {t('apply')}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7" />}>
                            <MoreVertical className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(cmd)}
                            >
                              <Trash2 className="size-3.5 mr-1.5" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
      )}
    </>
  );

  return (
    <>
      <Dialog open={showMainView} onOpenChange={onOpenChange}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
          {mainBody}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCommand || isCreating} onOpenChange={(v) => { if (!v) closeEditDialog(); }}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>
                  {editCommand ? t('editTitle', { name: editCommand.name }) : t('createTitle')}
                </DialogTitle>
                <DialogDescription>{t('editDescription')}</DialogDescription>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving || !editName.trim() || !editContent.trim()}>
                <Save className="size-3.5 mr-1" />
                {tc('save')}
              </Button>
            </div>
          </DialogHeader>
          <div className="flex items-center gap-2 pb-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('namePlaceholder')}
              disabled={!!editCommand}
              className="flex-1"
            />
            <Input
              value={editGroup}
              onChange={(e) => setEditGroup(e.target.value)}
              placeholder={t('groupPlaceholder')}
              className="w-40"
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

      <AgentPickerDialog
        open={!!applyCommand}
        onClose={() => setApplyCommand(null)}
        onSubmit={handleApply}
        title={t('applyTitle', { name: applyCommand?.name || '' })}
        description={t('applyDescription')}
        agents={agents.map((a) => ({
          id: a.agentId,
          name: a.agentName,
          avatarUrl: a.avatarUrl,
        }))}
        cancelText={tc('cancel')}
        confirmText={(ids) => t('applyConfirm', { count: ids.length })}
        loading={applying}
      />
    </>
  );
}
