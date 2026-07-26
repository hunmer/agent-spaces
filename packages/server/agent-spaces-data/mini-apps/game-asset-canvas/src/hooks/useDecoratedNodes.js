import { useMemo } from 'react';
import { NODE_TYPES, IMAGE_TAGS } from '../utils/constants';
import { computeInputImages } from '../utils/input-images';
import { dedupeTags } from '../utils/canvas-constants';

/**
 * 给每个节点的 data 注入回调与派生数据（computeInputImages 派生输入图 + 注入执行/编辑回调）。
 * 从 Canvas.jsx 抽出（原 B13）。
 *
 * 注意：不要覆盖 node.selected —— 选中状态由 ReactFlow 通过 onNodesChange 的
 * selection 变更 + applyNodeChanges 自行管理；这里强行赋值会破坏点击选中/删除机制。
 * 对「图片接收节点」(editImage/imageDisplay)，有连入边时用 computeInputImages 派生输入图片覆盖 data.images，
 * 无连入边时保留节点自身手动值（粘贴/上传）。ImageDisplay 同时置 source='upstream' 让 UI 区分来源。
 *
 * @param {object} deps
 * @param {Array} deps.nodes
 * @param {Array} deps.edges
 * @param {number} deps.selectionCount
 * @param {boolean} deps.outputPreviewMode 是否优先展示节点图片输出
 * @param {object} deps.outputPreviewState 节点预览高度与 hover 临时状态
 * @param {Function} deps.onOutputPreviewHeight 上报节点预览高度
 * @param {Function} deps.onOutputPreviewHover 上报节点 hover 状态
 * @param {object} deps.settings
 * @param {object} deps.callbacks  注入到节点 data 的回调集合：
 *   { makeOnUpdate, onGenerate, onGenerateMedia, onExportImages, onProcessImage, onProcessLocal,
 *     onCutout, onCutoutCreate, onCancelProcess, onPromptReverse, onEditImages, onAutoSize, onAutoSizeToContent,
 *     onBBoxCutout }
 * @returns {{ decoratedNodes: Array }}
 */
export default function useDecoratedNodes({
  nodes, edges, selectionCount, outputPreviewMode, outputPreviewState,
  onOutputPreviewHeight, onOutputPreviewHover, settings, callbacks,
}) {
  const upstreamMap = useMemo(() => computeInputImages(nodes, edges), [nodes, edges]);

  const decoratedNodes = useMemo(() => {
    const {
      makeOnUpdate, onGenerate, onGenerateMedia, onExportImages,
      onProcessImage, onProcessLocal, onCutout, onCutoutCreate, onCancelProcess,
      onPromptReverse, onEditImages, onAutoSize, onAutoSizeToContent, onBBoxCutout, onResetParams,
    } = callbacks || {};
    return nodes.map((nd) => {
      const up = upstreamMap.get(nd.id);
      const data = { ...nd.data };
      if (up) {
        data.images = up.images;
        if (up.isDisplay) {
          data.source = 'upstream';
          data.tags = dedupeTags([...(nd.data?.tags || []), IMAGE_TAGS.upstream]);
        }
      }
      const preview = outputPreviewState?.[nd.id];
      const previewEnabled = outputPreviewMode && data?.output?.images?.length > 0;
      const previewHeight = previewEnabled && !preview?.hovered ? preview?.height : null;
      return {
        ...nd,
        ...(previewHeight ? {
          height: previewHeight,
          style: { ...nd.style, height: previewHeight },
        } : {}),
        // 图片展示节点：限定只能从 .image-drag-handle 拖动（图片区域可点选/看大图不触发拖拽）
        dragHandle: nd.type === NODE_TYPES.imageDisplay ? '.image-drag-handle' : nd.dragHandle,
        data: {
          ...data,
          selectionCount,
          outputPreviewMode,
          onOutputPreviewHeight: (height) => onOutputPreviewHeight?.(nd.id, height),
          onOutputPreviewHover: (hovered) => onOutputPreviewHover?.(nd.id, hovered),
          onUpdate: makeOnUpdate?.(nd.id),
          onGenerate,
          onGenerateMedia,
          onExportImages: (imgs) => onExportImages?.(nd, imgs),
          onProcessImage,
          onProcessLocal,
          onCutout,
          onCutoutCreate,
          onCancelProcess,
          onPromptReverse,
          onEditImages: (imgs) => onEditImages?.(imgs),
          onAutoSize,
          onAutoSizeToContent,
          // BBox 查看器 AI 分析配置（从 settings 注入，仅 bboxViewer 节点用；systemPrompt 归 agent preset）
          agentConfig: nd.type === NODE_TYPES.bboxViewer ? {
            id: settings.bboxAgentConfigId || '',
            userPrompt: settings.bboxAiUserPrompt || '',
            compressThresholdMB: Number(settings.bboxCompressThresholdMB) || 0,
            compressTargetMB: Number(settings.bboxCompressTargetMB) || 0,
          } : undefined,
          // BBox 查看器元素拆分抠图回调（仅 bboxViewer 用）
          onCutout: nd.type === NODE_TYPES.bboxViewer ? onBBoxCutout : undefined,
          // 重置参数回调：仅对有 params 的节点注入（imageDisplay/note/uiSplitter 等无 params 不注入）
          onResetParams: (data?.params != null && typeof data.params === 'object')
            ? () => onResetParams?.(nd.id, nd.type)
            : undefined,
        },
      };
    });
  }, [
    nodes, upstreamMap, selectionCount, outputPreviewMode, outputPreviewState,
    onOutputPreviewHeight, onOutputPreviewHover, settings, callbacks,
  ]);

  return { decoratedNodes };
}
