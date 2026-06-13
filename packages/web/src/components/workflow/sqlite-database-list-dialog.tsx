'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Eye, Plus, Database } from 'lucide-react';
import type { SqliteDatabaseMeta } from '@agent-spaces/shared';
import { SqliteDataBrowserDialog } from './sqlite-data-browser-dialog';

type Filter = 'current' | 'all' | 'unlinked';

export interface SqliteDatabaseListDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: 'pick' | 'manage';
  workflowId?: string;
  onPicked?: (id: string) => void;
}

export function SqliteDatabaseListDialog({ open, onOpenChange, mode = 'pick', workflowId, onPicked }: SqliteDatabaseListDialogProps) {
  const t = useTranslations();
  const [list, setList] = useState<SqliteDatabaseMeta[]>([]);
  const [filter, setFilter] = useState<Filter>('current');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<SqliteDatabaseMeta | null>(null);
  const [creating, setCreating] = useState(false);
  const [browseId, setBrowseId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setList(await sdk.sqlite.listDatabases()); } catch { setList([]); }
  }, []);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  const filtered = list.filter((d) => {
    if (filter === 'current' && (!workflowId || !d.workflowIds.includes(workflowId))) return false;
    if (filter === 'unlinked' && d.workflowIds.length > 0) return false;
    if (keyword && !d.name.toLowerCase().includes(keyword.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm(t('sqlite.confirmDelete'))) return;
    await sdk.sqlite.deleteDatabase(id);
    reload();
  };

  return (
    <>
      <Dialog open={open && !browseId} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Database className="size-4" />{t('sqlite.title')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current" className="text-xs">{t('sqlite.filterCurrent')}</SelectItem>
                <SelectItem value="all" className="text-xs">{t('sqlite.filterAll')}</SelectItem>
                <SelectItem value="unlinked" className="text-xs">{t('sqlite.filterUnlinked')}</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-8 flex-1 text-xs" placeholder={t('sqlite.searchPlaceholder')} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCreating(true)}><Plus className="mr-1 size-3.5" />{t('sqlite.create')}</Button>
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-auto">
            {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">{t('sqlite.empty')}</div>}
            {filtered.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{d.description || t('sqlite.noDescription')}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.workflowIds.slice(0, 3).map((w) => <Badge key={w} variant="secondary" className="text-[10px]">{w.slice(0, 8)}</Badge>)}
                    {d.workflowIds.length > 3 && <span className="text-[10px] text-muted-foreground">+{d.workflowIds.length - 3}</span>}
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost" title={t('sqlite.browse')} onClick={() => setBrowseId(d.id)}><Eye className="size-3.5" /></Button>
                <Button size="icon-sm" variant="ghost" title={t('sqlite.edit')} onClick={() => setEditing(d)}><Pencil className="size-3.5" /></Button>
                <Button size="icon-sm" variant="ghost" title={t('sqlite.delete')} onClick={() => handleDelete(d.id)}><Trash2 className="size-3.5 text-destructive" /></Button>
                {mode === 'pick' && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => onPicked?.(d.id)}>{t('sqlite.pick')}</Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {(editing || creating) && (
        <SqliteDatabaseEditDialog
          meta={editing}
          open={!!editing || creating}
          workflowId={workflowId}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={reload}
        />
      )}

      {browseId && (
        <SqliteDataBrowserDialog databaseId={browseId} onClose={() => setBrowseId(null)} />
      )}
    </>
  );
}

function SqliteDatabaseEditDialog({ meta, open, workflowId, onClose, onSaved }: {
  meta: SqliteDatabaseMeta | null;
  open: boolean;
  workflowId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState(meta?.name ?? '');
  const [description, setDescription] = useState(meta?.description ?? '');
  const [workflowIdsText, setWorkflowIdsText] = useState((meta?.workflowIds ?? (workflowId ? [workflowId] : [])).join(', '));

  useEffect(() => {
    setName(meta?.name ?? '');
    setDescription(meta?.description ?? '');
    setWorkflowIdsText((meta?.workflowIds ?? (workflowId ? [workflowId] : [])).join(', '));
  }, [meta, workflowId, open]);

  const save = async () => {
    const workflowIds = workflowIdsText.split(',').map((s) => s.trim()).filter(Boolean);
    if (meta) await sdk.sqlite.updateDatabase(meta.id, { name, description, workflowIds });
    else await sdk.sqlite.createDatabase({ name, description, workflowIds });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{meta ? t('sqlite.edit') : t('sqlite.create')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('sqlite.name')}</label>
            <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('sqlite.description')}</label>
            <Textarea className="text-xs" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('sqlite.workflowIds')}</label>
            <Input className="h-8 text-xs" value={workflowIdsText} onChange={(e) => setWorkflowIdsText(e.target.value)} placeholder="wf-id1, wf-id2" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>{t('sqlite.cancel')}</Button>
            <Button size="sm" onClick={save} disabled={!name.trim()}>{t('sqlite.save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
