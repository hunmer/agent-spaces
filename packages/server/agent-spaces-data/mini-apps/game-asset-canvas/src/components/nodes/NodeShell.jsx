import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import { Badge, FilePenLine, Images, Loader, RotateCcw } from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import useViewportActivation from '../../hooks/useViewportActivation';
import ImageResult from './ImageResult';
import NodeOutput from './NodeOutput';
import FloatingHandle from './FloatingHandle';
import { FLOATING_HANDLE_OFFSET } from '../canvas/floating-edge-utils';

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
  const canPreviewOutput = previewImages.length > 0 || status === 'running';
  const outputPreviewEnabled = data?.outputPreviewMode === true && canPreviewOutput;
  // 产出卡片 props（预览分支与正常分支共用）：图片/回调/版本/状态
  const outputProps = {
    status,
    statusMsg: data?.statusMsg,
    images: data?.output?.images || [],
    fileName: data?.params?.fileName,
    onAddToAssets: data?.onAddToAssets,
    onAddImages: data?.onAddImages,
    onRemoveImage: data?.onRemoveImage,
    onClearImages: data?.onClearImages,
    versions: data?.versions,
    activeVersion: data?.activeVersion,
    onSwitchVersion: data?.onSwitchVersion,
  };
  const onExportImages = data?.onExportImages;
  const onProcessImage = data?.onProcessImage;
  const onCutoutCreate = data?.onCutoutCreate;
  const onEditImages = data?.onEditImages;
  const onResetParams = data?.onResetParams;
  // 多选（选中数 > 1）时隐藏节点 toolbar：避免每个被选节点都冒出一排按钮，干扰多选操作
  const selectionCount = data?.selectionCount ?? 1;
  const [toolbarHovered, setToolbarHovered] = useState(false);
  const toolbarVisible = (!!selected || toolbarHovered) && selectionCount <= 1;
  const toolbarLeaveTimerRef = useRef(null);
  const showToolbar = () => {
    if (toolbarLeaveTimerRef.current) clearTimeout(toolbarLeaveTimerRef.current);
    setToolbarHovered(true);
  };
  const hideToolbar = () => {
    if (toolbarLeaveTimerRef.current) clearTimeout(toolbarLeaveTimerRef.current);
    toolbarLeaveTimerRef.current = setTimeout(() => setToolbarHovered(false), 120);
  };
  useEffect(() => () => {
    if (toolbarLeaveTimerRef.current) clearTimeout(toolbarLeaveTimerRef.current);
  }, []);
  const rootRef = useRef(null);
  // 跟踪节点主体宽度，让产出卡片与节点同宽（产出卡片在 fragment 第二根，不在节点 height 钳制内）
  const [nodeWidth, setNodeWidth] = useState(0);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const update = () => setNodeWidth(root.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const reportOutputPreviewHeight = useCallback(() => {
    if (!outputPreviewEnabled) return;
    const root = rootRef.current;
    if (!root?.hasAttribute('data-output-preview')) return;
    const card = root.querySelector('[data-node-card]');
    // 用 offsetHeight（受 maxHeight 限制的可视高度），避免多图时节点被撑得过长
    const height = Math.ceil(card?.offsetHeight || root.clientHeight);
    data?.onOutputPreviewHeight?.(height);
  }, [outputPreviewEnabled, data?.onOutputPreviewHeight]);

  useLayoutEffect(() => {
    if (!outputPreviewEnabled || !rootRef.current) return;
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

  if (outputPreviewEnabled) {
    return (
      <>
      {/* 顶部行：版本数字按钮（可滚动）+ 类型 Badge。 */}
      <div className="nodrag nopan relative z-20 mb-1 flex items-center gap-1.5 px-1" style={{ width: nodeWidth || undefined }}>
        {Array.isArray(data?.versions) && data.versions.length > 1 && data?.onSwitchVersion && (
          <div
            className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            onWheelCapture={(e) => {
              // ctrl+wheel 默认触发画布缩放；这里转成横向滚动并阻止冒泡
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.scrollLeft += e.deltaY || e.deltaX;
            }}
          >
            {data.versions.map((v, i) => (
              <button
                key={i}
                type="button"
                title={v?.createdAt ? new Date(v.createdAt).toLocaleString() : `版本 ${i + 1}`}
                onClick={(e) => { e.stopPropagation(); data.onSwitchVersion(i); }}
                className={
                  'flex size-5 shrink-0 items-center justify-center rounded-full border bg-background text-[10px] font-medium shadow-sm transition ' +
                  (i === (data?.activeVersion ?? data.versions.length - 1)
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground hover:border-primary hover:text-primary')
                }
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
        <Badge
          variant="secondary"
          className="ml-auto max-w-[50%] shrink-0 truncate bg-background/85 shadow-sm backdrop-blur-sm"
        >
          {meta.label}
        </Badge>
      </div>
      <div
        ref={rootRef}
        data-output-preview
        className="relative w-full overflow-visible"
        onMouseEnter={showToolbar}
        onMouseLeave={hideToolbar}
      >
        <NodeToolbar isVisible={toolbarVisible} position={Position.Top} align="center" offset={8}>
          <div
            className="flex items-center justify-center"
            onMouseEnter={showToolbar}
            onMouseLeave={hideToolbar}
          >
            <button
              type="button"
              title="切换到表单"
              onClick={(event) => {
                event.stopPropagation();
                data?.onOutputPreviewModeChange?.(false);
              }}
              className="nodrag nopan flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
            >
              <FilePenLine className="h-3.5 w-3.5" />
              表单
            </button>
          </div>
        </NodeToolbar>
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
          <FloatingHandle
            type="target"
            position={Position.Top}
            style={{ top: -FLOATING_HANDLE_OFFSET, zIndex: 50 }}
          />
        )}
        <div data-node-card className="mx-auto w-full overflow-hidden rounded-lg bg-card shadow-sm" style={{ maxWidth: '640px' }}>
          <div className="scrollbar-none nodrag nopan nowheel w-full" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {status === 'running' ? (
              <div className="flex min-h-[160px] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader className="h-6 w-6" />
                <span className="text-xs">{data?.statusMsg || '处理中…'}</span>
              </div>
            ) : viewportActivated ? (
              <ImageResult images={previewImages} preview onImageLoad={reportOutputPreviewHeight} />
            ) : null}
          </div>
        </div>
        {sourceHandle && (
          <FloatingHandle
            type="source"
            position={Position.Bottom}
            style={{ bottom: -FLOATING_HANDLE_OFFSET, zIndex: 50 }}
          />
        )}
      </div>
      </>
    );
  }

  return (
    <>
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-visible"
      onMouseEnter={showToolbar}
      onMouseLeave={hideToolbar}
    >
      {canPreviewOutput || (outputImages.length > 0 && onExportImages) || showProcessButtons || showEditButton || showCutoutButton ? (
        <NodeToolbar isVisible={toolbarVisible} position={Position.Top} align="center" offset={8}>
          <div
            className="flex items-center justify-center gap-1"
            onMouseEnter={showToolbar}
            onMouseLeave={hideToolbar}
          >
            {canPreviewOutput && (
              <button
                type="button"
                title="查看节点输出"
                onClick={(event) => {
                  event.stopPropagation();
                  data?.onOutputPreviewModeChange?.(true);
                }}
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
              >
                <Images className="h-3.5 w-3.5" />
                查看输出
              </button>
            )}
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
            {outputImages.length > 0 && onExportImages && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onExportImages(outputImages); }}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
              >
                导出图片
              </button>
            )}
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
        <FloatingHandle
          type="target"
          position={Position.Top}
          style={{ top: -FLOATING_HANDLE_OFFSET, zIndex: 50 }}
        />
      )}
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
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
      </div>
      {sourceHandle && (
        <FloatingHandle
          type="source"
          position={Position.Bottom}
          style={{ bottom: -FLOATING_HANDLE_OFFSET, zIndex: 50 }}
        />
      )}
    </div>
    {/* 产出卡片：节点外部下方独立卡片，不随表单滚动，不受 resize 钳制。 */}
    <NodeOutput
      {...outputProps}
      width={nodeWidth || undefined}
      hasExternalSourceHandle={!!sourceHandle}
    />
    </>
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
