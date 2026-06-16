'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { sdk } from '@/lib/sdk';
import type { KnowledgeBase } from '@agent-spaces/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  workspaceId: string;
  /** 传入知识库 = 编辑模式；null/undefined = 创建模式 */
  kb?: KnowledgeBase | null;
}

export function KnowledgeBaseEditDialog({ open, onClose, onSaved, workspaceId, kb }: Props) {
  const t = useTranslations();
  const isEdit = !!kb;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开或编辑目标变化时同步表单字段
  useEffect(() => {
    if (open) {
      setName(kb?.name ?? '');
      setDescription(kb?.description ?? '');
      setError(null);
    }
  }, [open, kb]);

  const handleSave = async () => {
    const n = name.trim();
    if (!workspaceId || !n) return;
    setSaving(true);
    setError(null);
    try {
      if (isEdit && kb) {
        await sdk.knowledgeBase.update(workspaceId, kb.id, { name: n, description: description.trim() });
      } else {
        await sdk.knowledgeBase.create(workspaceId, { name: n, description: description.trim() });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('knowledgeBase.editTitle') : t('knowledgeBase.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t('knowledgeBase.name')}</label>
            <Input
              className="h-8 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('knowledgeBase.namePlaceholder')}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t('knowledgeBase.description')}</label>
            <Textarea
              className="min-h-20 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('knowledgeBase.descriptionPlaceholder')}
            />
          </div>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>{t('knowledgeBase.cancel')}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>{t('knowledgeBase.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
