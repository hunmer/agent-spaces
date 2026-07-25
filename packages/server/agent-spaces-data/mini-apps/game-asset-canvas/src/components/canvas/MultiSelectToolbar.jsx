import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Layers, AlignHorizontalJustifyCenter, Trash2,
} from '@agent-spaces/ui';

/**
 * 画布底部「多选浮出 toolbar」：选中节点数 > 1 时居中浮出。
 * 从 Canvas.jsx 抽出。提供三个操作：
 * - 合并成分组（createGroupFromSelection）
 * - 对齐分布下拉（8 种模式）
 * - 批量删除（deleteSelectedNodes）
 *
 * 用 nodrag nopan 屏蔽画布交互（点击工具条不触发框选/平移）。
 *
 * @param {object} props
 * @param {number} props.selectionCount 选中节点数
 * @param {Function} props.onCreateGroup () => void
 * @param {Function} props.onAlignDistribute (mode: string) => void
 * @param {Function} props.onDeleteSelected () => void
 */
export default function MultiSelectToolbar({ selectionCount, onCreateGroup, onAlignDistribute, onDeleteSelected }) {
  if (!(selectionCount > 1)) return null;
  return (
    <div className="nodrag nopan pointer-events-auto absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-card-foreground shadow-md">
        <span className="px-1 text-xs text-muted-foreground">已选 {selectionCount}</span>
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onCreateGroup}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
        >
          <Layers className="h-3.5 w-3.5" />
          合并成分组
        </button>
        {/* 对齐分布下拉菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
              >
                <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
                对齐分布
              </button>
            }
          />
          <DropdownMenuContent align="center" className="text-xs">
            <DropdownMenuItem onClick={() => onAlignDistribute('left')}>左对齐</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlignDistribute('center-h')}>水平居中</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlignDistribute('right')}>右对齐</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlignDistribute('top')}>顶对齐</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlignDistribute('center-v')}>垂直居中</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlignDistribute('bottom')}>底对齐</DropdownMenuItem>
            <div className="my-1 h-px bg-border" />
            <DropdownMenuItem onClick={() => onAlignDistribute('h-dist')}>水平等距分布</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlignDistribute('v-dist')}>垂直等距分布</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
