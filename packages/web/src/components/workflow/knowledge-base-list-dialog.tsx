'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, FolderOpen, Library } from 'lucide-react';
import { sdk } from '@/lib/sdk';
import type { KnowledgeBase } from '@agent-spaces/shared';
import { KnowledgeBaseDetailDialog } from './knowledge-base-detail-dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  mode?: 'pick' | 'manage';
  onPicked?: (id: string) => void;
}

export function KnowledgeBaseListDialog({ open, onOpenChange, workspaceId, mode = 'manage', onPicked }: Props) {
  const t = useTranslations();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try { setKbs(await sdk.knowledgeBase.list(workspaceId)); } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await sdk.knowledgeBase.create(workspaceId, { name: newName.trim() });
    setNewName(''); setCreating(false); load();
  };

  const handleDelete = async (kb: KnowledgeBase) => {
    if (!window.confirm(t('knowledgeBase.confirmDelete'))) return;
    await sdk.knowledgeBase.delete_(workspaceId, kb.id);
    load();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Library className="size-4" />{t('knowledgeBase.listTitle')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            {!creating ? (
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="size-3.5" />{t('knowledgeBase.create')}</Button>
            ) : (
              <>
                <Input className="h-8 text-xs flex-1" placeholder={t('knowledgeBase.namePlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                <Button size="sm" className="h-8" onClick={handleCreate}>{t('knowledgeBase.confirm')}</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setCreating(false); setNewName(''); }}>{t('knowledgeBase.cancel')}</Button>
              </>
            )}
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            {loading && kbs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">{t('knowledgeBase.loading')}</div>
            ) : kbs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">{t('knowledgeBase.empty')}</div>
            ) : kbs.map((kb) => (
              <div key={kb.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-0 hover:bg-muted/40">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => { if (mode === 'pick') onPicked?.(kb.id); else setDetailId(kb.id); }}
                >
                  <Library className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{kb.name}</span>
                  {mode === 'manage' && <FolderOpen className="size-3.5 text-muted-foreground" />}
                </button>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(kb)}><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {detailId && (
        <KnowledgeBaseDetailDialog
          workspaceId={workspaceId}
          kbId={detailId}
          onClose={() => { setDetailId(null); load(); }}
        />
      )}
    </>
  );
}
