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
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchSelect } from '@/components/ui/search-select';
import {
  Upload,
  Plus,
  Trash2,
  Save,
  MoreVertical,
  ArrowRightLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHookStore } from '@/stores/hooks';
import { useWorkspaceStore } from '@/stores/workspace';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';

interface HooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
}

export function HooksDialog({ open, onOpenChange, standalone }: HooksDialogProps) {
  const _t = useTranslations();
  const { hooks, selectedName, loading, fetchHooks, createHook, updateHook, deleteHook, uploadHook, applyToWorkspace, setSelectedName } = useHookStore();
  const { workspaces } = useWorkspaceStore();
  const activeWorkspaceId = workspaces[0]?.id;

  const [editorContent, setEditorContent] = useState('');
  const [newName, setNewName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [showApplyPicker, setShowApplyPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (open && activeWorkspaceId) fetchHooks(activeWorkspaceId);
  }, [open, activeWorkspaceId, fetchHooks]);

  const selectedHook = hooks.find((h) => h.name === selectedName);

  useEffect(() => {
    if (selectedHook) {
      setEditorContent(JSON.stringify(selectedHook, null, 2));
      setDirty(false);
    } else {
      setEditorContent('');
    }
  }, [selectedHook]);

  const handleSave = useCallback(async () => {
    if (!activeWorkspaceId || !selectedName) return;
    try {
      const parsed = JSON.parse(editorContent);
      await updateHook(activeWorkspaceId, selectedName, parsed);
      setDirty(false);
    } catch (e: unknown) {
      console.error('Invalid JSON:', e instanceof Error ? e.message : String(e));
    }
  }, [activeWorkspaceId, selectedName, editorContent, updateHook]);

  const handleCreate = useCallback(async () => {
    if (!activeWorkspaceId || !newName.trim()) return;
    await createHook(activeWorkspaceId, newName.trim());
    setNewName('');
    setShowNewInput(false);
  }, [activeWorkspaceId, newName, createHook]);

  const handleDelete = useCallback(async () => {
    if (!activeWorkspaceId || !selectedName) return;
    await deleteHook(activeWorkspaceId, selectedName);
  }, [activeWorkspaceId, selectedName, deleteHook]);

  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !activeWorkspaceId) return;
      const content = await file.text();
      await uploadHook(activeWorkspaceId, content);
    };
    input.click();
  }, [activeWorkspaceId, uploadHook]);

  const handleApply = useCallback(async (targetId: string) => {
    if (!activeWorkspaceId || !selectedName) return;
    await applyToWorkspace(activeWorkspaceId, selectedName, targetId);
    setShowApplyPicker(false);
  }, [activeWorkspaceId, selectedName, applyToWorkspace]);

  const handleToggleEnabled = useCallback(async (name: string, enabled: boolean) => {
    if (!activeWorkspaceId) return;
    const hook = hooks.find((h) => h.name === name);
    if (!hook) return;
    await updateHook(activeWorkspaceId, name, { ...hook, enabled });
  }, [activeWorkspaceId, hooks, updateHook]);

  const content = (
    <div className="flex h-[500px]">
      {/* Left: hook list */}
      <div className="w-52 border-r flex flex-col">
        <div className="p-2 border-b flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowNewInput(true)}>
            <Plus className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleUpload}>
            <Upload className="size-3.5" />
          </Button>
        </div>
        {showNewInput && (
          <div className="p-2 border-b flex gap-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="hook name"
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate}>OK</Button>
          </div>
        )}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-3 text-xs text-muted-foreground">Loading...</div>
          ) : hooks.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No hooks</div>
          ) : (
            hooks.map((h) => (
              <div
                key={h.name}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-accent',
                  selectedName === h.name && 'bg-accent',
                )}
                onClick={() => setSelectedName(h.name)}
              >
                <Switch
                  checked={h.enabled}
                  onCheckedChange={(v) => handleToggleEnabled(h.name, v)}
                  className="scale-75"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="truncate flex-1">{h.name}</span>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right: editor */}
      <div className="flex-1 flex flex-col">
        {selectedHook ? (
          <>
            <div className="flex items-center justify-between px-3 py-1.5 border-b">
              <span className="text-xs font-medium">{selectedHook.name}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setShowApplyPicker(true)}>
                  <ArrowRightLeft className="size-3" />
                  Apply
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleSave} disabled={!dirty}>
                  <Save className="size-3" />
                  Save
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                      <MoreVertical className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive text-xs" onClick={handleDelete}>
                      <Trash2 className="size-3 mr-1" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {showApplyPicker && (
              <div className="px-3 py-2 border-b bg-muted/50">
                <div className="text-xs mb-1">Apply to workspace:</div>
                <SearchSelect
                  options={workspaces
                    .filter((w) => w.id !== activeWorkspaceId)
                    .map((w) => ({ value: w.id, label: w.name }))}
                  value=""
                  onChange={handleApply}
                  placeholder="Select workspace..."
                />
              </div>
            )}
            <div className="flex-1">
              <MonacoEditor
                height="100%"
                language="json"
                value={editorContent}
                onChange={(v) => {
                  setEditorContent(v || '');
                  setDirty(true);
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a hook to edit
          </div>
        )}
      </div>
    </div>
  );

  if (standalone) return content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Hooks</DialogTitle>
          <DialogDescription>Manage per-tool-call hooks for this workspace</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
