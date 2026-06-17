// 回收站对话框。
// 沙箱化：剥离 store / sdk / next-intl / @/lib/cn / @agent-spaces/shared 类型。
// 数据走 utils/db.js（listNodes/restoreNode/deleteNode），完成后 invokeService('node_changed') 广播 + onNodeChanged 刷新。
import { useState, useEffect, useMemo } from 'react';
import * as dbApi from '../utils/db.js';
import { T } from '../utils/constants.js';

const { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, ScrollArea, Trash2, RotateCcw, Search } =
  window.AgentSpacesUI || {};

const cn = (...a) => a.filter(Boolean).join(' ');

export function TrashBinModal({ open, onClose, onNodeChanged }) {
  const [all, setAll] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await dbApi.listNodes();
      setAll(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trashed = useMemo(() => all.filter((n) => n.isTrash), [all]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((n) => String(n.title || '').toLowerCase().includes(q));
  }, [trashed, filter]);

  const notify = (payload) =>
    window.AgentSpaces.invokeService('node_changed', payload).then(() => onNodeChanged && onNodeChanged());

  const handleRestore = async (id) => {
    await dbApi.restoreNode(id);
    await notify({ kind: 'restore', nodeId: id });
    await reload();
  };

  const handleDeletePermanent = async (id, title) => {
    if (!confirm(`永久删除 "${title || '未命名'}"？此操作不可逆。`)) return;
    await dbApi.deleteNode(id);
    await notify({ kind: 'delete', nodeId: id });
    await reload();
  };

  const handleEmpty = async () => {
    if (trashed.length === 0) return;
    if (!confirm(`清空回收站？将永久删除 ${trashed.length} 项，不可恢复。`)) return;
    for (const n of trashed) {
      await dbApi.deleteNode(n.id);
    }
    await notify({ kind: 'delete' });
    await reload();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[min(560px,calc(100vw-2rem))] !max-w-[min(560px,calc(100vw-2rem))] max-h-[70vh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {Trash2 ? <Trash2 className="size-4 text-muted-foreground" /> : null}
              <DialogTitle className="text-sm font-medium">{T.toTrash}</DialogTitle>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold">
                {trashed.length}
              </span>
            </div>
            <Button size="sm" variant="ghost" disabled={trashed.length === 0} onClick={handleEmpty}>
              清空
            </Button>
          </div>
        </DialogHeader>

        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            {Search ? <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" /> : null}
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="搜索回收站…"
              className="h-8 text-xs pl-7"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">加载中…</div>
            ) : trashed.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground italic">
                回收站是空的
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground italic">未匹配到 "{filter}"</div>
            ) : (
              filtered.map((node) => (
                <div
                  key={node.id}
                  className="group hover:bg-accent/50 p-2 rounded-md flex items-center justify-between gap-2 border border-transparent hover:border-border"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base bg-muted border border-border p-1 rounded shrink-0">
                      {node.icon || '📝'}
                    </span>
                    <span className="text-xs font-medium truncate">{node.title || '未命名'}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-muted-foreground hover:text-emerald-500"
                      onClick={() => handleRestore(node.id)}
                      title="恢复"
                    >
                      {RotateCcw ? <RotateCcw className="size-3.5" /> : '恢复'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeletePermanent(node.id, node.title)}
                      title="永久删除"
                    >
                      {Trash2 ? <Trash2 className="size-3.5" /> : '删除'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default TrashBinModal;
