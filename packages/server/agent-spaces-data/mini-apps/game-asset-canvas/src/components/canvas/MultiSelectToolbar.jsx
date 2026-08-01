import { useState } from 'react';
import {
  Layers, AlignStartVertical, AlignEndVertical, AlignStartHorizontal, AlignEndHorizontal,
  Trash2, LayoutGrid, ChevronDown,
  Popover, PopoverContent, PopoverTrigger,
} from '@agent-spaces/ui';

/**
 * 画布底部「多选浮出 toolbar」：选中节点数 > 1 时居中浮出。
 * - 合并成分组
 * - 对齐（左/右/顶/底，取边缘极值）
 * - 分布（网格布局表单）—— Popover 向上弹出
 * - 批量删除
 *
 * 用 nodrag nopan 屏蔽画布交互（点击工具条不触发框选/平移）。
 */

const ALIGN_ITEMS = [
  { mode: 'left', label: '左对齐', Icon: AlignStartVertical },
  { mode: 'right', label: '右对齐', Icon: AlignEndVertical },
  { mode: 'top', label: '顶对齐', Icon: AlignStartHorizontal },
  { mode: 'bottom', label: '底对齐', Icon: AlignEndHorizontal },
];

// 分布预设：rows × cols，间距统一 40。cols=0 表示「单列」，rows=0 表示「单行」，
// applyGridLayout 已按拓扑序填充，超出容量的节点保持原位。
const GRID_PRESETS = [
  { label: '2×2', rows: 2, cols: 2 },
  { label: '2×3', rows: 2, cols: 3 },
  { label: '3×3', rows: 3, cols: 3 },
  { label: '单行', rows: 1, cols: 99 },
  { label: '单列', rows: 99, cols: 1 },
];

export default function MultiSelectToolbar({
  selectionCount, onCreateGroup, onAlignDistribute, onApplyGridLayout, onDeleteSelected,
}) {
  const [distOpen, setDistOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [gapX, setGapX] = useState(40);
  const [gapY, setGapY] = useState(40);

  if (!(selectionCount > 1)) return null;

  // 点击预设：同步表单值 + 立即应用 + 关闭
  const applyPreset = (preset) => {
    const opt = { rows: preset.rows, cols: preset.cols, gapX: 40, gapY: 40 };
    setRows(preset.rows);
    setCols(preset.cols);
    setGapX(40);
    setGapY(40);
    onApplyGridLayout(opt);
    setDistOpen(false);
  };

  const baseBtn = 'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition';
  const labelBtn = `${baseBtn} border-border bg-background text-foreground hover:border-primary hover:text-primary`;
  const activeBtn = `${baseBtn} border-primary bg-primary/10 text-primary`;
  const iconBtn = 'flex items-center justify-center rounded-md border border-border bg-background p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary';
  const numberInput = 'w-14 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:border-primary';
  const presetBtn = 'rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground transition hover:border-primary hover:text-primary';

  return (
    <div className="nodrag nopan pointer-events-auto absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-card-foreground shadow-md">
        <span className="px-1 text-xs text-muted-foreground">已选 {selectionCount}</span>
        <div className="mx-1 h-4 w-px bg-border" />

        {/* 合并成分组 */}
        <button type="button" onClick={onCreateGroup} className={labelBtn}>
          <Layers className="h-3.5 w-3.5" />
          合并成分组
        </button>

        {/* 对齐：左/右/顶/底 —— Popover 向上弹出 */}
        <Popover open={alignOpen} onOpenChange={setAlignOpen}>
          <PopoverTrigger
            render={
              <button type="button" className={alignOpen ? activeBtn : labelBtn}>
                <AlignStartVertical className="h-3.5 w-3.5" />
                对齐
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            }
          />
          <PopoverContent side="top" align="center" className="w-auto p-1.5">
            <div className="mb-1 text-[10px] text-muted-foreground">对齐方式</div>
            <div className="grid grid-cols-2 gap-1">
              {ALIGN_ITEMS.map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  title={label}
                  onClick={() => { onAlignDistribute(mode); setAlignOpen(false); }}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-foreground transition hover:border-primary hover:text-primary"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* 分布（网格布局）—— Popover 向上弹出 */}
        <Popover
          open={distOpen}
          onOpenChange={setDistOpen}
        >
          <PopoverTrigger
            render={
              <button type="button" className={distOpen ? activeBtn : labelBtn}>
                <LayoutGrid className="h-3.5 w-3.5" />
                分布
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            }
          />
          <PopoverContent side="top" align="center" className="w-64 p-2.5">
            {/* 常用预设：点击立即应用，跳过填表单 */}
            <div className="mb-1 text-[10px] text-muted-foreground">常用预设</div>
            <div className="mb-2 flex flex-wrap gap-1">
              {GRID_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={presetBtn}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mb-1.5 border-t border-border" />
            <div className="mb-1.5 text-[10px] text-muted-foreground">自定义布局（按最上游优先排序）</div>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                行数
                <input type="number" min="1" max="20" value={rows}
                  onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))}
                  className={numberInput} />
              </label>
              <label className="flex items-center gap-1">
                列数
                <input type="number" min="1" max="20" value={cols}
                  onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))}
                  className={numberInput} />
              </label>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                水平间距
                <input type="number" min="0" value={gapX}
                  onChange={(e) => setGapX(Math.max(0, Number(e.target.value) || 0))}
                  className={numberInput} />
              </label>
              <label className="flex items-center gap-1">
                垂直间距
                <input type="number" min="0" value={gapY}
                  onChange={(e) => setGapY(Math.max(0, Number(e.target.value) || 0))}
                  className={numberInput} />
              </label>
            </div>
            <button
              type="button"
              onClick={() => { onApplyGridLayout({ rows, cols, gapX, gapY }); setDistOpen(false); }}
              className="mt-2 w-full rounded-md border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              应用布局
            </button>
          </PopoverContent>
        </Popover>

        {/* 批量删除 */}
        <button
          type="button"
          onClick={onDeleteSelected}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          批量删除
        </button>
      </div>
    </div>
  );
}
