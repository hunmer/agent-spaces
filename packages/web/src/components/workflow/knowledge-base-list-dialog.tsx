'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, FolderOpen, Library, Pencil } from 'lucide-react';
import { sdk } from '@/lib/sdk';
import type { KnowledgeBase } from '@agent-spaces/shared';
import { KnowledgeBaseDetailDialog } from './knowledge-base-detail-dialog';
import { KnowledgeBaseEditDialog } from './knowledge-base-edit-dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  mode?: 'pick' | 'manage';
  onPicked?: (id: string) => void;
}

export function KnowledgeBaseListDialog({ open, onOpenChange, workspaceId, mode = 'manage', onPicked }: Props) {
  const t = useTranslations();
  const resolvedWorkspaceId = workspaceId.trim();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingKb, setEditingKb] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!resolvedWorkspaceId) return;
    setLoading(true);
    try { setKbs(await sdk.knowledgeBase.list(resolvedWorkspaceId)); } finally { setLoading(false); }
  }, [resolvedWorkspaceId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleDelete = async (kb: KnowledgeBase) => {
    if (!resolvedWorkspaceId) return;
    if (!window.confirm(t('knowledgeBase.confirmDelete'))) return;
    await sdk.knowledgeBase.delete_(resolvedWorkspaceId, kb.id);
    load();
  };

  const openCreate = () => { setEditingKb(null); setEditOpen(true); };
  const openEdit = (kb: KnowledgeBase) => { setEditingKb(kb); setEditOpen(true); };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="size-4" />
              {t('knowledgeBase.listTitle')}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto me-8 h-7 gap-1 text-xs"
                onClick={openCreate}
              >
                <Plus className="size-3.5" />{t('knowledgeBase.create')}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            {loading && kbs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">{t('knowledgeBase.loading')}</div>
            ) : kbs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">{t('knowledgeBase.empty')}</div>
            ) : kbs.map((kb) => (
              <div key={kb.id} className="flex items-center gap-1 border-b px-3 py-2 last:border-0 hover:bg-muted/40">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => { if (mode === 'pick') onPicked?.(kb.id); else setDetailId(kb.id); }}
                >
                  <Library className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{kb.name}</span>
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground" title={t('knowledgeBase.viewDetail')} onClick={() => setDetailId(kb.id)}>
                  <FolderOpen className="size-3.5" />
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground" title={t('knowledgeBase.edit')} onClick={() => openEdit(kb)}>
                  <Pencil className="size-3.5" />
                </button>
                <button type="button" className="text-muted-foreground hover:text-destructive" title={t('knowledgeBase.delete')} onClick={() => handleDelete(kb)}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {detailId && (
        <KnowledgeBaseDetailDialog
          workspaceId={resolvedWorkspaceId}
          kbId={detailId}
          onClose={() => { setDetailId(null); load(); }}
        />
      )}
      <KnowledgeBaseEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); load(); }}
        workspaceId={resolvedWorkspaceId}
        kb={editingKb}
      />
    </>
  );
}
