import { useState } from 'react';
import {
  Layers, AlignHorizontalJustifyCenter, Trash2, LayoutGrid, ChevronDown,
  Popover, PopoverContent, PopoverTrigger,
} from '@agent-spaces/ui';

/**
 * 画布底部「多选浮出 toolbar」：选中节点数 > 1 时居中浮出。
 * - 合并成分组
 * - 对齐（九宫格）/ 分布（网格布局表单）—— 均用 Popover 向上弹出
 * - 批量删除
 *
 * 用 nodrag nopan 屏蔽画布交互（点击工具条不触发框选/平移）。
 */
const GRID_MODES = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'middle-center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

// 单个九宫格方位按钮：实心方块代表「目标方位」
function AlignGridButton({ mode, onClick }) {
  const [v, h] = mode.split('-');
  const tx = h === 'center' ? -50 : 0;
  const ty = v === 'middle' ? -50 : 0;
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      title={mode}
      className="flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary"
      style={{ width: 22, height: 22, position: 'relative' }}
    >
      <span
        style={{
          position: 'absolute',
          width: 5, height: 5, borderRadius: 1,
          background: 'currentColor',
          left: h === 'left' ? 2 : h === 'center' ? '50%' : 'auto',
          right: h === 'right' ? 2 : 'auto',
          top: v === 'top' ? 2 : v === 'middle' ? '50%' : 'auto',
          bottom: v === 'bottom' ? 2 : 'auto',
          transform: tx || ty ? `translate(${tx}%, ${ty}%)` : 'none',
        }}
      />
    </button>
  );
}

export default function MultiSelectToolbar({
  selectionCount, onCreateGroup, onAlignDistribute, onApplyGridLayout, onDeleteSelected,
}) {
  const [alignOpen, setAlignOpen] = useState(false);
  const [distOpen, setDistOpen] = useState(false);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [gapX, setGapX] = useState(40);
  const [gapY, setGapY] = useState(40);

  if (!(selectionCount > 1)) return null;

  const baseBtn = 'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition';
  const labelBtn = `${baseBtn} border-border bg-background text-foreground hover:border-primary hover:text-primary`;
  const activeBtn = `${baseBtn} border-primary bg-primary/10 text-primary`;
  const numberInput = 'w-14 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:border-primary';

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

        {/* 对齐（九宫格）—— Popover 向上弹出 */}
        <Popover
          open={alignOpen}
          onOpenChange={(v) => { setAlignOpen(v); if (v) setDistOpen(false); }}
        >
          <PopoverTrigger
            render={
              <button type="button" className={alignOpen ? activeBtn : labelBtn}>
                <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
                对齐
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            }
          />
          <PopoverContent side="top" align="center" className="w-auto p-2">
            <div className="mb-1 text-[10px] text-muted-foreground">对齐到选中区域</div>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(3, 22px)' }}>
              {GRID_MODES.flat().map((mode) => (
                <AlignGridButton
                  key={mode}
                  mode={mode}
                  onClick={(m) => { onAlignDistribute(m); setAlignOpen(false); }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* 分布（网格布局）—— Popover 向上弹出 */}
        <Popover
          open={distOpen}
          onOpenChange={(v) => { setDistOpen(v); if (v) setAlignOpen(false); }}
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
            <div className="mb-1.5 text-[10px] text-muted-foreground">网格布局（按最上游优先排序）</div>
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
