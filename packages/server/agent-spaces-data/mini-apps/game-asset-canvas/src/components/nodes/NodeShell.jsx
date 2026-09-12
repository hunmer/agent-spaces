import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NodeResizer, useUpdateNodeInternals } from '@xyflow/react';
import {
  Badge, ChevronDown, ClipboardCopy, Download, FolderPlus, Loader, RotateCcw, Skeleton, toast,
  ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from '@agent-spaces/ui';
import BorderBeam from '../BorderBeam';
import { NODE_META, NODE_TYPES } from '../../utils/constants';
import { downloadImages } from '../../utils/export';
import useViewportActivation from '../../hooks/useViewportActivation';
import ImageResult from './ImageResult';
import SpinePreviewViewer from './SpinePreviewViewer';
import NodeOutput from './NodeOutput';
import VideoResult from './VideoResult';
import EditableNodeTitle from './EditableNodeTitle';
import NodeHandles from './NodeHandles';
import NodeHoverMenu from './NodeHoverMenu';

const STATUS_TEXT = {
  idle: '',
  running: '生成中…',
  done: '完成',
  error: '出错',
};

/**
 * 从右键事件 target 向上找带 data-image-selection-url 的图片元素。
 * 输入图（FileUpload）和输出图（ImageResult）都挂这个属性，统一识别。
 * 返回图片 url 或 null。
 */
function resolveContextImageUrl(eventTarget) {
  if (!eventTarget?.closest) return null;
  const el = eventTarget.closest('[data-image-selection-url]');
  const url = el?.dataset?.imageSelectionUrl;
  return url || null;
}

/**
 * 图片右键菜单内容：添加到素材库 / 下载图片 / 复制图片地址。
 * 复用 @agent-spaces/ui 的 ContextMenuItem，与画布右键菜单风格统一。
 */
function ImageContextMenuItems({ url, onAddToAssets }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { ok, total, failed } = await downloadImages([url]);
      if (failed > 0) toast.warning(`下载失败：${failed}/${total}`);
      else toast.success('已下载图片');
    } catch (err) {
      toast.error(err?.message || '下载失败');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('已复制图片地址');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleAddToAssets = () => {
    onAddToAssets?.({ url });
  };

  return (
    <ContextMenuGroup>
      <ContextMenuLabel>图片</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleAddToAssets}>
        <FolderPlus />
        添加到素材库
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDownload} disabled={downloading}>
        {downloading ? <Loader className="animate-spin" /> : <Download />}
        下载图片
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCopyUrl}>
        <ClipboardCopy />
        复制图片地址
      </ContextMenuItem>
    </ContextMenuGroup>
  );
}

