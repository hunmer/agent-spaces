/**
 * 顶部工具栏：自动布局 / 导出 / 设置 / 清空，右侧插槽放执行队列。
 * @param {{ onClear, onAutoLayout, onExport, onOpenSettings, count, queueSlot }} props
 */
export default function Toolbar({ onClear, onAutoLayout, onExport, onOpenSettings, count, queueSlot }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <span className="mr-1 text-sm font-semibold">🎮 游戏资产生成画布</span>
      <div className="mx-1 h-5 w-px bg-border" />

      <button
        type="button"
        onClick={onAutoLayout}
        title="按连线方向自动排列节点"
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
      >
        ⊕ 自动布局
      </button>
      <button
        type="button"
        onClick={onExport}
        title="导出整张画布为 JSON"
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
      >
        ⬇ 导出 JSON
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        title="设置目标工作流"
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
      >
        ⚙ 设置
      </button>

      <div className="ml-auto flex items-center gap-2">
        {queueSlot}
        <span className="text-xs text-muted-foreground">{count} 个节点</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-red-500 hover:text-red-500"
        >
          清空
        </button>
      </div>
    </div>
  );
}
