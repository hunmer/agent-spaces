import { useMemo } from 'react';
import { NODE_TYPES, IMAGE_TAGS, modelValuesToOptions } from '../utils/constants';
import { computeInputImages, computeInputTexts, computeInputVideos, computeInputSpineAssets } from '../utils/input-images';
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
 * @param {string[]} deps.protectedImageUrls 当前分组素材实例的只读 URL（兼容旧快照）
 * @param {number} deps.selectionCount
 * @param {object} deps.outputPreviewState 节点预览高度临时状态
 * @param {Function} deps.onOutputPreviewHeight 上报节点预览高度
 * @param {Function} deps.onOutputPreviewModeChange 设置单节点输出预览模式
 * @param {object} deps.settings
 * @param {object} deps.callbacks  注入到节点 data 的回调集合：
 *   { makeOnUpdate, onGenerate, onGenerateMedia, onExportImages, onProcessImage, onProcessLocal,
 *     onCutout, onCutoutCreate, onCancelProcess, onPromptReverse, onEditImages, onAutoSize, onAutoSizeToContent,
 *     onBBoxCutout }
 * @returns {{ decoratedNodes: Array }}
 */
export default function useDecoratedNodes({
  nodes, edges, propertyApplyNodeIds, protectedImageUrls = [], selectionCount, outputPreviewState,
  onOutputPreviewHeight, onOutputPreviewModeChange, settings, callbacks,
}) {
  const upstreamMap = useMemo(() => computeInputImages(nodes, edges), [nodes, edges]);
  const upstreamTextsMap = useMemo(() => computeInputTexts(nodes, edges), [nodes, edges]);
  const upstreamVideosMap = useMemo(() => computeInputVideos(nodes, edges), [nodes, edges]);
  const upstreamSpineMap = useMemo(() => computeInputSpineAssets(nodes, edges), [nodes, edges]);

  const decoratedNodes = useMemo(() => {
    const groupAssetUrls = new Set([
      ...protectedImageUrls,
      ...nodes.flatMap((node) => (
        Array.isArray(node.data?.groupAssetInputUrls) ? node.data.groupAssetInputUrls : []
      )),
    ]);
    const {
      makeOnUpdate, onGenerate, onGenerateMedia, onExportImages,
      onProcessImage, onProcessLocal, onCutout, onCutoutCreate, onCancelProcess,
      onPromptReverse, onEditImages, onAutoSize, onAutoSizeToContent, onBBoxCutout, onResetParams,
      onAddToAssets,
      onAddOutputImages, onRemoveOutputImage, onClearOutputImages, onReorderOutputImages,
      onSwitchVersion,
      onDeleteUpstreamImage,
      onExportVideos,
      onApplyToGroup,
    } = callbacks || {};
    return nodes.map((nd) => {
      const up = upstreamMap.get(nd.id);
      const upTexts = upstreamTextsMap.get(nd.id);
      const upVids = upstreamVideosMap.get(nd.id);
      const upSpine = upstreamSpineMap.get(nd.id);
      const data = { ...nd.data };
      if (up) {
        data.images = up.images;
        data.imageResources = up.resources;
        data.fileUploadInputs = up.fileUploads;
        data.protectedUpstreamImageUrls = up.images.filter((url) => groupAssetUrls.has(url));
        if (up.isDisplay) {
          data.resources = up.resources;
          data.source = 'upstream';
          data.tags = dedupeTags([...(nd.data?.tags || []), IMAGE_TAGS.upstream]);
        }
      }
      if (upTexts) data.textInputValues = upTexts;
      // 视频派生注入（对称图片逻辑）：
      // - videoDisplay：有连入边时用上游视频覆盖 data.videos（纯展示节点）
      // - videoEditor：编辑器场景，上游视频与用户上传去重合并（不覆盖用户数据）
      if (upVids) {
        if (nd.type === NODE_TYPES.videoEditor) {
          const own = Array.isArray(nd.data?.videos) ? nd.data.videos : [];
          data.videos = Array.from(new Set([...own, ...upVids.videos]));
          data.source = own.length ? (nd.data?.source || 'upload') : 'upstream';
        } else {
          data.videos = upVids.videos;
          if (upVids.isDisplay) {
            data.source = 'upstream';
          }
        }
      }
      // Spine 三件套派生注入：
      // - 节点自身已上传（data.spineAssets 完整）→ 保留自身，不覆盖
      // - 自身无资源但有上游 → 注入上游 spineAssets + source='upstream'
      if (upSpine) {
        const ownAssets = nd.data?.spineAssets;
        const ownComplete = ownAssets?.skel && ownAssets?.atlas && ownAssets?.png;
        if (ownComplete) {
          data.spineAssets = ownAssets;
        } else if (upSpine.spineAssets) {
          data.spineAssets = upSpine.spineAssets;
          data.source = 'upstream';
        }
      }
      const preview = outputPreviewState?.[nd.id];
      // spineDisplay 的产出是 spineAssets（三件套），非 images，需单独判断
      const hasSpineOutput = nd.type === NODE_TYPES.spineDisplay
        && !!(data?.spineAssets?.skel && data?.spineAssets?.atlas && data?.spineAssets?.png);
      const previewEnabled = data?.outputPreviewMode === true
        && (data?.output?.images?.length > 0 || hasSpineOutput || data?.status === 'running');
      const previewHeight = previewEnabled ? preview?.height : null;
      return {
        ...nd,
        ...(previewHeight ? {
          height: previewHeight,
          style: { ...nd.style, height: previewHeight },
        } : {}),
        // 图片/视频展示节点：限定只能从 .image-drag-handle 拖动（媒体区域可点选/播放不触发拖拽）
        dragHandle: (nd.type === NODE_TYPES.imageDisplay || nd.type === NODE_TYPES.videoDisplay)
          ? '.image-drag-handle' : nd.dragHandle,
        data: {
          ...data,
          nodeJson: JSON.stringify(nd, null, 2),
          selectionCount,
          floatingHandlePosition: settings.attributionPosition === 'left-right' ? 'left-right' : 'top-bottom',
          onOutputPreviewHeight: (height) => onOutputPreviewHeight?.(nd.id, height),
          onOutputPreviewModeChange: (enabled) => onOutputPreviewModeChange?.(nd.id, enabled),
          onUpdate: makeOnUpdate?.(nd.id),
          onGenerate,
          onGenerateMedia,
          onExportImages: (imgs) => onExportImages?.(nd, imgs),
          onExportVideos: (vids) => onExportVideos?.(nd, vids),
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
          // 文生图/编辑图片模型列表（用户在设置页自定义；空则节点回退到内置 MODEL_OPTIONS）
          modelOptions: nd.type === NODE_TYPES.textToImage
            ? modelValuesToOptions(settings.textToImageModels)
            : nd.type === NODE_TYPES.editImage
              ? modelValuesToOptions(settings.editImageModels)
              : undefined,
          // 提示词优化 AI 配置（从 settings 注入，仅 textToImage/editImage 节点用；systemPrompt 归 agent preset）
          promptOptimizeAgent: (nd.type === NODE_TYPES.textToImage || nd.type === NODE_TYPES.editImage) ? {
            id: settings.promptOptimizeAgentConfigId || '',
            userPrompt: settings.promptOptimizeUserPrompt || '',
          } : undefined,
          // BBox 查看器元素拆分抠图回调：仅 bboxViewer 用 onBBoxCutout，其他节点保留上方已注入的 onCutout（cutout 节点需要）
          ...(nd.type === NODE_TYPES.bboxViewer ? { onCutout: onBBoxCutout } : {}),
          // 重置参数回调：仅对有 params 的节点注入（imageDisplay/note/uiSplitter 等无 params 不注入）
          onResetParams: (data?.params != null && typeof data.params === 'object')
            ? () => onResetParams?.(nd.id, nd.type)
            : undefined,
          // 添加到素材库：节点产出图右上角按钮用（节点 ImageResult 通过 data.onAddToAssets 取）
          onAddToAssets,
          // 产出区添加/删除单张/清空（绑定 nodeId，写 data.output.images；节点 ImageResult 透传）
          onAddImages: onAddOutputImages ? (urls) => onAddOutputImages(nd.id, urls) : undefined,
          onRemoveImage: onRemoveOutputImage ? (index) => onRemoveOutputImage(nd.id, index) : undefined,
          onClearImages: onClearOutputImages ? () => onClearOutputImages(nd.id) : undefined,
          onReorderImages: onReorderOutputImages ? (next) => onReorderOutputImages(nd.id, next) : undefined,
          // 版本切换（还原 params/output/status 到历史版本；节点 ImageResult 渲染版本标记）
          onSwitchVersion: onSwitchVersion ? (index) => onSwitchVersion(nd.id, index) : undefined,
          // 删除一张上游输入图（断开产出该图的连入边）
          onDeleteUpstreamImage: onDeleteUpstreamImage ? (url) => onDeleteUpstreamImage(nd.id, url) : undefined,
          onApplyToGroup: propertyApplyNodeIds?.has(nd.id) && onApplyToGroup
            ? () => onApplyToGroup(nd.id)
            : undefined,
        },
      };
    });
  }, [
    nodes, upstreamMap, upstreamTextsMap, upstreamVideosMap, propertyApplyNodeIds,
    protectedImageUrls, selectionCount, outputPreviewState,
    onOutputPreviewHeight, onOutputPreviewModeChange, settings, callbacks,
  ]);

  return { decoratedNodes };
}
