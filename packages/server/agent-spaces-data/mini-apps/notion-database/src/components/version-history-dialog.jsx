// 版本历史对话框。
// 沙箱化：剥离 store / sdk / next-intl / @/lib/cn / DiffViewer / @agent-spaces/shared 类型。
// 改为全量快照并排展示 oldContent vs newContent（纯 html/文本预览，不复用 diff-viewer）。
// 「还原」→ dbApi.updateNode(nodeId, { content: newContent }) + invokeService('node_changed') + onNodeChanged。
import { useState, useEffect, useMemo } from 'react';
import * as dbApi from '../utils/db.js';
import { T } from '../utils/constants.js';

const {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  ScrollArea,
  Loader2,
  RotateCcw,
} = window.AgentSpacesUI || {};

const cn = (...a) => a.filter(Boolean).join(' ');

function fmtTime(ts) {
  if (!ts) return '';
  const n = Number(ts);
  // SQLite 存的是毫秒（nowTs = Date.now()）
  return new Date(n).toLocaleString();
}

export function VersionHistoryDialog({ open, onClose, nodeId, onNodeChanged }) {
  const [versions, setVersions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open || !nodeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const list = await dbApi.listVersions(nodeId);
        if (cancelled) return;
        setVersions(list);
        setSelectedId(list[0]?.id || null);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, nodeId]);

  const selected = useMemo(() => versions.find((v) => v.id === selectedId) || null, [versions, selectedId]);

  const handleRestore = async () => {
    if (!selected) return;
    if (!confirm('还原到该版本？当前内容会被覆盖。')) return;
    setRestoring(true);
    try {
      await dbApi.updateNode(nodeId, { content: selected.newContent });
      await window.AgentSpaces.invokeService('node_changed', { kind: 'update', nodeId });
      onNodeChanged && onNodeChanged();
      onClose && onClose();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{
          width: 'min(760px, calc(100vw - 2rem))',
          maxWidth: 'min(760px, calc(100vw - 2rem))',
          maxHeight: '80vh',
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {RotateCcw ? <RotateCcw className="size-4 text-muted-foreground" /> : null}
              <DialogTitle className="text-sm font-medium">{T.versions}</DialogTitle>
            </div>
            <span className="text-xs text-muted-foreground">{versions.length} 条</span>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          {/* 左：版本列表 */}
          <div className="shrink-0 border-r border-border overflow-y-auto" style={{ width: 220 }}>
            {loading ? (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                {Loader2 ? <Loader2 className="size-3 animate-spin" /> : null}加载中…
              </div>
            ) : error ? (
              <div className="p-3 text-xs text-destructive">{error}</div>
            ) : versions.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground italic">暂无历史</div>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs border-b border-border/50 hover:bg-accent/50 cursor-pointer',
                    v.id === selectedId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                  )}
                >
                  <div className="font-medium truncate">{v.title || '未命名'}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{fmtTime(v.createdAt)}</div>
                </button>
              ))
            )}
          </div>

          {/* 右：并排快照 */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic">
                选择左侧版本查看
              </div>
            ) : (
              <>
                <div className="shrink-0 px-4 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{fmtTime(selected.createdAt)}</span>
                  <Button size="sm" variant="default" disabled={restoring} onClick={handleRestore}>
                    {restoring ? '还原中…' : '还原到此版本'}
                  </Button>
                </div>
                <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border">
                  <div className="flex flex-col min-h-0">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground border-b border-border bg-muted/30">
                      修改前
                    </div>
                    <ScrollArea className="flex-1">
                      <SnapshotPreview content={selected.oldContent} />
                    </ScrollArea>
                  </div>
                  <div className="flex flex-col min-h-0">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground border-b border-border bg-muted/30">
                      修改后
                    </div>
                    <ScrollArea className="flex-1">
                      <SnapshotPreview content={selected.newContent} />
                    </ScrollArea>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SnapshotPreview({ content }) {
  const c = String(content || '');
  if (!c.trim()) {
    return <div className="p-3 text-xs text-muted-foreground italic">（空）</div>;
  }
  // 若是 html（含标签）则渲染 iframe-like 预览；否则纯文本
  const isHtml = /<[a-z][\s\S]*>/i.test(c);
  if (isHtml) {
    return (
      <div
        className="p-3 text-xs leading-relaxed [&_*]:my-0.5"
        dangerouslySetInnerHTML={{ __html: c }}
      />
    );
  }
  return <pre className="p-3 text-xs whitespace-pre-wrap break-words font-mono">{c}</pre>;
}

export default VersionHistoryDialog;
