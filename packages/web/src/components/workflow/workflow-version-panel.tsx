'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WorkflowVersion, WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';
import { workflowVersionApi } from '@/lib/workflow-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Save, Trash2, RotateCcw, Plus, GitBranch, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface VersionPanelProps {
  workflowId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onRestore: (version: WorkflowVersion) => void;
  onPreview: (version: WorkflowVersion) => void;
}

export function WorkflowVersionPanel({ workflowId, nodes, edges, onRestore, onPreview }: VersionPanelProps) {
  const t = useTranslations('workflows');
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    try {
      const list = await workflowVersionApi.list(workflowId);
      setVersions(list);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const handleCreate = useCallback(async () => {
    if (!versionName.trim()) return;
    setCreating(true);
    try {
      const v = await workflowVersionApi.add(workflowId, versionName.trim(), nodes, edges);
      setVersions(prev => [v, ...prev]);
      setDialogOpen(false);
      setVersionName('');
    } finally {
      setCreating(false);
    }
  }, [workflowId, versionName, nodes, edges]);

  const handleDelete = useCallback(async (id: string) => {
    await workflowVersionApi.delete(workflowId, id);
    setVersions(prev => prev.filter(v => v.id !== id));
    setConfirmDeleteId(null);
  }, [workflowId]);

  const handleRestore = useCallback((version: WorkflowVersion) => {
    onRestore(version);
  }, [onRestore]);

  const handlePreview = useCallback((version: WorkflowVersion) => {
    onPreview(version);
  }, [onPreview]);

  const handleClear = useCallback(async () => {
    await workflowVersionApi.clear(workflowId);
    setVersions([]);
  }, [workflowId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t('version.count', { count: versions.length })}</span>
          <div className="flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDialogOpen(true)} />}>
                  <Plus className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent side="left">{t('version.saveCurrent')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {versions.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleClear} />}>
                    <Trash2 className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent side="left">{t('version.clearAll')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Version list */}
        {versions.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">
            {t('version.empty')}
          </div>
        ) : (
          <div className="space-y-1">
            {versions.map(v => (
              <div
                key={v.id}
                className="group flex cursor-pointer items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                onClick={() => handlePreview(v)}
              >
                <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{v.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t('version.nodes', { count: v.snapshot?.nodes?.length || 0 })} · {formatTime(v.createdAt, t)}
                  </div>
                </div>
                <div className="hidden group-hover:flex gap-0.5">
                  <Button
                    variant="ghost" size="icon" className="h-5 w-5"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRestore(v);
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirmDeleteId(v.id);
                    }}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create version dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('version.saveTitle')}</DialogTitle>
          </DialogHeader>
          <Input
            value={versionName}
            onChange={(e) => setVersionName(e.target.value)}
            placeholder={t('version.namePlaceholder')}
            className="h-8 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>{t('version.cancel')}</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating || !versionName.trim()}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              {t('version.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('version.deleteTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t('version.deleteConfirm')}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>{t('version.cancel')}</Button>
            <Button variant="destructive" size="sm" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}>{t('version.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

function formatTime(ts: number | string | undefined, t: (key: string, params?: Record<string, string | number | Date>) => string): string {
  if (!ts) return '';
  const d = new Date(typeof ts === 'string' ? ts : ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60000) return t('version.justNow');
  if (diffMs < 3600000) return t('version.minutesAgo', { count: Math.floor(diffMs / 60000) });
  if (diffMs < 86400000) return t('version.hoursAgo', { count: Math.floor(diffMs / 3600000) });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
