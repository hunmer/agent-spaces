import { useCallback } from 'react';
import { NODE_TYPES, NODE_META, IMAGE_TAGS } from '../utils/constants';
import { DEFAULT_SIZE, dedupeTags, initialData } from '../utils/canvas-constants';
import { genId } from '../utils/canvas-id';

/**
 * 图片节点批量产出相关操作。
 * 从 Canvas.jsx 抽出（原 B7）。被 useExecutionQueue.onComplete（队列完成建图）
 * 和生成记录「用作输入」复用，故单独成 hook。
 *
 * @param {object} deps
 * @param {Function} deps.setNodes
 * @param {Function} deps.setGroups
 * @returns {{ addImageNodesFromUrls, handleExportImages }}
 */
export default function useImageOutputs({ setNodes, setGroups }) {
  // 队列任务完成后：每张图生成一个独立的图片展示节点，错落排列
  // opts.tags: 来源标签数组（存入节点 data.tags）
  // opts.source: 来源标记（默认 'queue'）
  const addImageNodesFromUrls = useCallback((urls, opts = {}) => {
    if (!urls?.length) return;
    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const meta = NODE_META[NODE_TYPES.imageDisplay];
    const source = opts.source || 'queue';
    const tags = dedupeTags(opts.tags);
    setNodes((prev) => {
      const base = prev.length;
      const additions = urls.map((url, i) => ({
        id: genId(NODE_TYPES.imageDisplay),
        type: NODE_TYPES.imageDisplay,
        position: { x: 420 + (i % 3) * (size.w + 20), y: 120 + Math.floor(i / 3) * (size.h + 20) + base * 10 },
        width: size.w, height: size.h,
        style: { width: size.w, height: size.h },
        data: { ...initialData(NODE_TYPES.imageDisplay), images: [url], source, tags, label: meta.label },
      }));
      return [...prev, ...additions];
    });
  }, [setNodes]);

  // —— 导出图片：单图直接加节点；多图分组（复用 workflow-editor 的 WorkflowGroup 数据结构 + WorkflowGroupOverlay 渲染）——
  // 多图时创建若干 imageDisplay 子节点 + 一条 group 数据（childNodeIds 关联子节点），
  // 分组名 = 来源节点名 + 时间。group 不作为 ReactFlow 节点，而是由 WorkflowGroupOverlay（在
  // ViewportPortal 内）按子节点包围盒自动贴合渲染，与宿主 workflow 编辑器完全同源。
  const handleExportImages = useCallback((sourceNode, imgs) => {
    if (!imgs?.length) return;
    // 单图：保持原行为，直接加一个独立图片节点（不分组）
    if (imgs.length === 1) {
      addImageNodesFromUrls(imgs, { tags: [IMAGE_TAGS.export] });
      return;
    }
    // 多图：分组。子节点网格排列在画布空白区
    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const meta = NODE_META[NODE_TYPES.imageDisplay];
    const cols = Math.min(3, imgs.length);
    const tags = dedupeTags([IMAGE_TAGS.export]);
    // 分组名：来源节点名 + 时间（HH:mm）
    const srcLabel = sourceNode ? (NODE_META[sourceNode.type]?.label || '导出') : '导出';
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const groupName = `${srcLabel} 导出 ${hh}:${mm}`;

    // 子节点先入画布，拿到它们的 id 再建 group
    const childIds = imgs.map(() => genId(NODE_TYPES.imageDisplay));
    setNodes((prev) => {
      const base = prev.length;
      const startX = 420 + base * 6;
      const startY = 120;
      const additions = imgs.map((url, i) => {
        const id = childIds[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          id,
          type: NODE_TYPES.imageDisplay,
          position: { x: startX + col * (size.w + 20), y: startY + row * (size.h + 20) },
          width: size.w, height: size.h,
          style: { width: size.w, height: size.h },
          data: { ...initialData(NODE_TYPES.imageDisplay), images: [url], source: 'export', tags, label: meta.label },
        };
      });
      return [...prev, ...additions];
    });
    // 新增一条 group 数据（WorkflowGroup 结构）
    setGroups((prev) => [...prev, {
      id: genId('group'),
      name: groupName,
      childNodeIds: childIds,
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }]);
  }, [addImageNodesFromUrls, setNodes, setGroups]);

  return { addImageNodesFromUrls, handleExportImages };
}
