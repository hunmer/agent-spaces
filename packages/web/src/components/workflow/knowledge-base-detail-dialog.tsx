'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings, Trash2, RotateCw, Plus, Loader2 } from 'lucide-react';
import { sdk } from '@/lib/sdk';
import { cn } from '@/lib/utils';
import type { KnowledgeBase, KbFile, KbFileIndexStatus } from '@agent-spaces/shared';
import { KnowledgeBaseSettingsDialog } from './knowledge-base-settings-dialog';

const STATUS_STYLE: Record<KbFileIndexStatus, string> = {
  indexed: 'bg-emerald-500/15 text-emerald-600',
  pending: 'bg-muted text-muted-foreground',
  indexing: 'bg-blue-500/15 text-blue-600',
  failed: 'bg-destructive/15 text-destructive',
};

export function KnowledgeBaseDetailDialog({ workspaceId, kbId, onClose }: {
  workspaceId: string;
  kbId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');

  const loadingRef = useRef(false);
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [k, fs] = await Promise.all([
        sdk.knowledgeBase.list(workspaceId).then((l) => l.find((x) => x.id === kbId) ?? null),
        sdk.knowledgeBase.listFiles(workspaceId, kbId),
      ]);
      setKb(k); setFiles(fs);
      setSelectedId((cur) => cur ?? fs[0]?.id ?? null);
    } finally { loadingRef.current = false; }
  }, [workspaceId, kbId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const hasPending = files.some((f) => f.indexStatus === 'pending' || f.indexStatus === 'indexing');
    if (!hasPending) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [files, load]);

  const selected = files.find((f) => f.id === selectedId) ?? null;

  const handleAdd = async () => {
    const p = newFilePath.trim();
    if (!p) return;
    setAdding(true);
    try {
      const fileName = p.split(/[\\/]/).pop() || p;
      await sdk.knowledgeBase.addFile(workspaceId, kbId, {
        sourceType: /^https?:\/\//i.test(p) ? 'url' : 'path', sourceRef: p, fileName,
      });
      setNewFilePath(''); load();
    } catch (e) { window.alert((e as Error).message); }
    finally { setAdding(false); }
  };

  const handleReindex = async (f: KbFile) => { await sdk.knowledgeBase.reindexFile(workspaceId, kbId, f.id); load(); };
  const handleDeleteFile = async (f: KbFile) => {
    if (!window.confirm(t('knowledgeBase.confirmDeleteFile'))) return;
    await sdk.knowledgeBase.deleteFile(workspaceId, kbId, f.id);
    if (selectedId === f.id) setSelectedId(null);
    load();
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="!flex !h-[80vh] !w-[80vw] !max-w-[80vw] !flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {kb?.name ?? kbId}
              <Button variant="outline" size="sm" className="ml-auto h-7 me-5 gap-1 text-xs" onClick={() => setSettingsOpen(true)}>
                <Settings className="size-3.5" />{t('knowledgeBase.settings')}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 gap-2">
            <div className="flex w-64 flex-col gap-2">
              <div className="flex flex-col gap-1 rounded-md border p-2">
                <Input className="h-7 text-xs" placeholder={t('knowledgeBase.filePathPlaceholder')} value={newFilePath} onChange={(e) => setNewFilePath(e.target.value)} />
                <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={adding || !newFilePath.trim()}>
                  {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}{t('knowledgeBase.addFile')}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                {files.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">{t('knowledgeBase.noFiles')}</div>
                ) : files.map((f) => (
                  <div key={f.id} className={cn('flex items-center gap-2 border-b px-2 py-1.5 last:border-0 hover:bg-muted/40', selectedId === f.id && 'bg-muted')}>
                    <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setSelectedId(f.id)}>
                      <span className={cn('inline-block size-2 rounded-full', STATUS_STYLE[f.indexStatus])} />
                      <span className="flex-1 truncate text-xs">{f.fileName}</span>
                    </button>
                    {f.indexStatus === 'failed' && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => handleReindex(f)} title={f.indexError ?? ''}><RotateCw className="size-3" /></button>}
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteFile(f)}><Trash2 className="size-3" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col rounded-md border">
              {selected ? (
                <>
                  <div className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
                    {selected.fileName} · {selected.size}B · {selected.chunkCount} {t('knowledgeBase.chunks')} · {selected.sourceType}:{selected.sourceRef}
                    {selected.indexStatus === 'failed' && <span className="text-destructive"> · {selected.indexError}</span>}
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 text-xs">{selected.extractedText || t('knowledgeBase.noPreview')}</pre>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">{t('knowledgeBase.selectFile')}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {kb && settingsOpen && (
        <KnowledgeBaseSettingsDialog workspaceId={workspaceId} kb={kb} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}
