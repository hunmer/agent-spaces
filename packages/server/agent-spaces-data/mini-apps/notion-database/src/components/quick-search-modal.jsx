// 快速搜索对话框。
// 沙箱化：剥离 store / sdk / next-intl / @/lib/cn / @agent-spaces/shared 类型。
// 使用 window.AgentSpacesUI 暴露的 Command 组件（CommandDialog 包装：Dialog + Command 一体），
// 键盘导航、Enter 选中由 Command 内置实现；onSelect 回调触发 onSelect(nodeId) + onClose。
import { useState, useEffect, useMemo } from 'react';
import * as dbApi from '../utils/db.js';
import { T } from '../utils/constants.js';

const {
  Dialog,
  DialogContent,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Search,
} = window.AgentSpacesUI || {};

const cn = (...a) => a.filter(Boolean).join(' ');

export function QuickSearchModal({ open, onClose, onSelect }) {
  const [nodes, setNodes] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await dbApi.listNodes();
        if (!cancelled) setNodes(list.filter((n) => !n.isTrash));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 重置搜索词
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const parentMap = useMemo(() => {
    const m = new Map();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const getPath = (node) => {
    const parts = [];
    let cur = node;
    let depth = 0;
    while (cur?.parentId && depth < 10) {
      const p = parentMap.get(cur.parentId);
      if (!p) break;
      parts.unshift(p.title || '未命名');
      cur = p;
      depth++;
    }
    return parts;
  };

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = nodes;
    if (!term) {
      return base.slice().sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, 10);
    }
    return base.filter((n) => {
      const title = String(n.title || '').toLowerCase();
      const content = String(n.content || '').toLowerCase();
      return title.includes(term) || content.includes(term);
    });
  }, [q, nodes]);

  const handleSelect = (id) => {
    onSelect && onSelect(id);
    onClose && onClose();
  };

  // 优先用 Command 组件；若 host 未暴露则回退到自建 Input + 列表
  if (Command && CommandInput && CommandList && CommandItem) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="!max-w-[560px] !p-0 !gap-0 overflow-hidden">
          <Command shouldFilter={false} className="rounded-lg">
            <div className="flex items-center border-b border-border px-3">
              {Search ? <Search className="size-4 text-muted-foreground shrink-0" /> : null}
              <CommandInput
                value={q}
                onValueChange={setQ}
                placeholder={T.search}
                className="h-11"
              />
            </div>
            <CommandList className="max-h-[360px]">
              {loading ? (
                <div className="py-6 text-center text-xs text-muted-foreground">加载中…</div>
              ) : results.length === 0 ? (
                <CommandEmpty>无结果</CommandEmpty>
              ) : (
                <CommandGroup heading={q ? `匹配 (${results.length})` : '最近编辑'}>
                  {results.map((n) => {
                    const path = getPath(n);
                    return (
                      <CommandItem
                        key={n.id}
                        value={n.id}
                        onSelect={() => handleSelect(n.id)}
                        className="cursor-pointer"
                      >
                        <span className="text-base bg-muted border border-border p-0.5 rounded shrink-0 mr-2">
                          {n.icon || '📝'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{n.title || '未命名'}</div>
                          {path.length > 0 ? (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {path.join(' / ')}
                            </div>
                          ) : null}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    );
  }

  // 回退：自建 Input + 键盘导航列表
  return (
    <FallbackSearch open={open} onClose={onClose} onSelect={handleSelect} q={q} setQ={setQ} results={results} loading={loading} getPath={getPath} />
  );
}

function FallbackSearch({ open, onClose, onSelect, q, setQ, results, loading, getPath }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const onKey = (e) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((p) => (p + 1) % Math.max(1, results.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((p) => (p - 1 + results.length) % Math.max(1, results.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = results[idx];
        if (sel) onSelect(sel.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, idx, onSelect]);

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[560px]">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          {Search ? <Search className="size-4 text-muted-foreground" /> : null}
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder={T.search}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <div className="max-h-[360px] overflow-y-auto space-y-0.5 mt-1">
          {loading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">加载中…</div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground italic">无结果</div>
          ) : (
            results.map((n, i) => {
              const path = getPath(n);
              return (
                <button
                  key={n.id}
                  onClick={() => onSelect(n.id)}
                  className={cn(
                    'w-full text-left p-2 rounded-md flex items-center gap-2 text-sm cursor-pointer border-l-2',
                    i === idx ? 'bg-accent border-primary' : 'border-transparent hover:bg-accent/50',
                  )}
                >
                  <span className="text-base bg-muted border border-border p-0.5 rounded shrink-0">
                    {n.icon || '📝'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{n.title || '未命名'}</div>
                    {path.length > 0 ? (
                      <div className="text-[10px] text-muted-foreground truncate">{path.join(' / ')}</div>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default QuickSearchModal;