function isNodeFooterAction(child) {
  if (!isValidElement(child)) return false;
  // 显式标记：带 data-fixed-footer 的子元素整体固定到底部（可包含按钮组/错误信息，不限单个 w-full 按钮）
  if (child.props?.['data-fixed-footer'] !== undefined) return true;
  if (child.props?.type !== 'button') return false;
  return typeof child.props?.className === 'string' && /(?:^|\s)w-full(?:\s|$)/.test(child.props.className);
}

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
  targetHandle, sourceHandle, children, toolbarActions, onRun,
}) {
  const showFullNode = data?.compactView !== true;
  const meta = NODE_META[nodeType] || { label: '节点', icon: '🔹', color: '#64748b' };
  const customTitle = data?.title || data?.label;
  // 兼容旧节点/队列占位：历史数据可能只有 loading=true，首次恢复时也必须显示运行占位。
  const status = data?.status || (data?.loading ? 'running' : 'idle');
  const queuePosition = Math.max(0, Number(data?.queuePosition) || 0);
  const isRunning = status === 'running' || data?.queueStatus === 'running';
  const statusColor = status === 'running' ? '#3b82f6'
    : status === 'error' ? '#ef4444'
    : status === 'done' ? '#10b981'
    : '#94a3b8';
  // 产出图片：文生图/编辑节点存在 data.output.images；图片展示节点存在 data.images
  const outputImages = data?.output?.images?.length ? data.output.images : (data?.images || []);
  const previewImages = data?.output?.images || [];
  const previewVideos = Array.isArray(data?.output?.videos) ? data.output.videos.filter(Boolean) : [];
  // spineDisplay 的产出是 spineAssets（三件套），非 images，需单独判断
  const hasSpineAssets = nodeType === NODE_TYPES.spineDisplay
    && !!(data?.spineAssets?.skel && data?.spineAssets?.atlas && data?.spineAssets?.png);
  const canPreviewOutput = previewImages.length > 0 || previewVideos.length > 0 || hasSpineAssets || status === 'running';
  const outputPreviewEnabled = data?.outputPreviewMode === true && canPreviewOutput;
  const onUpdate = data?.onUpdate;
  // 产出卡片 props（预览分支与正常分支共用）：图片/回调/版本/状态
  const outputProps = {
    nodeId: id,
    status,
    statusMsg: data?.statusMsg,
    images: data?.output?.images || [],
    videos: previewVideos,
    resources: data?.output?.resources || [],
    text: nodeType === NODE_TYPES.promptReverse ? (data?.output?.text || '') : '',
    fileName: data?.params?.fileName,
    onAddToAssets: data?.onAddToAssets,
    onAddImages: data?.onAddImages,
    onRemoveImage: data?.onRemoveImage,
    onRemoveVersionImages: data?.onRemoveVersionImages,
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
  // 多选（选中数 > 1）时隐藏节点 toolbar：避免每个被选节点都冒出一排按钮，干扰多选操作
  const selectionCount = data?.selectionCount ?? 1;
  const [toolbarHovered, setToolbarHovered] = useState(false);
  const [nodeMenuOpen, setNodeMenuOpen] = useState(false);
  const [previewFormExpanded, setPreviewFormExpanded] = useState(false);
  useEffect(() => {
    setPreviewFormExpanded(outputPreviewEnabled && !!selected);
  }, [outputPreviewEnabled, selected]);
  useEffect(() => {
    if (!previewFormExpanded) return undefined;
    const handleDocumentPointerDown = (event) => {
      const target = event.target;
      const insideNode = rootRef.current?.contains(target) || outputRef.current?.contains(target);
      const insidePanel = target?.closest?.('[data-preview-form-panel]');
      if (!insideNode && !insidePanel) setPreviewFormExpanded(false);
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  }, [previewFormExpanded]);
  const toolbarVisible = showFullNode && (toolbarHovered || nodeMenuOpen) && selectionCount <= 1;
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
  const footerRef = useRef(null);
  const outputRef = useRef(null);
  const updateNodeInternals = useUpdateNodeInternals();
  // 图片右键菜单：右键命中图片缩略图才弹出 ContextMenu（与画布右键菜单同款组件、同款风格）；
  // 命中节点空白/标题等非图片区域则放行浏览器原生菜单。
  // urlRef 存当前右键命中的图片 url，避免 ContextMenuItem onClick 闭包读旧值。
  const contextImageUrlRef = useRef(null);
  const [contextImageOpen, setContextImageOpen] = useState(false);
  const handleContextMenuOpenChange = useCallback((open, eventDetails) => {
    if (!open) {
      contextImageUrlRef.current = null;
      setContextImageOpen(false);
      return;
    }
    const url = resolveContextImageUrl(eventDetails.event?.target);
    if (!url) {
      // 未命中图片：cancel 放行给浏览器原生菜单（与画布右键菜单一致）
      eventDetails.cancel();
      return;
    }
    contextImageUrlRef.current = url;
    setContextImageOpen(true);
  }, []);
  const childItems = Children.toArray(children);
  let footerIndex = -1;
  for (let i = childItems.length - 1; i >= 0; i -= 1) {
    if (isNodeFooterAction(childItems[i])) {
      footerIndex = i;
      break;
    }
  }
  const footerAction = footerIndex >= 0 ? childItems[footerIndex] : null;
  const hasFooterAction = footerAction !== null;
  // 节点直属的全宽按钮视为主操作，从滚动内容中抽出并固定到底部 footer。
  const contentChildren = footerIndex >= 0
    ? childItems.filter((_, index) => index !== footerIndex)
    : childItems;
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

  useLayoutEffect(() => {
    const output = outputRef.current;
    if (!output || !id || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateNodeInternals(id));
    observer.observe(output);
    updateNodeInternals(id);
    return () => observer.disconnect();
  }, [id, updateNodeInternals]);

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
  const previewFormInnerRef = useRef(null);
  const userResizedRef = useRef(false);
  useLayoutEffect(() => {
    userResizedRef.current = false; // 重置：节点重挂载时恢复自动跟随
    const onAutoSizeToContent = data?.onAutoSizeToContent;
    const root = rootRef.current;
    const inner = contentInnerRef.current;
    // 运行占位使用固定的加载内容高度，不能用它覆盖节点已持久化的手动尺寸。
    if (status === 'running' || !viewportActivated || !onAutoSizeToContent || !root || !id || !inner) return;

    const measure = () => {
      if (userResizedRef.current) return;
      const header = root.querySelector('[data-node-header]');
      if (!header) return;
      const h = header.offsetHeight + inner.offsetHeight + (footerRef.current?.offsetHeight || 0) + 2;
      if (h > 0) onAutoSizeToContent(id, h);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    if (footerRef.current) ro.observe(footerRef.current);
    measure();
    return () => ro.disconnect();
  }, [status, viewportActivated, data?.onAutoSizeToContent, id, outputPreviewEnabled, showFullNode, hasFooterAction]);

  const compactView = !showFullNode ? (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-lg border bg-card shadow-sm ${
        selected
          ? 'border-primary ring-4 ring-primary/70 ring-offset-2 ring-offset-background'
          : 'border-border'
      }`}
      style={{ backgroundColor: `rgb(${hexToRgb(meta.color)} / 0.16)` }}
    >
      <div className="flex max-w-full items-center gap-3 px-4">
        <span className="shrink-0 text-3xl leading-none">{meta.icon}</span>
        <span className="truncate text-xl font-semibold text-card-foreground">{customTitle || meta.label}</span>
        {status !== 'idle' && (
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
        )}
      </div>
    </div>
  ) : null;

  const handleCopyNodeInfo = async () => {
    try {
      const nodeJson = data?.nodeJson || JSON.stringify({ id, type: nodeType, data }, null, 2);
      await navigator.clipboard.writeText(nodeJson);
      toast.success('已复制节点信息');
    } catch {
      toast.error('复制节点信息失败');
    } finally {
      setNodeMenuOpen(false);
    }
  };

  // 原节点顶部工具栏动作统一收进 hover 后出现的右下角菜单，动作回调保持不变。
  const menuActions = [
    data?.onApplyToGroup ? {
      key: 'apply-to-group',
      label: '应用到其他节点',
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      onClick: data.onApplyToGroup,
    } : null,
    ...(toolbarActions || []).map((action, index) => ({
      key: action.key || `custom-${index}`,
      label: action.title || action.label,
      icon: action.icon,
      disabled: action.disabled,
      onClick: action.onClick,
    })),
    outputImages.length > 0 && onExportImages ? {
      key: 'export-images',
      label: '导出图片',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: () => onExportImages(outputImages),
    } : null,
    onResetParams ? {
      key: 'reset-params',
      label: '重置参数',
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      onClick: onResetParams,
    } : null,
    {
      key: 'copy-node-info',
      label: '复制节点信息',
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      onClick: handleCopyNodeInfo,
    },
  ];

  if (outputPreviewEnabled) {
    return (
      <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger render={<div className="contents" />}>
      {/* 顶部行：版本数字按钮（可滚动）+ 类型 Badge。 */}
      <div className={`nodrag nopan relative z-20 mb-1 flex items-center gap-1.5 px-1 ${showFullNode ? '' : 'invisible'}`} style={{ width: nodeWidth || undefined }}>
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
        {queuePosition > 0 && (
          <Badge variant="outline" className="ml-auto shrink-0 border-amber-500/50 bg-amber-500/10 text-amber-600">
            队列中 #{queuePosition}
          </Badge>
        )}
        <div className={`${queuePosition > 0 ? '' : 'ml-auto'} flex max-w-[50%] min-w-0 shrink-0 rounded-md bg-background/85 px-2.5 py-0.5 text-xs font-semibold shadow-sm backdrop-blur-sm`}>
          <EditableNodeTitle
            value={customTitle}
            fallback={meta.label}
            onChange={(title) => onUpdate?.({ title })}
            className="truncate"
            inputClassName="h-5 w-full rounded px-1 text-xs"
          />
        </div>
      </div>
      <div
        ref={rootRef}
        data-output-preview
        className={`relative min-h-0 w-full overflow-visible ${isRunning ? 'h-full' : 'h-fit'}`}
        style={{ height: isRunning ? '100%' : 'fit-content' }}
        onMouseEnter={showToolbar}
        onMouseLeave={hideToolbar}
        onClickCapture={() => setPreviewFormExpanded(true)}
      >
        {isRunning && (
          <BorderBeam
            className="z-30 rounded-lg"
            colorFrom="#3b82f6"
            colorTo="#8b5cf6"
            duration={3}
            borderWidth={2}
          />
        )}
        <NodeHoverMenu
          actions={menuActions}
          visible={toolbarVisible}
          open={nodeMenuOpen}
          onOpenChange={setNodeMenuOpen}
          onRun={onRun || data?.onRunNode}
          onDelete={data?.onDeleteNode}
          running={isRunning}
        />
        {resizable && (
          <NodeResizer
            isVisible={!!selected && showFullNode}
            minWidth={220}
            minHeight={120}
            color="#6366f1"
            handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
            lineClassName="!border-primary/40"
            onResizeEnd={() => { userResizedRef.current = true; }}
          />
        )}
        <NodeHandles target={targetHandle} source={sourceHandle} />
        <div data-node-card className={`mx-auto h-full w-full overflow-hidden rounded-lg bg-card shadow-sm ${showFullNode ? '' : 'invisible pointer-events-none'}`} style={{ maxWidth: '640px' }}>
          <div className="scrollbar-none nodrag nopan nowheel h-full w-full" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {status === 'running' ? (
              <div className="relative h-full min-h-[160px] w-full overflow-hidden">
                <Skeleton className="absolute inset-0 h-full w-full rounded-none opacity-70" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader className="h-6 w-6 animate-spin" />
                  <span className="text-xs">{data?.statusMsg || '处理中…'}</span>
                </div>
              </div>
            ) : viewportActivated ? (
              hasSpineAssets ? (
                <SpinePreviewViewer
                  spineAssets={data?.spineAssets}
                  params={data?.params}
                  onHeightChange={reportOutputPreviewHeight}
                />
              ) : (
                <>
                  <ImageResult nodeId={id} images={previewImages} resources={data?.output?.resources || []} preview onImageLoad={reportOutputPreviewHeight} />
                </>
              )
            ) : null}
          </div>
        </div>
        {previewVideos.length > 0 && (
          <div ref={outputRef} className="relative mt-1" style={{ width: nodeWidth || undefined }}>
            <VideoResult videos={previewVideos} />
            <NodeHandles sourceBottom={sourceHandle} />
          </div>
        )}
        {compactView}
      </div>
      {previewFormExpanded && (
        <div
          className="relative mt-1 w-full overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
          style={{ maxWidth: nodeWidth || undefined }}
          data-preview-form-panel
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-expanded="true"
            className="flex w-full items-center gap-1.5 border-b border-border bg-muted/60 px-2.5 py-1.5 text-left text-xs font-medium hover:bg-muted"
            onClick={() => setPreviewFormExpanded(false)}
          >
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">编辑参数</span>
          </button>
          <div className="scrollbar-none nodrag nopan nowheel max-h-[60vh] overflow-auto">
            <div ref={previewFormInnerRef} className="flex flex-col gap-2 p-3">
              {viewportActivated ? contentChildren : null}
            </div>
            {viewportActivated && footerAction && (
              <div className="nodrag nopan nowheel border-t border-border bg-card p-3">
                {footerAction}
              </div>
            )}
          </div>
        </div>
      )}
      </ContextMenuTrigger>
      {contextImageOpen && contextImageUrlRef.current && (
        <ContextMenuContent className="w-52">
          <ImageContextMenuItems
            url={contextImageUrlRef.current}
            onAddToAssets={data?.onAddToAssets}
          />
        </ContextMenuContent>
      )}
      </ContextMenu>
    );
  }

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
    <ContextMenuTrigger render={<div className="contents" />}>
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-visible"
      onMouseEnter={showToolbar}
      onMouseLeave={hideToolbar}
    >
      {isRunning && (
        <BorderBeam
          className="z-30 rounded-lg"
          colorFrom="#3b82f6"
          colorTo="#8b5cf6"
          duration={3}
          borderWidth={2}
        />
      )}
      <NodeHoverMenu
        actions={menuActions}
        visible={toolbarVisible}
        open={nodeMenuOpen}
        onOpenChange={setNodeMenuOpen}
        onRun={onRun || data?.onRunNode}
        onDelete={data?.onDeleteNode}
        running={isRunning}
      />
      {resizable && (
        <NodeResizer
          isVisible={!!selected && showFullNode}
          minWidth={220}
          minHeight={120}
          color="#6366f1"
          handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
          lineClassName="!border-primary/40"
          onResizeEnd={() => { userResizedRef.current = true; }}
        />
      )}
      <NodeHandles target={targetHandle} sourceRight={sourceHandle} />
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <div
        data-node-header
        className={`flex shrink-0 items-center justify-between gap-2 px-3 py-2 ${showFullNode ? '' : 'invisible pointer-events-none'}`}
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: `rgb(${hexToRgb(meta.color)} / 0.12)` }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background/80 text-base leading-none shadow-sm"
            aria-hidden="true"
          >
            {meta.icon}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <EditableNodeTitle
              value={customTitle}
              fallback={meta.label}
              onChange={(title) => onUpdate?.({ title })}
              className="truncate text-sm font-semibold leading-tight"
              inputClassName="h-6 w-full rounded px-1 text-sm font-semibold"
            />
            <span className="truncate text-[10px] leading-tight text-muted-foreground">
              {data?.subtitle || meta.subtitle || '画布节点'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {queuePosition > 0 && (
            <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-600">
              队列中 #{queuePosition}
            </Badge>
          )}
          {status !== 'idle' && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `rgb(${hexToRgb(statusColor)} / 0.15)`, color: statusColor }}
            >
              {STATUS_TEXT[status] || status}
            </span>
          )}
        </div>
      </div>
      {compactView}
      {/* nodrag/nopan/nowheel：ReactFlow 约定，带这些 class 的元素不触发节点拖拽、画布平移、滚轮缩放，
          避免在节点内滚动/选文本/操作输入框时误触画布 */}
      <div data-node-content className={`scrollbar-none nodrag nopan nowheel flex min-h-0 flex-1 flex-col overflow-auto ${showFullNode ? '' : 'invisible pointer-events-none'}`}>
        <div ref={contentInnerRef} className="flex flex-col gap-2 p-3">
          {viewportActivated ? contentChildren : null}
        </div>
      </div>
      {viewportActivated && footerAction && (
        <div ref={footerRef} data-node-footer className="nodrag nopan nowheel shrink-0 border-t border-border bg-card p-3">
          {footerAction}
        </div>
      )}
      </div>
    </div>
    {/* 产出卡片：节点外部下方独立卡片，不随表单滚动，不受 resize 钳制。 */}
    <div
      ref={outputRef}
      className={`relative ${showFullNode ? '' : 'invisible pointer-events-none'}`}
    >
      <NodeOutput
        {...outputProps}
        width={nodeWidth || undefined}
      />
      <NodeHandles sourceBottom={sourceHandle} />
    </div>
    </ContextMenuTrigger>
    {contextImageOpen && contextImageUrlRef.current && (
      <ContextMenuContent className="w-52">
        <ImageContextMenuItems
          url={contextImageUrlRef.current}
          onAddToAssets={data?.onAddToAssets}
        />
      </ContextMenuContent>
    )}
    </ContextMenu>
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
