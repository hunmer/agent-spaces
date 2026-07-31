import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, ScrollArea, Button, openMediaGallery,
} from '@agent-spaces/ui';
import { PROMPT_CATEGORIES } from '../utils/prompts';
import { ASPECT_OPTIONS } from '../utils/constants';
import { resolveReferenceImages } from '../utils/workflow';
import usePromptLibrary from '../hooks/usePromptLibrary';
import ImageHoverCard from './ImageHoverCard';

/**
 * 提示词选择器：内置库 + 用户自定义库合并展示。
 *
 * - 自定义提示词持久化到 configs/prompt-library.json（usePromptLibrary），内置库不可删。
 * - pickerMode=true（默认，节点表单入口）：点选卡片 → onPick(item) 填充并关闭。
 * - pickerMode=false（顶部菜单「提示词管理」入口）：纯管理，点卡片不填充不关闭，仅展示/编辑/删除。
 * - onPick 传整个 item（含可选 aspect）：调用方据此联动设置比例下拉。
 *
 * @param {{ open:boolean, scene?:'text'|'edit', pickerMode?:boolean, onClose:()=>void, onPick?:(item:object)=>void }} props
 */
export default function PromptPickerDialog({ open, scene = 'text', pickerMode = true, onClose, onPick }) {
  const { mergedPrompts, savePrompt, deletePrompt, resetPrompts } = usePromptLibrary();
  const [activeCat, setActiveCat] = useState(null); // null = 全部
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState(null); // null=关闭，对象=正在新增/编辑

  // 合并：custom 在前 builtin 在后；都按 scene 过滤
  const merged = useMemo(() => {
    const custom = mergedPrompts
      .filter((p) => p.custom && (p.scene === scene || p.scene === 'both'));
    const builtin = mergedPrompts
      .filter((p) => !p.custom && (p.scene === scene || p.scene === 'both'));
    return [...custom, ...builtin];
  }, [scene, mergedPrompts]);

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return merged.filter((p) => {
      if (activeCat && p.category !== activeCat) return false;
      if (!kw) return true;
      return (
        p.title.toLowerCase().includes(kw)
        || p.desc.toLowerCase().includes(kw)
        || p.prompt.toLowerCase().includes(kw)
      );
    });
  }, [merged, activeCat, keyword]);

  const handlePick = (item) => {
    if (!pickerMode) return; // 管理模式：点卡片不填充、不关闭
    onPick?.(item);
    onClose?.();
  };

  const handleDelete = (e, item) => {
    e.stopPropagation();
    const label = item.builtin ? '内置' : '自定义';
    if (window.confirm(`删除${label}提示词「${item.title}」？${item.builtin ? '（重置后会恢复）' : ''}`)) {
      deletePrompt(item.id).catch((err) => console.error('deletePrompt failed:', err));
    }
  };

  // 重置：默认值覆盖同 id，保留用户独有新增
  const handleReset = () => {
    if (window.confirm('重置提示词库？\n内置项恢复默认值（含已删除/编辑过的），\n你新增的提示词会保留。')) {
      resetPrompts().catch((err) => console.error('resetPrompts failed:', err));
    }
  };

  const cats = useMemo(() => {
    const sceneCats = new Set(merged.map((p) => p.category));
    return PROMPT_CATEGORIES.filter((c) => sceneCats.has(c.id));
  }, [merged]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setEditing(null); onClose?.(); } }}>
      <DialogContent className="flex h-[80vh] max-h-[640px] !w-[80vw] !max-w-[80vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle>📋 提示词库{pickerMode ? '' : ' · 管理'}</DialogTitle>
        </DialogHeader>

        {/* 搜索 + 分类 + 新建 */}
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
          <div className="flex gap-2">
            <Input
              placeholder="搜索标题 / 描述 / 关键词…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => setEditing({ id: '', title: '', desc: '', prompt: '', category: cats[0]?.id || 'character', aspect: '', scene })}
            >
              ➕ 新建
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={handleReset}
              title="用默认值覆盖同 id 项，保留你新增的提示词"
            >
              ↺ 重置
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <CatChip active={!activeCat} onClick={() => setActiveCat(null)}>全部</CatChip>
            {cats.map((c) => (
              <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
                {c.icon} {c.label}
              </CatChip>
            ))}
          </div>
        </div>

        {/* 新增/编辑表单（内联） */}
        {editing && (
          <PromptEditor
            key={editing.id || 'new'}
            initial={editing}
            scene={scene}
            onSave={async (item) => {
              try {
                await savePrompt({ ...item, id: item.id || `cust-${Date.now().toString(36)}`, custom: true });
                setEditing(null);
              } catch (err) {
                console.error('savePrompt failed:', err);
              }
            }}
            onCancel={() => setEditing(null)}
          />
        )}

        {/* 提示词卡片列表 */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
            {list.length === 0 && (
              <p className="col-span-full py-10 text-center text-xs text-muted-foreground">无匹配提示词</p>
            )}
            {list.map((p) => {
              const refImages = resolveReferenceImages(p.references);
              return (
                <div
                  key={p.id}
                  className="group relative flex flex-col gap-1 rounded-md border border-border bg-background p-3 text-left transition hover:border-primary hover:bg-accent"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handlePick(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePick(p);
                      }
                    }}
                    className="flex flex-1 flex-col gap-1 text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      {p.custom && !p.builtin && <span className="rounded bg-primary/15 px-1 text-[10px] text-primary">自</span>}
                      {p.builtin && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">默</span>}
                      <span className="line-clamp-1 text-sm font-medium">{p.title}</span>
                      {p.aspect && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{p.aspect}</span>}
                      {refImages.length > 0 && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">🖼 {refImages.length}</span>}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{p.desc}</span>
                    {refImages.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {refImages.map((src, i) => (
                          <ImageHoverCard
                            key={i}
                            url={src}
                            triggerShape="fixed"
                            className="h-12 w-12 shrink-0 bg-muted"
                            renderTrigger={() => (
                              <button
                                type="button"
                                title="点击查看大图"
                                onClick={(e) => {
                                  // 阻止冒泡到卡片选中按钮，避免选中提示词并关闭弹窗
                                  e.stopPropagation();
                                  openMediaGallery(refImages.map((url) => ({ src: url, type: 'image' })), i);
                                }}
                                className="block h-full w-full cursor-pointer overflow-hidden rounded transition hover:border-primary"
                              >
                                <img src={src} alt={`参考图 ${i + 1}`} className="h-full w-full object-cover" />
                              </button>
                            )}
                          />
                        ))}
                      </div>
                    )}
                    <span className="line-clamp-3 font-mono text-[11px] leading-relaxed text-muted-foreground/70 group-hover:text-muted-foreground">
                      {p.prompt}
                    </span>
                  </div>
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-primary"
                      title="编辑"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, p)}
                      className="rounded bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-red-500"
                      title="删除"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** 新增/编辑自定义提示词的内联表单 */
function PromptEditor({ initial, scene, onSave, onCancel }) {
  const [title, setTitle] = useState(initial.title || '');
  const [desc, setDesc] = useState(initial.desc || '');
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const [category, setCategory] = useState(initial.category || 'character');
  const [aspect, setAspect] = useState(initial.aspect || '');

  const valid = title.trim() && prompt.trim();

  const submit = () => {
    if (!valid) return;
    onSave({
      id: initial.id,
      title: title.trim(),
      desc: desc.trim(),
      prompt: prompt.trim(),
      category,
      scene: initial.scene || scene,
      ...(aspect ? { aspect } : {}),
    });
  };

  return (
    <div className="shrink-0 space-y-2 border-b border-border bg-muted/30 px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          placeholder="标题 *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          placeholder="简短描述"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>
      <textarea
        className="min-h-[72px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        placeholder="提示词正文 *"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {PROMPT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          value={aspect}
          onChange={(e) => setAspect(e.target.value)}
        >
          <option value="">比例（可选）</option>
          {ASPECT_OPTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button type="button" size="sm" disabled={!valid} onClick={submit}>保存</Button>
        </div>
      </div>
    </div>
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
