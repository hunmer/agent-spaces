import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, ScrollArea,
} from '@agent-spaces/ui';

export default function GroupRunSelectionDialog({ open, mode, runs, onClose, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set());
  const runIdsKey = runs.map((run) => run.id).join('\n');

  useEffect(() => {
    if (open) setSelected(new Set(runIdsKey ? runIdsKey.split('\n') : []));
  }, [open, runIdsKey]);

  const selectedCount = selected.size;
  const allSelected = useMemo(
    () => runs.length > 0 && selectedCount === runs.length,
    [runs.length, selectedCount],
  );

  const toggle = (runId) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(runId)) next.delete(runId);
    else next.add(runId);
    return next;
  });

  const close = () => {
    setSelected(new Set());
    onClose?.();
  };

  const confirm = () => {
    const runIds = runs.filter((run) => selected.has(run.id)).map((run) => run.id);
    if (!runIds.length) return;
    onConfirm?.(runIds);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="flex max-h-[75vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3 pr-10">
          <DialogTitle className="text-sm">选择要运行的项目</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            共 {runs.length} 个项目，已选择 {selectedCount} 个
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-1 border-b border-border bg-muted/20 px-4 py-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            disabled={allSelected}
            onClick={() => setSelected(new Set(runs.map((run) => run.id)))}
          >全选</Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => setSelected((current) => new Set(
              runs.filter((run) => !current.has(run.id)).map((run) => run.id),
            ))}
          >反选</Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-5">
            {runs.map((run, index) => {
              const checked = selected.has(run.id);
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => toggle(run.id)}
                  className={`relative aspect-square min-w-0 overflow-hidden rounded-md border-2 bg-muted/30 transition ${
                    checked ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                  }`}
                  title={run.name || `项目 ${index + 1}`}
                >
                  {mode === 'assets' && run.url ? (
                    <img
                      src={run.url}
                      alt={run.name || `素材 ${index + 1}`}
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-lg font-medium text-muted-foreground">
                      {run.index || index + 1}
                    </span>
                  )}
                  <span className="absolute right-1.5 top-1.5 rounded bg-background/80 p-0.5">
                    <Checkbox checked={checked} className="h-4 w-4" />
                  </span>
                  <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-background/80 px-1 text-[9px] text-foreground">
                    {run.name || `项目 ${run.index || index + 1}`}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center border-t border-border bg-muted/20 px-4 py-3">
          <Button type="button" size="sm" variant="outline" onClick={close}>取消</Button>
          <Button type="button" size="sm" disabled={selectedCount === 0} onClick={confirm}>
            运行选中项目 ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
