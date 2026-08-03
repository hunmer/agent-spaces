// 节点剪贴板：复制选中节点子图（含内部连线）到内存，粘贴时生成新 id + 偏移。
// 用模块级 ref 实现「单页应用内全局剪贴板」，切换工作区后仍可粘贴（跨工作区复制）。
// 刷新页面失效（非持久化，可接受 —— 跨工作区复制是临时操作）。

// 注入到 data 的函数回调 key（序列化时剥离，与 export.js 一致）
const INJECTED_DATA_KEYS = [
  'onUpdate', 'onGenerate', 'onExportImages', 'onProcessImage',
  'onEditImages', 'onAutoSize',
];

let clipboard = null; // { nodes: CleanNode[], edges: CleanEdge[] }
const CLIPBOARD_KIND = 'agent-spaces/game-asset-canvas-nodes';
const TRANSIENT_DATA_KEYS = new Set([
  'output', 'images', 'videos', 'textInputValues',
  'status', 'loading', 'error', 'progress', 'executionId', 'source',
  'groupAssetInputUrls', 'uploadHidden',
]);

/**
 * 序列化节点子图为干净数据（剥离函数回调 + 选中标记）。
 * @param {Array} selectedNodes 选中的节点（含完整 data）
 * @param {Array} allEdges 全部边（过滤出选中节点之间的内部连线）
 */
export function copyNodes(selectedNodes, allEdges) {
  if (!selectedNodes?.length) return;
  const idSet = new Set(selectedNodes.map((n) => n.id));
  const cleanNodes = selectedNodes.map((n) => {
    const data = { ...(n.data || {}) };
    for (const k of INJECTED_DATA_KEYS) delete data[k];
    return {
      id: n.id,
      type: n.type,
      position: { ...n.position },
      width: n.width,
      height: n.height,
      style: n.style ? { ...n.style } : undefined,
      data,
    };
  });
  // 仅保留两端都在选中集合内的边（外部连线不复制）
  const cleanEdges = (allEdges || [])
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      data: e.data ? { ...e.data } : undefined,
    }));
  clipboard = { nodes: cleanNodes, edges: cleanEdges };
  return cleanNodes.length;
}

/** 剪贴板是否非空 */
export function hasClipboard() {
  return !!(clipboard?.nodes?.length);
}

export function canApplyClipboardProperties(sourceNode, targetNodes) {
  return !!sourceNode && !!targetNodes?.length
    && targetNodes.every((node) => node.type === sourceNode.type);
}

/** 单节点属性粘贴可选项：params 展开到字段，其余 data 保持顶层字段。 */
export function getClipboardProperties(node, paramSchema = []) {
  const data = node?.data || {};
  const labels = new Map(paramSchema.map((item) => [item.key, item.label]));
  const properties = Object.keys(data.params || {}).map((key) => ({
    path: `params.${key}`,
    label: labels.get(key) || key,
  }));
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'params' && !TRANSIENT_DATA_KEYS.has(key) && typeof value !== 'function') {
      properties.push({ path: key, label: key });
    }
  }
  return properties;
}

/** 把选中的剪贴板 data 字段应用到目标节点 data。 */
export function applyClipboardProperties(targetData, sourceData, propertyPaths) {
  const next = { ...(targetData || {}) };
  for (const path of propertyPaths || []) {
    if (path.startsWith('params.')) {
      const key = path.slice(7);
      if (Object.prototype.hasOwnProperty.call(sourceData?.params || {}, key)) {
        next.params = { ...(next.params || {}), [key]: sourceData.params[key] };
      }
    } else if (Object.prototype.hasOwnProperty.call(sourceData || {}, path)) {
      next[path] = sourceData[path];
    }
  }
  return next;
}

function mergeManualUploads(sourceValues, targetGroupAssets, sourceGroupAssets) {
  const protectedTarget = (Array.isArray(targetGroupAssets) ? targetGroupAssets : [])
    .filter((url) => typeof url === 'string' && url);
  const protectedSource = new Set(Array.isArray(sourceGroupAssets) ? sourceGroupAssets : []);
  const sourceManual = (Array.isArray(sourceValues) ? sourceValues : [])
    .filter((url) => typeof url === 'string' && url && !protectedSource.has(url));
  return Array.from(new Set([...protectedTarget, ...sourceManual]));
}

/** 分组内应用属性：只替换人工上传图，保留目标节点的分组素材输入。 */
export function applyGroupClipboardProperties(targetData, sourceData, propertyPaths) {
  const next = applyClipboardProperties(targetData, sourceData, propertyPaths);
  const paths = new Set(propertyPaths || []);
  const targetGroupAssets = targetData?.groupAssetInputUrls;
  const sourceGroupAssets = sourceData?.groupAssetInputUrls;

  if (paths.has('uploadedImages')) {
    next.uploadedImages = mergeManualUploads(
      sourceData?.uploadedImages, targetGroupAssets, sourceGroupAssets,
    );
  }
  for (const slot of ['first', 'second']) {
    if (!paths.has(slot) && !paths.has(`${slot}.uploadedImages`)) continue;
    next[slot] = {
      ...(next[slot] || {}),
      uploadedImages: mergeManualUploads(
        sourceData?.[slot]?.uploadedImages,
        targetGroupAssets,
        sourceGroupAssets,
      ),
    };
  }
  return next;
}

/** 写入系统剪贴板的文本 payload；与内存剪贴板保持同一份干净节点数据。 */
export function serializeClipboard() {
  if (!hasClipboard()) return '';
  return JSON.stringify({ kind: CLIPBOARD_KIND, version: 1, ...clipboard });
}

/**
 * 粘贴：生成新 id（保留选中集内部连线映射），整体偏移避免与原节点重叠。
 * @param {object} opts { genId:(prefix)=>string, offset?:{x,y} }
 * @returns {{ nodes: Node[], edges: Edge[] } | null} 待加入画布的新节点/边（调用方负责 setNodes/setEdges）
 */
export function pasteNodes({ genId, offset }) {
  if (!hasClipboard()) return null;
  const off = offset || { x: 40, y: 40 };
  const idMap = new Map(); // oldId -> newId
  const newNodes = clipboard.nodes.map((n) => {
    const newId = genId(n.type);
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      position: { x: n.position.x + off.x, y: n.position.y + off.y },
      selected: false,
      data: { ...n.data },
    };
  });
  const newEdges = clipboard.edges
    .map((e) => {
      const source = idMap.get(e.source);
      const target = idMap.get(e.target);
      if (!source || !target) return null;
      return {
        ...e,
        id: genId('edge'),
        source,
        target,
        markerEnd: { type: 'arrowclosed' }, // MarkerType.ArrowClosed 字面量，避免 import
        animated: true,
      };
    })
    .filter(Boolean);
  return { nodes: newNodes, edges: newEdges };
}
