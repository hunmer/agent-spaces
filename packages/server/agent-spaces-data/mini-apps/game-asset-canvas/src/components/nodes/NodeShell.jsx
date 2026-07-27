import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import { Badge, Loader, RotateCcw } from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import useViewportActivation from '../../hooks/useViewportActivation';
import ImageResult from './ImageResult';

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
 * @param {string} props.id 节点 id（用于首次内容高度自适应上报）
 * @param {string} props.nodeType NODE_TYPES 之一
 * @param {object} props.data 节点 data
 * @param {boolean} [props.selected] 是否选中（选中才显示 resize 控件）
 * @param {boolean} [props.resizable] 是否允许调整大小，默认 true
 * @param {boolean} [props.targetHandle] 是否显示输入 Handle（顶部）
 * @param {boolean} [props.sourceHandle] 是否显示输出 Handle（底部）
 * @param {React.ReactNode} props.children 节点正文
 */
export default function NodeShell({
  id, nodeType, data, selected, resizable = true,
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
  const previewImages = data?.output?.images || [];
  const outputPreviewEnabled = !!data?.outputPreviewMode && (previewImages.length > 0 || status === 'running');
  const [hovered, setHovered] = useState(false);
  const onExportImages = data?.onExportImages;
  const onProcessImage = data?.onProcessImage;
  const onCutoutCreate = data?.onCutoutCreate;
  const onEditImages = data?.onEditImages;
  const onResetParams = data?.onResetParams;
  // 多选（选中数 > 1）时隐藏节点 toolbar：避免每个被选节点都冒出一排按钮，干扰多选操作
  const selectionCount = data?.selectionCount ?? 1;
  const rootRef = useRef(null);
  const pointerInsideRef = useRef(false);

  const reportOutputPreviewHeight = useCallback(() => {
    if (!outputPreviewEnabled || hovered) return;
    const root = rootRef.current;
    if (!root?.hasAttribute('data-output-preview')) return;
    const height = Math.ceil(root.scrollHeight);
    data?.onOutputPreviewHeight?.(height);
  }, [outputPreviewEnabled, hovered, data?.onOutputPreviewHeight]);

  useLayoutEffect(() => {
    if (!outputPreviewEnabled || hovered || !rootRef.current) return;
    const root = rootRef.current;
    const observer = new ResizeObserver(reportOutputPreviewHeight);
    observer.observe(root);
    reportOutputPreviewHeight();
    return () => observer.disconnect();
  }, [reportOutputPreviewHeight]);

  // 是否显示抠图/放大按钮：节点有产出图且有处理回调
  const showProcessButtons = outputImages.length > 0 && onProcessImage;
  // 是否显示抠图按钮（统一抠图节点）：节点有产出图且有创建回调
  const showCutoutButton = outputImages.length > 0 && onCutoutCreate;
  // 是否显示编辑按钮：节点有产出图且有编辑回调
  const showEditButton = outputImages.length > 0 && onEditImages;

  const handleMouseEnter = () => {
    pointerInsideRef.current = true;
    if (!outputPreviewEnabled) return;
    setHovered(true);
    data?.onOutputPreviewHover?.(true);
  };
  const handleMouseLeave = () => {
    pointerInsideRef.current = false;
    if (rootRef.current?.contains(document.activeElement)) return;
    setHovered(false);
    if (outputPreviewEnabled) data?.onOutputPreviewHover?.(false);
  };
  const handleFocusCapture = () => {
    if (!outputPreviewEnabled) return;
    setHovered(true);
    data?.onOutputPreviewHover?.(true);
  };
  const handleBlurCapture = (event) => {
    if (!outputPreviewEnabled) return;
    if (event.currentTarget.contains(event.relatedTarget) || pointerInsideRef.current) return;
    setHovered(false);
    data?.onOutputPreviewHover?.(false);
  };

  // 预览高度可能大于原表单高度。切回表单后节点会立即缩短，鼠标可能已在新边界外，
  // 此时节点自身收不到 mouseleave，需从 window 的指针移动重新判断实际边界。
  useEffect(() => {
    if (!outputPreviewEnabled || !hovered) return;
    const handlePointerMove = (event) => {
      const root = rootRef.current;
      if (!root || root.contains(document.activeElement)) return;
      const rect = root.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      pointerInsideRef.current = inside;
      if (inside) return;
      setHovered(false);
      data?.onOutputPreviewHover?.(false);
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [outputPreviewEnabled, hovered, data?.onOutputPreviewHover]);

  // 首次内容高度自适应 + 内容变化时持续跟随：测量「标题栏 + 内容区」真实高度并上报。
  // 内层测量 div（contentInnerRef）自然撑开，offsetHeight 恒等于内容真实高度（不受 overflow/flex 影响），
  // 故 observe 它能捕获 textarea 等子元素的高度变化；observe root 无效（root 高度恒 = node.height）。
  // 用户手动 NodeResizer 拖拽后置 userResizedRef=true，停止自动跟随，尊重手动尺寸（原 disconnect 约定的等价实现）。
  const viewportActivated = useViewportActivation(rootRef);
  const contentInnerRef = useRef(null);
  const userResizedRef = useRef(false);
  useLayoutEffect(() => {
    userResizedRef.current = false; // 重置：节点重挂载时恢复自动跟随
    const onAutoSizeToContent = data?.onAutoSizeToContent;
    const root = rootRef.current;
    const inner = contentInnerRef.current;
    if (!viewportActivated || !onAutoSizeToContent || !root || !id || !inner) return;

    const measure = () => {
      if (userResizedRef.current) return;
      const header = root.querySelector('[data-node-header]');
      if (!header) return;
      const h = header.offsetHeight + inner.offsetHeight + 2;
      if (h > 0) onAutoSizeToContent(id, h);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    measure();
    return () => ro.disconnect();
  }, [viewportActivated, data?.onAutoSizeToContent, id, outputPreviewEnabled]);

  if (outputPreviewEnabled && !hovered) {
    return (
      <div
        ref={rootRef}
        data-output-preview
        className="relative w-full overflow-hidden rounded-lg bg-card shadow-sm"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Badge
          variant="secondary"
          className="pointer-events-none absolute right-2 top-2 z-10 max-w-[calc(100%-1rem)] truncate bg-background/85 shadow-sm backdrop-blur-sm"
        >
          {meta.label}
        </Badge>
        {resizable && (
          <NodeResizer
            isVisible={!!selected}
            minWidth={220}
            minHeight={120}
            color="#6366f1"
            handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
            lineClassName="!border-primary/40"
            onResizeEnd={() => { userResizedRef.current = true; }}
          />
        )}
        {targetHandle && (
          <Handle
            type="target"
            position={Position.Top}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
          />
        )}
        <div className="nodrag nopan nowheel w-full">
          {status === 'running' ? (
            <div className="flex min-h-[160px] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader className="h-6 w-6" />
              <span className="text-xs">{data?.statusMsg || '处理中…'}</span>
            </div>
          ) : viewportActivated ? (
            <ImageResult images={previewImages} preview onImageLoad={reportOutputPreviewHeight} />
          ) : null}
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

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {(outputImages.length > 0 && onExportImages) || showProcessButtons || showEditButton || showCutoutButton ? (
        <NodeToolbar isVisible={selected && selectionCount <= 1} position={Position.Top} align="end" offset={8}>
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
            {/* 抠图按钮：创建统一抠图节点并预填当前产出图作为输入（替换原直接调工作流） */}
            {showCutoutButton && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCutoutCreate(outputImages); }}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
              >
                抠图
              </button>
            )}
            {/* 放大按钮：保留原直接调工作流逻辑（放大未合并进统一抠图节点） */}
            {showProcessButtons && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onProcessImage(outputImages, 'enhance'); }}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
              >
                放大
              </button>
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
          onResizeEnd={() => { userResizedRef.current = true; }}
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
        data-node-header
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: `rgb(${hexToRgb(meta.color)} / 0.12)` }}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="text-base leading-none">{meta.icon}</span>
          <span className="truncate text-sm font-semibold">{meta.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status !== 'idle' && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `rgb(${hexToRgb(statusColor)} / 0.15)`, color: statusColor }}
            >
              {STATUS_TEXT[status] || status}
            </span>
          )}
          {/* 重置参数：表单回 initialData 默认值 + 清掉该 nodeType 的持久化记忆。
              nodrag/nopan 防误触画布；仅对有 params 的节点注入（data.onResetParams 为 undefined 时不渲染） */}
          {onResetParams && (
            <button
              type="button"
              title="重置参数（恢复默认值并清除记忆）"
              onClick={(e) => { e.stopPropagation(); onResetParams(); }}
              className="rounded p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* nodrag/nopan/nowheel：ReactFlow 约定，带这些 class 的元素不触发节点拖拽、画布平移、滚轮缩放，
          避免在节点内滚动/选文本/操作输入框时误触画布 */}
      <div data-node-content className="scrollbar-none nodrag nopan nowheel flex min-h-0 flex-1 flex-col overflow-auto">
        <div ref={contentInnerRef} className="flex flex-col gap-2 p-3">
          {viewportActivated ? children : null}
        </div>
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
