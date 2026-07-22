import { Handle, NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import { NODE_META } from '../../utils/constants';

const STATUS_TEXT = {
  idle: '',
  running: '生成中…',
  done: '完成',
  error: '出错',
};

/**
 * 节点外壳：统一标题栏、输入/输出 Handle、状态角标、可调整大小（NodeResizer）。
 *
 * resize 机制（参考 https://reactflow.dev/api-reference/components/node-resizer）：
 * - NodeResizer 放在节点根元素内部，拖拽触发 onNodesChange 的 dimensions 变更。
 * - 节点本身需要有显式 width/height（由 Canvas 创建节点时通过 style 提供）。
 * - NodeResizer 默认可见；这里改为选中时显示，避免误触。
 *
 * @param {object} props
 * @param {string} props.nodeType NODE_TYPES 之一
 * @param {object} props.data 节点 data
 * @param {boolean} [props.selected] 是否选中（选中才显示 resize 控件）
 * @param {boolean} [props.resizable] 是否允许调整大小，默认 true
 * @param {boolean} [props.targetHandle] 是否显示输入 Handle（顶部）
 * @param {boolean} [props.sourceHandle] 是否显示输出 Handle（底部）
 * @param {React.ReactNode} props.children 节点正文
 */
export default function NodeShell({
  nodeType, data, selected, resizable = true,
  targetHandle, sourceHandle, children,
}) {
  const meta = NODE_META[nodeType] || { label: '节点', icon: '🔹', color: '#64748b' };
  const status = data?.status || 'idle';
  const statusColor = status === 'running' ? '#3b82f6'
    : status === 'error' ? '#ef4444'
    : status === 'done' ? '#10b981'
    : '#94a3b8';
  // 产出图片：文生图/编辑节点存在 data.output.images；图片展示节点存在 data.images
  const outputImages = data?.output?.images?.length ? data.output.images : (data?.images || []);
  const onExportImages = data?.onExportImages;
  const onProcessImage = data?.onProcessImage;
  const onEditImages = data?.onEditImages;

  // 是否显示抠图/放大按钮：节点有产出图且有处理回调
  const showProcessButtons = outputImages.length > 0 && onProcessImage;
  // 是否显示编辑按钮：节点有产出图且有编辑回调
  const showEditButton = outputImages.length > 0 && onEditImages;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {(outputImages.length > 0 && onExportImages) || showProcessButtons || showEditButton ? (
        <NodeToolbar isVisible={selected} position={Position.Top} align="end" offset={8}>
          <div className="flex items-center gap-1">
            {showEditButton && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditImages(outputImages); }}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
              >
                编辑
              </button>
            )}
            {showProcessButtons && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onProcessImage(outputImages, 'segment'); }}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
                >
                  抠图
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onProcessImage(outputImages, 'enhance'); }}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
                >
                  放大
                </button>
              </>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onExportImages(outputImages); }}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
            >
              导出图片
            </button>
          </div>
        </NodeToolbar>
      ) : null}
      {resizable && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={220}
          minHeight={120}
          color="#6366f1"
          handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
          lineClassName="!border-primary/40"
        />
      )}
      {targetHandle && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        />
      )}
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: `rgb(${hexToRgb(meta.color)} / 0.12)` }}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="text-base leading-none">{meta.icon}</span>
          <span className="truncate text-sm font-semibold">{meta.label}</span>
        </div>
        {status !== 'idle' && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `rgb(${hexToRgb(statusColor)} / 0.15)`, color: statusColor }}
          >
            {STATUS_TEXT[status] || status}
          </span>
        )}
      </div>
      {/* nodrag/nopan/nowheel：ReactFlow 约定，带这些 class 的元素不触发节点拖拽、画布平移、滚轮缩放，
          避免在节点内滚动/选文本/操作输入框时误触画布 */}
      <div className="nodrag nopan nowheel flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        {children}
      </div>
      {sourceHandle && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}
    </div>
  );
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const num = parseInt(n, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `${r} ${g} ${b}`;
}
