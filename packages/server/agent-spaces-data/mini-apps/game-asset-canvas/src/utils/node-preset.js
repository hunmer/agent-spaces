// 节点预设的序列化 / 实例化纯函数（无副作用，不读写状态）。
//
// 预设是「选中节点子图 + 内部连线 + 相关分组」的可复用模板：
//   - serializePreset：剥离函数回调和瞬时数据（output/images/status/loading 等），
//     坐标归一化（左上角对齐到原点），让预设可整体平移到任意落点。
//   - instantiatePreset：按新 id 映射重建节点/边/分组，调用方负责 setNodes/setEdges/setGroups。
//
// 思路参考 clipboard.js 的 copyNodes/pasteNodes，但预设需持久化，故剥离更彻底（去 output/images），
// 且坐标归一化后整体偏移到目标位置。

// 注入到 data 的函数回调 key（序列化时剥离，与 clipboard.js 保持一致）
const INJECTED_DATA_KEYS = [
  'onUpdate', 'onGenerate', 'onExportImages', 'onProcessImage',
  'onEditImages', 'onAutoSize', 'onProcessLocal', 'onCutout', 'onCutoutCreate',
  'onDepth', 'onCancelProcess', 'onPromptReverse', 'onAutoSizeToContent',
  'onBBoxCutout', 'onResetParams', 'onAddToAssets',
  'onAddOutputImages', 'onRemoveOutputImage', 'onClearOutputImages', 'onReorderOutputImages',
  'onSwitchVersion', 'onDeleteUpstreamImage', 'onExportVideos', 'onApplyToGroup',
];

// 瞬时数据 key：执行态/产出/运行时标记，不应进入预设模板
const TRANSIENT_DATA_KEYS = new Set([
  'output', 'images', 'videos', 'textInputValues',
  'status', 'loading', 'error', 'progress', 'executionId', 'source',
  'versions', 'activeVersion',
  'groupAssetInputUrls', 'uploadHidden',
  'compactView', 'queuePosition', 'queueStatus',
  'autoSize',
]);

/**
 * 拷贝节点 data，剥离函数回调和瞬时数据，返回纯净 data。
 */
function cleanNodeData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (INJECTED_DATA_KEYS.includes(key)) continue;
    if (TRANSIENT_DATA_KEYS.has(key)) continue;
    if (typeof value === 'function') continue;
    out[key] = value;
  }
  return out;
}

/**
 * 把选中节点子图序列化为预设模板（坐标归一化 + 数据剥离）。
 *
 * @param {Array} selectedNodes 选中的节点（含完整 data）
 * @param {Array} allEdges      全部边（仅保留两端都在选中集合内的内部连线）
 * @param {Array} [groups]      全部分组（仅保留与选中节点相关的分组）
 * @param {string} name         预设名
 * @param {string} id           预设 id
 * @returns {{id,name,createdAt,nodes,edges,groups}} 预设对象
 */
export function serializePreset(selectedNodes, allEdges, groups, name, id) {
  if (!selectedNodes?.length) return null;
  const idSet = new Set(selectedNodes.map((n) => n.id));

  // 坐标归一化：以选中节点左上角为基准点
  let minX = Infinity;
  let minY = Infinity;
  selectedNodes.forEach((n) => {
    const x = n.position?.x ?? 0;
    const y = n.position?.y ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  });
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;

  const nodes = selectedNodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: (n.position?.x ?? 0) - minX, y: (n.position?.y ?? 0) - minY },
    width: n.width,
    height: n.height,
    style: n.style ? { ...n.style } : undefined,
    data: cleanNodeData(n.data),
  }));

  const edges = (allEdges || [])
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      data: e.data ? { ...e.data } : undefined,
    }));

  // 仅保留与选中节点相关的分组（任一子节点在选中集合内）
  const presetGroups = (groups || [])
    .filter((g) => (g.childNodeIds || []).some((id) => idSet.has(id)))
    .map((g) => ({
      name: g.name,
      childNodeIds: (g.childNodeIds || []).filter((id) => idSet.has(id)),
      childGroupIds: [],
      locked: false,
      disabled: false,
    }));

  return {
    id: id || `preset-${Date.now().toString(36)}`,
    name: name || '未命名预设',
    createdAt: Date.now(),
    nodes,
    edges,
    groups: presetGroups,
  };
}

/**
 * 把预设模板实例化为可加入画布的节点/边/分组（生成新 id，整体平移到 offset）。
 *
 * @param {object} preset  serializePreset 产出的预设对象
 * @param {object} opts
 *   - genId: (prefix)=>string  新 id 生成器（与建节点同源）
 *   - offset: {x,y}           整体平移量（落点坐标）
 * @returns {{nodes: Array, edges: Array, groups: Array}} 调用方负责 setNodes/setEdges/setGroups
 */
export function instantiatePreset(preset, { genId, offset = { x: 0, y: 0 } }) {
  if (!preset?.nodes?.length) return { nodes: [], edges: [], groups: [] };

  // 旧节点 id → 新节点 id
  const idMap = new Map();
  const nodes = preset.nodes.map((n) => {
    const newId = genId(n.type);
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      selected: false,
      data: { ...n.data },
    };
  });

  const edges = (preset.edges || [])
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

  // 分组重建：用 idMap 把预设内旧 id 映射到新 id
  const groups = (preset.groups || []).map((g) => ({
    id: genId('group'),
    name: g.name,
    childNodeIds: (g.childNodeIds || []).map((id) => idMap.get(id)).filter(Boolean),
    childGroupIds: [],
    locked: false,
    disabled: false,
    savedNodeStates: {},
  }));

  return { nodes, edges, groups };
}

/**
 * 计算预设节点子图的整体包围盒（用于居中放置）。
 * @param {object} preset
 * @returns {{width:number, height:number}}
 */
export function presetBoundingBox(preset) {
  if (!preset?.nodes?.length) return { width: 0, height: 0 };
  let maxX = -Infinity;
  let maxY = -Infinity;
  preset.nodes.forEach((n) => {
    const w = Number(n.width || n.style?.width) || 200;
    const h = Number(n.height || n.style?.height) || 100;
    maxX = Math.max(maxX, (n.position?.x ?? 0) + w);
    maxY = Math.max(maxY, (n.position?.y ?? 0) + h);
  });
  return { width: Math.max(0, maxX), height: Math.max(0, maxY) };
}
