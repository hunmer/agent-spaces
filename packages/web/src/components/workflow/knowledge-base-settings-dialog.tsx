'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import { sdk } from '@/lib/sdk';
import { useLLMStore } from '@/stores/llm';
import type { KnowledgeBase } from '@agent-spaces/shared';

export function KnowledgeBaseSettingsDialog({ workspaceId, kb, onClose }: {
  workspaceId: string;
  kb: KnowledgeBase;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { models } = useLLMStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chunkSize, setChunkSize] = useState(kb.chunkSize);
  const [chunkOverlap, setChunkOverlap] = useState(kb.chunkOverlap);
  const [embeddingModelId, setEmbeddingModelId] = useState(kb.embeddingModelId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setChunkSize(kb.chunkSize); setChunkOverlap(kb.chunkOverlap); setEmbeddingModelId(kb.embeddingModelId); }, [kb]);

  const embeddingModels = models.filter((m) => m.embedding);
  const agentsAsModels = embeddingModels.map((m) => ({
    id: m.id, name: m.name, description: `${m.provider}/${m.modelId}`,
  }));
  const boundModel = models.find((m) => m.id === embeddingModelId);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await sdk.knowledgeBase.update(workspaceId, kb.id, { chunkSize, chunkOverlap });
      await sdk.knowledgeBase.bindEmbeddingModel(workspaceId, kb.id, embeddingModelId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('knowledgeBase.settingsTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold">{t('knowledgeBase.embeddingModel')}</div>
              <div className="mt-1 text-xs text-muted-foreground">{boundModel ? `${boundModel.name} (${boundModel.provider})` : t('knowledgeBase.noModel')}</div>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setPickerOpen(true)}>{t('knowledgeBase.changeModel')}</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('knowledgeBase.chunkSize')}</label>
                <Input type="number" className="h-8 text-xs" value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('knowledgeBase.chunkOverlap')}</label>
                <Input type="number" className="h-8 text-xs" value={chunkOverlap} onChange={(e) => setChunkOverlap(Number(e.target.value))} />
              </div>
            </div>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>{t('knowledgeBase.cancel')}</Button>
            <Button size="sm" onClick={save} disabled={saving}>{t('knowledgeBase.save')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <AgentPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSubmit={(ids) => { setEmbeddingModelId(ids[0] ?? null); setPickerOpen(false); }}
        title={t('knowledgeBase.pickEmbeddingModel')}
        description={t('knowledgeBase.pickEmbeddingModelDesc')}
        agents={agentsAsModels}
        initialSelected={embeddingModelId ? [embeddingModelId] : []}
        singleSelect
        confirmText={t('knowledgeBase.confirm')}
      />
    </>
  );
}
