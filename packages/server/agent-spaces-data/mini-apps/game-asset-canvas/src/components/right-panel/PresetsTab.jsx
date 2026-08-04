// 节点预设库 tab：展示已保存的预设，可点击添加（视口中心）或拖拽到画布（落点）。
// 卡片网格 + 响应式列数，复用 AddNodeTab 的卡片视觉风格。
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea, Plus, Trash2, Boxes } from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { MIN_CARD_WIDTH, MIN_COLS, MAX_COLS } from './constants';

/**
 * @param {Object} props
 * @param {Array} props.presets           预设列表（useNodePresets.presets）
 * @param {(presetId:string)=>void} props.onAdd              点击「+」添加到视口中心
 * @param {(presetId:string,e:object)=>void} props.onDragStartPreset  拖拽起始（写 MIME）
 * @param {(presetId:string)=>void} props.onDelete           删除预设
 */
export default function PresetsTab({ presets, onAdd, onDragStartPreset, onDelete }) {
  const scrollRef = useRef(null);
  const [cols, setCols] = useState(MIN_COLS);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') || scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const w = el.clientWidth;
      const n = Math.floor(w / MIN_CARD_WIDTH);
      setCols(Math.min(MAX_COLS, Math.max(MIN_COLS, n)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const list = useMemo(() => (Array.isArray(presets) ? presets : []), [presets]);

  return (
    <div ref={scrollRef} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">节点预设</span>
        <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{list.length}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {list.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onAdd={onAdd}
                onDragStartPreset={onDragStartPreset}
                onDelete={onDelete}
              />
            ))}
          </div>
          {list.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
              <Boxes className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">还没有预设</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                在画布上选中多个节点或分组后，<br />
                点击底部工具栏的【保存预设】即可创建。
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PresetCard({ preset, onAdd, onDragStartPreset, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const nodeCount = preset.nodes?.length || 0;
  const groupCount = preset.groups?.length || 0;
  const types = Array.from(new Set((preset.nodes || []).map((n) => n.type))).slice(0, 4);
  // 取每种类型的图标做预览
  const previewIcons = types
    .map((t) => NODE_META[t]?.icon || '🔷')
    .join('');

  return (
    <div
      className="relative flex flex-col gap-1 rounded-lg border border-border bg-background p-2.5 transition hover:border-primary/60 hover:shadow-sm"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 左上角：添加到视口中心 */}
      <button
        type="button"
        onClick={() => onAdd?.(preset.id)}
        title="添加到画布"
        className="absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {/* 右上角：删除（hover 显示） */}
      <button
        type="button"
        onClick={() => onDelete?.(preset.id)}
        title="删除预设"
        className={
          'absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-destructive/10 text-destructive transition hover:bg-destructive/20 ' +
          (hovered ? 'opacity-100' : 'opacity-0')
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {/* 主体：拖拽手柄 */}
      <div
        draggable
        onDragStart={(e) => onDragStartPreset?.(preset.id, e)}
        className="flex flex-1 cursor-grab flex-col items-center gap-1.5 pt-1 outline-none active:cursor-grabbing"
      >
        <span className="flex h-9 items-center justify-center rounded-md bg-primary/10 text-base tracking-tight">
          {previewIcons || '📦'}
        </span>
        <span className="line-clamp-2 text-center text-xs font-medium leading-tight">{preset.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {nodeCount} 节点{groupCount > 0 ? ` · ${groupCount} 分组` : ''}
        </span>
      </div>
    </div>
  );
}
