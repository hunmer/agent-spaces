import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, ScrollArea,
} from '@agent-spaces/ui';
import { PROMPT_CATEGORIES, getPromptsByScene } from '../utils/prompts';

/**
 * 提示词选择器：从内置提示词库挑一条，快速填充到提示词输入框。
 *
 * @param {{ open:boolean, scene:'text'|'edit', onClose:()=>void, onPick:(prompt:string)=>void }} props
 *   - scene: 'text'(文生图) 或 'edit'(编辑图片)，据此过滤可见条目
 *   - onPick: 选中后回调，返回提示词正文
 */
export default function PromptPickerDialog({ open, scene = 'text', onClose, onPick }) {
  const [activeCat, setActiveCat] = useState(null); // null = 全部
  const [keyword, setKeyword] = useState('');

  const list = useMemo(() => {
    const base = getPromptsByScene(scene);
    const kw = keyword.trim().toLowerCase();
    return base.filter((p) => {
      if (activeCat && p.category !== activeCat) return false;
      if (!kw) return true;
      return (
        p.title.toLowerCase().includes(kw)
        || p.desc.toLowerCase().includes(kw)
        || p.prompt.toLowerCase().includes(kw)
      );
    });
  }, [scene, activeCat, keyword]);

  const handlePick = (prompt) => {
    onPick?.(prompt);
    onClose?.();
  };

  // 可用分类（仅展示当前场景下有内容的分类）
  const cats = useMemo(() => {
    const sceneCats = new Set(getPromptsByScene(scene).map((p) => p.category));
    return PROMPT_CATEGORIES.filter((c) => sceneCats.has(c.id));
  }, [scene]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="flex h-[80vh] max-h-[640px] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle>📋 提示词库</DialogTitle>
        </DialogHeader>

        {/* 搜索 + 分类切换 */}
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
          <Input
            placeholder="搜索标题 / 描述 / 关键词…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            <CatChip active={!activeCat} onClick={() => setActiveCat(null)}>全部</CatChip>
            {cats.map((c) => (
              <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
                {c.icon} {c.label}
              </CatChip>
            ))}
          </div>
        </div>

        {/* 提示词卡片列表 */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
            {list.length === 0 && (
              <p className="col-span-full py-10 text-center text-xs text-muted-foreground">无匹配提示词</p>
            )}
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePick(p.prompt)}
                className="group flex flex-col gap-1 rounded-md border border-border bg-background p-3 text-left transition hover:border-primary hover:bg-accent"
              >
                <span className="line-clamp-1 text-sm font-medium">{p.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{p.desc}</span>
                <span className="line-clamp-3 font-mono text-[11px] leading-relaxed text-muted-foreground/70 transition group-hover:text-muted-foreground">
                  {p.prompt}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function CatChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-2.5 py-0.5 text-xs transition '
        + (active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}
