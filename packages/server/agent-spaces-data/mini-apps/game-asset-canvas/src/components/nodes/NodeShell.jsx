import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import { Badge, Images, Loader, RotateCcw, Upload, EyeOff } from '@agent-spaces/ui';
import { NODE_META, NODE_TYPES } from '../../utils/constants';
import useViewportActivation from '../../hooks/useViewportActivation';
import ImageResult from './ImageResult';
import SpinePreviewViewer from './SpinePreviewViewer';
import NodeOutput from './NodeOutput';
import FloatingHandle from './FloatingHandle';
import { UploadCollapseContext } from './UploadSection';
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
  targetHandle, sourceHandle, children, toolbarActions,
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
  // spineDisplay 的产出是 spineAssets（三件套），非 images，需单独判断
  const hasSpineAssets = nodeType === NODE_TYPES.spineDisplay
    && !!(data?.spineAssets?.skel && data?.spineAssets?.atlas && data?.spineAssets?.png);
  const canPreviewOutput = previewImages.length > 0 || hasSpineAssets || status === 'running';
  const outputPreviewEnabled = data?.outputPreviewMode === true && canPreviewOutput;
  const onUpdate = data?.onUpdate;
  // 产出卡片 props（预览分支与正常分支共用）：图片/回调/版本/状态
  const outputProps = {
    nodeId: id,
    status,
    statusMsg: data?.statusMsg,
    images: data?.output?.images || [],
    text: nodeType === NODE_TYPES.promptReverse ? (data?.output?.text || '') : '',
    fileName: data?.params?.fileName,
    onAddToAssets: data?.onAddToAssets,
    onAddImages: data?.onAddImages,
    onRemoveImage: data?.onRemoveImage,
    onClearImages: data?.onClearImages,
    onReorderImages: data?.onReorderImages,
    versions: data?.versions,
    activeVersion: data?.activeVersion,
    onSwitchVersion: data?.onSwitchVersion,
    onClearText: nodeType === NODE_TYPES.promptReverse
      ? () => onUpdate?.({ output: { ...(data?.output || {}), text: '' }, status: 'idle', error: undefined, statusMsg: '' })
      : undefined,
  };
  const onExportImages = data?.onExportImages;
  const onResetParams = data?.onResetParams;
  // 上传控件折叠态（持久化到 data.uploadHidden）。首次 status 变 done 时自动折叠一次（用户手动切过则不再自动）。
  const uploadHidden = data?.uploadHidden === true;
  const userToggledUploadRef = useRef(false);
  useEffect(() => {
    if (userToggledUploadRef.current) return;
    // 首次完成：status 从非 done → done 时自动折叠上传区
    if (status === 'done' && !uploadHidden) {
      userToggledUploadRef.current = true;
      onUpdate?.({ uploadHidden: true });
    }
  }, [status, uploadHidden, onUpdate]);
  const toggleUpload = useCallback(() => {
    userToggledUploadRef.current = true;
    onUpdate?.({ uploadHidden: !uploadHidden });
  }, [uploadHidden, onUpdate]);
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
  // 注：【编辑】【抠图】【放大】已移到画布级 ImageSelectionToolbar（图片选中后顶部浮出），NodeShell 不再渲染。
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

  // 统一的 toolbar 按钮组：预览/正常分支共用，避免进入预览后按钮消失。
  // 切换预览 + 节点自定义按钮（toolbarActions）+ 导出图片。
  // 【编辑】【抠图】【放大】已移到画布级 ImageSelectionToolbar（图片选中后顶部浮出）。
  const hasExtraButtons = outputImages.length > 0 && onExportImages;
  const shouldShowToolbar = canPreviewOutput || hasExtraButtons || toolbarActions?.length;
  const toolbarButtons = (
    <>
      {/* 切换预览：始终展示，点击在表单/预览模式间切换 */}
      <button
        type="button"
        title={outputPreviewEnabled ? '切换到表单' : '切换到预览'}
        onClick={(event) => {
          event.stopPropagation();
          data?.onOutputPreviewModeChange?.(!outputPreviewEnabled);
        }}
        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
      >
        <Images className="h-3.5 w-3.5" />
        切换预览
      </button>
      {/* 节点自定义 toolbar 按钮（如「打开骨骼编辑器」「打开图片编辑」等对话框入口） */}
      {toolbarActions?.map((action, i) => (
        <button
          key={i}
          type="button"
          title={action.title || action.label}
          disabled={action.disabled}
          onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      {/* 编辑/抠图/放大 已移到画布级 ImageSelectionToolbar（图片选中后顶部浮出） */}
      {outputImages.length > 0 && onExportImages && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExportImages(outputImages); }}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
        >
          导出图片
        </button>
      )}
    </>
  );

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
            className="flex items-center justify-center gap-1"
            onMouseEnter={showToolbar}
            onMouseLeave={hideToolbar}
          >
            {toolbarButtons}
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
              hasSpineAssets ? (
                <SpinePreviewViewer
                  spineAssets={data?.spineAssets}
                  params={data?.params}
                  onHeightChange={reportOutputPreviewHeight}
                />
              ) : (
                <ImageResult nodeId={id} images={previewImages} preview onImageLoad={reportOutputPreviewHeight} />
              )
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
      {shouldShowToolbar ? (
        <NodeToolbar isVisible={toolbarVisible} position={Position.Top} align="center" offset={8}>
          <div
            className="flex items-center justify-center gap-1"
            onMouseEnter={showToolbar}
            onMouseLeave={hideToolbar}
          >
            {toolbarButtons}
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
          {/* 切换上传控件显隐：折叠态持久化到 data.uploadHidden */}
          <button
            type="button"
            title={uploadHidden ? '显示上传区' : '隐藏上传区'}
            onClick={(e) => { e.stopPropagation(); toggleUpload(); }}
            className={
              'rounded p-1 transition hover:bg-foreground/10 hover:text-foreground ' +
              (uploadHidden ? 'text-foreground' : 'text-muted-foreground')
            }
          >
            {uploadHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {/* nodrag/nopan/nowheel：ReactFlow 约定，带这些 class 的元素不触发节点拖拽、画布平移、滚轮缩放，
          避免在节点内滚动/选文本/操作输入框时误触画布 */}
      <div data-node-content className="scrollbar-none nodrag nopan nowheel flex min-h-0 flex-1 flex-col overflow-auto">
        <div ref={contentInnerRef} className="flex flex-col gap-2 p-3">
          <UploadCollapseContext.Provider value={uploadHidden}>
            {viewportActivated ? children : null}
          </UploadCollapseContext.Provider>
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
