/**
 * 分组容器节点。
 *
 * 设计：作为 ReactFlow 普通节点渲染，position/width/height 由 Canvas 在创建时
 * 根据子节点包围盒算好后写入（自动贴合子节点）。本组件只负责样式与「删除」按钮，
 * 不再重算 bounds —— 这样无需 ViewportPortal / useStore（保持零宿主改动）。
 *
 * 注意：图标用 emoji（非 lucide-react）—— mini-app 的 @xyflow allowlist 不含
 * lucide-react，且经 @agent-spaces/ui 的 `export *` 转发图标在 react-renderer
 * 解析时部分图标为 undefined，故用 emoji 规避依赖问题。
 *
 * 子节点 id 列表存于 data.childIds，仅用于删除分组时清理关联（Canvas 处理）。
 *
 * @param {object} props
 * @param {object} props.data 分组 data（name / childIds / onDeleteGroup）
 */
export default function GroupNode({ data }) {
  const name = data?.name || '未命名分组';
  const count = data?.childIds?.length || 0;
  const onDelete = data?.onDeleteGroup;

  return (
    <div
      className="flex h-full w-full flex-col rounded-lg border-2 border-dashed"
      style={{
        borderColor: 'rgba(99,102,241,0.4)',
        backgroundColor: 'rgba(99,102,241,0.05)',
      }}
    >
      <div
        className="nodrag nopan flex shrink-0 items-center justify-between gap-2 px-3 py-1.5"
        style={{ backgroundColor: 'rgba(99,102,241,0.1)' }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-sm leading-none">📁</span>
          <span className="truncate text-xs font-semibold">{name}</span>
          {count > 0 && (
            <span className="shrink-0 rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {onDelete && (
          <button
            type="button"
            title="删除分组"
            onClick={(e) => { e.stopPropagation(); onDelete(data?.id); }}
            className="shrink-0 rounded px-1 text-sm leading-none text-muted-foreground transition hover:bg-black/10 hover:text-destructive"
          >
            🗑
          </button>
        )}
      </div>
      {/* 空正文：分组容器仅作视觉边界，子节点是独立节点叠在其上方（zIndex 更低） */}
      <div className="min-h-0 flex-1" />
    </div>
  );
}

