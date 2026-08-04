/**
 * Agent 可调用的项目 API（画布操作）。
 *
 * 节点/边状态在浏览器内存（ReactFlow），服务端 handler 无法直接改；
 * 统一通过 ctx.requestClient RPC 到浏览器执行（mini-app-client-rpc.ts），
 * 浏览器端 Canvas.jsx 订阅 miniApp.clientRequest 后调 setNodes/setEdges。
 *
 * 对应前端监听见 src/components/Canvas.jsx 的 clientRequest useEffect。
 */

// 合法节点类型（与 utils/constants.js NODE_TYPES 同步；handler 不能 import）
const VALID_NODE_TYPES = [
  'text',          // Markdown 文字
  'storyboard',    // 分镜创作
  'textToImage',   // 文字生成图片
  'editImage',     // 编辑图片
  'imageDisplay',  // 图片展示
  'imageProcess',  // 图像处理（旧单节点，兼容）
  // 图像处理拆分节点（一个处理器 = 一个节点类型）
  'ipGifSplit',       // GIF 拆帧
  'ipGifMerge',       // GIF 合成
  'ipSpriteSplit',    // Sheet 拆分
  'ipSpriteMerge',    // 网格拼接
  'ipPixelate',       // 像素化
  'ipResizeNearest',  // 最近邻缩放
  'ipInnerStroke',    // 内描边
  'ipChromaKey',      // 色度键抠图
  'ipWhiteKey',       // 白底抠图
  'ipComposeOverlay', // 图层叠加
  'ipEnhance',        // 图片放大
  'ipCompress',       // 图片压缩
  'imageEditor',   // 图片编辑
  'pixelEditor',   // 像素编辑器
  'uiSplitter',    // 雪碧图拆分
  'bboxViewer',    // UI 拆分（bbox 可视化）
  'promptReverse', // 反推提示词
  'textToVoice',   // 生成配音
  'videoGenerator',// 生成视频
  'imageCompare',  // 图片对比
  'cutout',        // 抠图（统一节点：白底/色度键/工作流/rembg）
  'depthExtract',  // 提取深度图（调 depth-anything 插件）
  'directorDesk',  // 3D导演台
  'photopea',      // 在线PS（Photopea）
  'workflowRunner',// 执行工作流（通用）
  'spineEditor',   // 骨骼编辑器
  'spineDisplay',  // Spine 展示
  'videoDisplay',  // 视频展示
  'audioDisplay',  // 音频展示
  'videoEditor',   // 视频编辑器
  'maskPaint',     // 蒙版绘制（fabric 画笔/套索/矩形）
  'note',          // 便签
];

const NODE_LABELS = {
  text: '文字',
  storyboard: '分镜创作',
  textToImage: '文字生成图片',
  editImage: '编辑图片',
  imageDisplay: '图片展示',
  imageProcess: '图像处理',
  ipGifSplit: 'GIF 拆帧',
  ipGifMerge: 'GIF 合成',
  ipSpriteSplit: 'Sheet 拆分',
  ipSpriteMerge: '网格拼接',
  ipPixelate: '像素化',
  ipResizeNearest: '最近邻缩放',
  ipInnerStroke: '内描边',
  ipChromaKey: '色度键抠图',
  ipWhiteKey: '白底抠图',
  ipComposeOverlay: '图层叠加',
  ipEnhance: '图片放大',
  ipCompress: '图片压缩',
  imageEditor: '图片编辑',
  pixelEditor: '像素编辑器',
  uiSplitter: '雪碧图拆分',
  bboxViewer: 'UI 拆分',
  promptReverse: '反推提示词',
  textToVoice: '生成配音',
  videoGenerator: '生成视频',
  imageCompare: '图片对比',
  cutout: '抠图',
  depthExtract: '提取深度图',
  directorDesk: '3D导演台',
  photopea: '在线PS',
  workflowRunner: '执行工作流',
  spineEditor: '骨骼编辑器',
  spineDisplay: 'Spine展示',
  videoDisplay: '视频展示',
  audioDisplay: '音频展示',
  videoEditor: '视频编辑器',
  note: '便签',
  maskPaint: '蒙版绘制',
};

function asString(v, def = '') {
  return typeof v === 'string' ? v.trim() : def;
}

function parseNodeData(value, fieldName = 'data') {
  if (value === undefined) return { ok: true, value: undefined };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: `${fieldName} 必须是对象` };
  }
  if (Object.keys(value).length === 1 && typeof value.$text === 'string') {
    try {
      const parsed = JSON.parse(value.$text.trim());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: `${fieldName}.$text 必须是 JSON 对象` };
      }
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, message: `${fieldName}.$text 不是合法 JSON` };
    }
  }
  return { ok: true, value };
}

function parseGroupLayout(value, fieldName = 'groupLayout') {
  if (value === undefined) return { ok: true, value: undefined };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: `${fieldName} 必须是对象 {direction?, grid?}` };
  }

  const direction = asString(value.direction) || 'LR';
  if (direction !== 'LR' && direction !== 'TB') {
    return { ok: false, message: `${fieldName}.direction 仅支持 LR（横向）或 TB（纵向）` };
  }

  let grid;
  if (value.grid !== undefined) {
    if (!value.grid || typeof value.grid !== 'object' || Array.isArray(value.grid)) {
      return { ok: false, message: `${fieldName}.grid 必须是对象 {rows, columns, horizontalGap, verticalGap}` };
    }
    const rows = Number(value.grid.rows);
    const columns = Number(value.grid.columns);
    const horizontalGap = Number(value.grid.horizontalGap);
    const verticalGap = Number(value.grid.verticalGap);
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
      return { ok: false, message: `${fieldName}.grid.rows 和 columns 必须是大于等于 1 的整数` };
    }
    if (!Number.isFinite(horizontalGap) || horizontalGap < 0 || horizontalGap > 300
      || !Number.isFinite(verticalGap) || verticalGap < 0 || verticalGap > 300) {
      return { ok: false, message: `${fieldName}.grid.horizontalGap 和 verticalGap 必须是 0 到 300 的数字` };
    }
    grid = { rows, columns, horizontalGap, verticalGap };
  }

  return { ok: true, value: { direction, ...(grid ? { grid } : {}) } };
}

// —— 素材库（asset library）——
// 数据隔离在 configs/workspaces/<workspaceId>/asset-library.json
// 结构：{ categories: [{ id, name, createdAt, assets: [{ id, url, name, size, uploadedAt }] }] }
// 与 services/canvas.js 同源；agent ctx.writeConfig 不广播，故写后手动 broadcast miniApp.configChanged。
const ASSET_LIBRARY_FILE = 'asset-library.json';
const WORKSPACES_CONFIG = 'workspaces.json';
const ASSET_MAX_PER_CATEGORY = 500;

// 解析当前 workspaceId：优先 input.workspaceId → workspaces.json 的 activeId → 'default'
function resolveWorkspaceId(ctx, input) {
  const explicit = asString(input?.workspaceId);
  if (explicit) return explicit;
  const ws = ctx.readConfig(WORKSPACES_CONFIG);
  const active = ws && typeof ws === 'object' ? ws.activeId : '';
  return asString(active) || 'default';
}

function assetLibPath(workspaceId) {
  return `workspaces/${workspaceId || 'default'}/${ASSET_LIBRARY_FILE}`;
}

function readAssetLibrary(ctx, workspaceId) {
  const raw = ctx.readConfig(assetLibPath(workspaceId));
  if (raw && Array.isArray(raw.categories)) return raw;
  return { categories: [] };
}

// 写回并广播，让前端 useAssetLibrary（订阅 onAnyConfigChanged）自动刷新
function writeAssetLibrary(ctx, workspaceId, lib) {
  const path = assetLibPath(workspaceId);
  ctx.writeConfig(path, lib);
  ctx.broadcast('miniApp.configChanged', { path, value: lib });
}

// 按分类 id 精确定位；找不到时按 name 模糊匹配第一个
// 查询参数支持 name 与 categoryName 两种写法（categoryName 为推荐写法，避免与图片 name 混淆）
function findCategory(lib, query) {
  const cats = lib.categories || [];
  if (query?.id) {
    const hit = cats.find((c) => c.id === query.id);
    if (hit) return hit;
  }
  const q = asString(query?.categoryName || query?.name).toLowerCase();
  if (q) {
    const hit = cats.find((c) => (c.name || '').toLowerCase() === q)
      || cats.find((c) => (c.name || '').toLowerCase().includes(q));
    if (hit) return hit;
  }
  return null;
}

function genAssetId() {
  return `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function genCategoryId(lib) {
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// 把 RPC 调用包成 Promise；超时由 requestClient 内部（默认 5s）控制。
function rpc(ctx, type, payload) {
  return ctx.requestClient(type, payload || {}, 8000);
}

export default {
  /**
   * 新增节点。
   * @param {object} input
   * @param {string} input.type     节点类型（必填，见 VALID_NODE_TYPES）
   * @param {string} [input.title]  节点标题（可选）
   * @param {string} [input.label]  节点标题（兼容旧参数，推荐使用 title）
   * @param {object} [input.position] 坐标 {x,y}；不传则由画布自动错落
   * @param {object} [input.data]   节点初始 data 覆盖（如 {text:'备注'} / {params:{prompt:'...'}}）
   * @param {boolean} [input.focus] 创建后是否聚焦到该节点（默认 true）
   * @param {object} [input.groupLayout] 携带 groupName 时自动编排整个分组
   */
  add_node: async (input, ctx) => {
    const type = asString(input?.type);
    if (!VALID_NODE_TYPES.includes(type)) {
      return {
        ok: false,
        message: `未知节点类型：${type || '(空)'}。可用：${VALID_NODE_TYPES.join(', ')}`,
      };
    }
    const payload = { type };
    const title = asString(input?.title) || asString(input?.label);
    if (input?.position && typeof input.position === 'object') {
      const x = Number(input.position.x);
      const y = Number(input.position.y);
      if (Number.isFinite(x) && Number.isFinite(y)) payload.position = { x, y };
    }
    const parsedData = parseNodeData(input?.data);
    if (!parsedData.ok) return parsedData;
    if (parsedData.value) payload.data = { ...parsedData.value };
    if (title) payload.data = { ...(payload.data || {}), title };
    payload.focus = input?.focus !== false; // 默认聚焦
    // 可选 groupName：建完节点后归入同名分组（不存在则创建）
    const groupName = asString(input?.groupName);
    const parsedGroupLayout = parseGroupLayout(input?.groupLayout);
    if (!parsedGroupLayout.ok) return parsedGroupLayout;
    if (parsedGroupLayout.value && !groupName) {
      return { ok: false, message: 'groupLayout 仅可与 groupName 一起使用' };
    }
    if (groupName) payload.groupName = groupName;
    if (parsedGroupLayout.value) payload.groupLayout = parsedGroupLayout.value;
    const result = await rpc(ctx, 'canvas.addNode', payload);
    if (result?.ok === false) return result;
    return {
      ok: true,
      nodeId: result?.nodeId,
      type,
      typeLabel: NODE_LABELS[type] || type,
      title: title || NODE_LABELS[type] || type,
      position: result?.position,
      groupName: groupName || undefined,
      groupLayout: parsedGroupLayout.value,
      message: `已新增「${NODE_LABELS[type] || type}」节点${result?.nodeId ? `（id=${result.nodeId}）` : ''}${groupName ? `并归入分组「${groupName}」` : ''}`,
    };
  },

  /**
   * 执行（生成）一个画布节点。
   *
   * 触发节点内置的「生成」逻辑，等价于用户在节点上点「生成图片 / 编辑图片 / 生成配音 / 生成视频」按钮。
   * 节点必须已存在，且参数（params）满足该节点的最低执行条件（如文生图必须有 prompt）。
   *
   * 仅支持生成类节点：textToImage / editImage / textToVoice / videoGenerator。
   * 其他节点类型（imageDisplay/note/图像处理等）调用返回 ok:false 提示不支持。
   *
   * @param {object} input
   * @param {string} input.nodeId 要执行的节点 id（必填）
   * @param {boolean} [input.waitForResult=false] 是否等到生成完成再返回。
   *   - false（默认）：仅触发即返回，status=running，产出异步写入节点。
   *   - true：阻塞等待节点 status 变为 done/error，返回时带产出 URL 列表；最长等待 waitForResultTimeoutMs（默认 180000ms=3 分钟，覆盖视频生成）。
   * @param {number} [input.waitForResultTimeoutMs=180000] waitForResult=true 时的最长等待毫秒数。
   */
  execute_node: async (input, ctx) => {
    const nodeId = asString(input?.nodeId);
    if (!nodeId) return { ok: false, message: 'nodeId 必填（先 list_nodes / get_canvas 拿节点 id）' };
    const waitForResult = input?.waitForResult === true;
    const timeoutMs = Math.max(1000, Math.min(600000, Number(input?.waitForResultTimeoutMs) || 180000));
    // 触发阶段 RPC（浏览器端 fire-and-forget 触发执行回调）超时 10s 足够
    const triggerResult = await rpc(ctx, 'canvas.executeNode', { nodeId }, 10000);
    if (triggerResult?.ok === false) return triggerResult;
    if (!waitForResult) {
      return {
        ok: true,
        nodeId,
        nodeType: triggerResult?.nodeType,
        typeLabel: triggerResult?.nodeType ? (NODE_LABELS[triggerResult.nodeType] || triggerResult.nodeType) : undefined,
        message: triggerResult?.message || `已触发节点 ${nodeId} 执行`,
      };
    }
    // 等待阶段：浏览器端轮询节点 status，超时由 timeoutMs 控制（向上取整到秒防精度问题）
    const waitResult = await rpc(ctx, 'canvas.waitNodeResult', { nodeId, timeoutMs: Math.min(600000, timeoutMs + 5000) }, timeoutMs + 10000);
    if (waitResult?.ok === false) return waitResult;
    const nodeType = triggerResult?.nodeType;
    return {
      ok: waitResult.status === 'done',
      nodeId,
      nodeType,
      typeLabel: nodeType ? (NODE_LABELS[nodeType] || nodeType) : undefined,
      status: waitResult.status,
      outputs: waitResult.outputs || [],
      error: waitResult.error,
      message: waitResult.status === 'done'
        ? `节点 ${nodeId} 执行完成，产出 ${waitResult.outputs?.length || 0} 项`
        : waitResult.status === 'timeout'
          ? `节点 ${nodeId} 执行超过 ${timeoutMs}ms 仍在运行，请稍后在画布查看结果`
          : `节点 ${nodeId} 执行失败：${waitResult.error || '未知错误'}`,
    };
  },

  /**
   * 查询某类节点支持的参数 schema（含 required/default/options/description）。
   * 用于改枚举型参数前查合法值，避免盲填。schema 定义在各节点组件的 PARAMS_SCHEMA。
   *
   * @param {object} input
   * @param {string} input.type 节点类型（必填，见 VALID_NODE_TYPES）
   */
  get_node_params: async (input, ctx) => {
    const type = asString(input?.type);
    if (!VALID_NODE_TYPES.includes(type)) {
      return { ok: false, message: `未知节点类型：${type || '(空)'}。可用：${VALID_NODE_TYPES.join(', ')}` };
    }
    const result = await rpc(ctx, 'canvas.getNodeParams', { type }, 5000);
    if (result?.ok === false) return result;
    return {
      ok: true,
      type,
      typeLabel: NODE_LABELS[type] || type,
      params: result?.params || [],
      message: result?.message,
    };
  },

  /**
   * 批量执行多个生成类节点（一次调用触发多个，可选等待全部完成）。
   * @param {object} input
   * @param {string[]} input.nodeIds 要执行的节点 id 数组（必填，非空）
   * @param {boolean} [input.waitForResult=false] 是否等待全部完成。true 时返回每个节点的最终状态与产出。
   * @param {number} [input.waitForResultTimeoutMs=180000] waitForResult=true 时的最长等待毫秒数（所有节点共享）。
   */
  execute_nodes: async (input, ctx) => {
    const ids = Array.isArray(input?.nodeIds) ? input.nodeIds.map((s) => asString(s)).filter(Boolean) : [];
    if (!ids.length) return { ok: false, message: 'nodeIds 必须是非空字符串数组' };
    const waitForResult = input?.waitForResult === true;
    const timeoutMs = Math.max(1000, Math.min(600000, Number(input?.waitForResultTimeoutMs) || 180000));
    // 逐个触发（浏览器端 executeNode 是 fire-and-forget，串行触发不影响并发执行）
    const triggered = [];
    const failed = [];
    for (const nodeId of ids) {
      try {
        const r = await rpc(ctx, 'canvas.executeNode', { nodeId }, 10000);
        if (r?.ok === false) failed.push({ nodeId, message: r.message });
        else triggered.push({ nodeId, nodeType: r.nodeType });
      } catch (e) {
        failed.push({ nodeId, message: e?.message || String(e) });
      }
    }
    if (!waitForResult) {
      return {
        ok: triggered.length > 0,
        triggered: triggered.length,
        failed,
        message: `已触发 ${triggered.length}/${ids.length} 个节点执行${failed.length ? `（${failed.length} 个失败）` : ''}`,
      };
    }
    // 等待全部完成：逐个等待（共享同一超时窗口，从首个触发时刻起算）
    const results = [];
    for (const { nodeId, nodeType } of triggered) {
      try {
        const wr = await rpc(ctx, 'canvas.waitNodeResult', { nodeId, timeoutMs: Math.min(600000, timeoutMs + 5000) }, timeoutMs + 10000);
        results.push({
          nodeId, nodeType,
          status: wr?.status || 'unknown',
          outputs: wr?.outputs || [],
          error: wr?.error,
        });
      } catch (e) {
        results.push({ nodeId, nodeType, status: 'error', error: e?.message || String(e), outputs: [] });
      }
    }
    const doneCount = results.filter((r) => r.status === 'done').length;
    return {
      ok: doneCount > 0,
      total: ids.length,
      triggered: triggered.length,
      doneCount,
      results,
      failed,
      message: `批量执行完成：${doneCount}/${triggered.length} 成功${failed.length ? `（${failed.length} 个触发失败）` : ''}`,
    };
  },

  /**
   * 批量新增节点（一次 RPC 往返建多个，比循环调 add_node 快）。
   * @param {object} input
   * @param {Array} input.nodes  节点规格数组，每项 {type, title?, position?, data?, focus?}
   * @param {boolean} [input.focusFirst] 是否聚焦到首个新增节点（默认 true）
   * @param {object} [input.groupLayout] 携带 groupName 时自动编排整个分组
   */
  add_nodes: async (input, ctx) => {
    const list = Array.isArray(input?.nodes) ? input.nodes : null;
    if (!list || !list.length) {
      return { ok: false, message: 'nodes 必须是非空数组，每项 {type, ...}' };
    }
    // 校验全部 type 合法后再下发，避免部分成功
    const cleaned = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};
      const type = asString(item.type);
      if (!VALID_NODE_TYPES.includes(type)) {
        return { ok: false, message: `nodes[${i}] 类型无效：${type || '(空)'}。可用：${VALID_NODE_TYPES.join(', ')}` };
      }
      const spec = { type };
      const title = asString(item.title) || asString(item.label);
      if (item.position && typeof item.position === 'object') {
        const x = Number(item.position.x);
        const y = Number(item.position.y);
        if (Number.isFinite(x) && Number.isFinite(y)) spec.position = { x, y };
      }
      const parsedData = parseNodeData(item.data, `nodes[${i}].data`);
      if (!parsedData.ok) return parsedData;
      if (parsedData.value) spec.data = { ...parsedData.value };
      if (title) spec.data = { ...(spec.data || {}), title };
      cleaned.push(spec);
    }
    const edgeList = input?.edges === undefined ? [] : input.edges;
    if (!Array.isArray(edgeList)) {
      return { ok: false, message: 'edges 必须是数组' };
    }
    const cleanedEdges = [];
    for (let i = 0; i < edgeList.length; i++) {
      const edge = edgeList[i] || {};
      const sourceIndex = Number(edge.sourceIndex);
      const targetIndex = Number(edge.targetIndex);
      const hasSourceIndex = edge.sourceIndex !== undefined;
      const hasTargetIndex = edge.targetIndex !== undefined;
      const sourceId = asString(edge.sourceId);
      const targetId = asString(edge.targetId);
      if (hasSourceIndex && (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= cleaned.length)) {
        return { ok: false, message: `edges[${i}].sourceIndex 必须是 nodes 的有效下标` };
      }
      if (hasTargetIndex && (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= cleaned.length)) {
        return { ok: false, message: `edges[${i}].targetIndex 必须是 nodes 的有效下标` };
      }
      if (!hasSourceIndex && !sourceId) {
        return { ok: false, message: `edges[${i}] 必须提供 sourceIndex 或 sourceId` };
      }
      if (!hasTargetIndex && !targetId) {
        return { ok: false, message: `edges[${i}] 必须提供 targetIndex 或 targetId` };
      }
      if ((hasSourceIndex && hasTargetIndex && sourceIndex === targetIndex)
        || (!hasSourceIndex && !hasTargetIndex && sourceId === targetId)) {
        return { ok: false, message: `edges[${i}] 不能连接到自己` };
      }
      cleanedEdges.push({
        ...(hasSourceIndex ? { sourceIndex } : { sourceId }),
        ...(hasTargetIndex ? { targetIndex } : { targetId }),
        inputTarget: asString(edge.inputTarget),
      });
    }
    const groupName = asString(input?.groupName);
    const parsedGroupLayout = parseGroupLayout(input?.groupLayout);
    if (!parsedGroupLayout.ok) return parsedGroupLayout;
    if (parsedGroupLayout.value && !groupName) {
      return { ok: false, message: 'groupLayout 仅可与 groupName 一起使用' };
    }
    const result = await rpc(ctx, 'canvas.addNodes', {
      nodes: cleaned,
      focusFirst: input?.focusFirst !== false,
      // 可选 groupName：本次批量建的节点一起归入同名分组（不存在则创建）
      groupName: groupName || undefined,
      groupLayout: parsedGroupLayout.value,
      edges: cleanedEdges,
    });
    if (result?.ok === false) return result;
    const ids = Array.isArray(result?.nodeIds) ? result.nodeIds : [];
    return {
      ok: true,
      count: ids.length,
      nodeIds: ids,
      groupName: groupName || undefined,
      groupLayout: parsedGroupLayout.value,
      edges: result?.edges,
      message: `已新增 ${ids.length} 个节点：${ids.map((id) => id).join(', ')}${groupName ? `，并归入分组「${groupName}」` : ''}${cleanedEdges.length ? `；连线新增 ${result?.edges?.created || 0} 条` : ''}`,
    };
  },

  /**
   * 查询画布上的节点（默认全部，可按 type 过滤）。
   * @param {object} input
   * @param {string} [input.type] 按节点类型过滤
   */
  list_nodes: async (input, ctx) => {
    const type = asString(input?.type);
    if (type && !VALID_NODE_TYPES.includes(type)) {
      return { ok: false, message: `未知节点类型：${type}` };
    }
    const result = await rpc(ctx, 'canvas.getCanvas', {});
    const all = Array.isArray(result?.nodes) ? result.nodes : [];
    const filtered = type ? all.filter((n) => n.type === type) : all;
    return {
      ok: true,
      total: filtered.length,
      totalCount: all.length,
      items: filtered.map((n) => ({
        id: n.id,
        type: n.type,
        typeLabel: NODE_LABELS[n.type] || n.type,
        title: n.title || n.label || NODE_LABELS[n.type] || n.type,
        label: n.label || '',
        position: n.position,
      })),
      message: type
        ? `共 ${filtered.length} 个「${NODE_LABELS[type] || type}」节点`
        : `画布共 ${all.length} 个节点`,
    };
  },

  /**
   * 查询画布全貌（节点 + 边 + 计数）。
   */
  get_canvas: async (_input, ctx) => {
    const result = await rpc(ctx, 'canvas.getCanvas', {});
    const nodes = Array.isArray(result?.nodes) ? result.nodes : [];
    const edges = Array.isArray(result?.edges) ? result.edges : [];
    const groups = Array.isArray(result?.groups) ? result.groups : [];
    return {
      ok: true,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      groupCount: groups.length,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        typeLabel: NODE_LABELS[n.type] || n.type,
        title: n.title || n.label || NODE_LABELS[n.type] || n.type,
        label: n.label || '',
        position: n.position,
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        inputType: e.inputType,
        inputTarget: e.inputTarget,
      })),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        nodeIds: group.nodeIds,
      })),
      message: `画布当前 ${nodes.length} 个节点 / ${edges.length} 条连线 / ${groups.length} 个分组`,
    };
  },

  /**
   * 自动编排指定分组内的节点，支持横向、纵向和网格布局。
   * @param {object} input
   * @param {string} [input.groupId] 分组 id（groupId/groupName 至少传一个）
   * @param {string} [input.groupName] 分组名称
   * @param {'LR'|'TB'} [input.direction='LR'] 横向或纵向布局；grid 存在时仅用于兼容菜单参数
   * @param {{rows:number,columns:number,horizontalGap:number,verticalGap:number}} [input.grid] 网格布局参数
   */
  arrange_group: async (input, ctx) => {
    const groupId = asString(input?.groupId);
    const groupName = asString(input?.groupName);
    if (!groupId && !groupName) {
      return { ok: false, message: 'groupId 和 groupName 至少传一个（可先用 get_canvas 查询）' };
    }

    const parsedLayout = parseGroupLayout({ direction: input?.direction, grid: input?.grid }, '布局参数');
    if (!parsedLayout.ok) return parsedLayout;
    const { direction, grid } = parsedLayout.value;

    const result = await rpc(ctx, 'canvas.arrangeGroup', {
      groupId: groupId || undefined,
      groupName: groupName || undefined,
      direction,
      grid,
    });
    if (result?.ok === false) return result;
    return {
      ok: true,
      groupId: result?.groupId,
      groupName: result?.groupName,
      direction,
      grid,
      arrangedCount: result?.arrangedCount || 0,
      positions: result?.positions || [],
      message: result?.message || `已编排分组「${result?.groupName || groupName || groupId}」`,
    };
  },

  /**
   * 连接两个节点（source 的输出 → target 的输入）。
   * @param {object} input
   * @param {string} input.sourceId 源节点 id
   * @param {string} input.targetId 目标节点 id
   * @param {string} [input.inputTarget] 目标输入字段 key
   */
  connect_nodes: async (input, ctx) => {
    const sourceId = asString(input?.sourceId);
    const targetId = asString(input?.targetId);
    const inputTarget = asString(input?.inputTarget);
    if (!sourceId || !targetId) {
      return { ok: false, message: 'sourceId 和 targetId 都必填（先用 get_canvas / list_nodes 查节点 id）' };
    }
    if (sourceId === targetId) {
      return { ok: false, message: '不能连接到自己' };
    }
    const result = await rpc(ctx, 'canvas.connectNodes', { sourceId, targetId, inputTarget });
    if (result?.ok === false) return result;
    return {
      ok: true,
      edgeId: result?.edgeId,
      sourceId,
      targetId,
      message: result?.alreadyExists
        ? `${sourceId} → ${targetId} 已存在连线，未重复创建`
        : `已连接 ${sourceId} → ${targetId}`,
    };
  },

  /**
   * 批量连线（一次 RPC 往返建多条边，比循环调 connect_nodes 快）。
   * @param {object} input
   * @param {Array} input.edges 连线规格数组，每项 {sourceId, targetId}
   */
  connect_batch: async (input, ctx) => {
    const list = Array.isArray(input?.edges) ? input.edges : null;
    if (!list || !list.length) {
      return { ok: false, message: 'edges 必须是非空数组，每项 {sourceId, targetId}' };
    }
    const cleaned = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};
      const sourceId = asString(item.sourceId);
      const targetId = asString(item.targetId);
      if (!sourceId || !targetId) {
        return { ok: false, message: `edges[${i}] 的 sourceId 和 targetId 都必填` };
      }
      if (sourceId === targetId) {
        return { ok: false, message: `edges[${i}] 不能连接到自己` };
      }
      cleaned.push({ sourceId, targetId, inputTarget: asString(item.inputTarget) });
    }
    const result = await rpc(ctx, 'canvas.connectBatch', { edges: cleaned });
    return {
      ok: true,
      created: result?.created || 0,
      skipped: result?.skipped || 0,
      invalid: result?.invalid || 0,
      message: result?.summary || `批量连线完成（新增 ${result?.created || 0}，已存在 ${result?.skipped || 0}）`,
    };
  },

  /**
   * 删除节点（同时清理相关连线）。
   * @param {object} input
   * @param {string} input.nodeId 节点 id
   */
  delete_node: async (input, ctx) => {
    const nodeId = asString(input?.nodeId);
    if (!nodeId) return { ok: false, message: 'nodeId 必填' };
    const result = await rpc(ctx, 'canvas.deleteNode', { nodeId });
    if (result?.ok === false) return result;
    return { ok: true, nodeId, message: `已删除节点 ${nodeId}（含相关连线）` };
  },

  /**
   * 删除两个节点之间的连线。
   * @param {object} input
   * @param {string} input.sourceId
   * @param {string} input.targetId
   */
  delete_edge: async (input, ctx) => {
    const sourceId = asString(input?.sourceId);
    const targetId = asString(input?.targetId);
    if (!sourceId || !targetId) {
      return { ok: false, message: 'sourceId 和 targetId 都必填' };
    }
    const result = await rpc(ctx, 'canvas.deleteEdge', { sourceId, targetId });
    if (result?.ok === false) return result;
    return {
      ok: true,
      message: result?.removed
        ? `已删除连线 ${sourceId} → ${targetId}`
        : `未找到 ${sourceId} → ${targetId} 的连线`,
    };
  },

  /**
   * 更新节点 data（部分 patch）。
   * @param {object} input
   * @param {string} input.nodeId
   * @param {string} [input.title] 节点显示标题
   * @param {object} [input.data] 合并到节点 data 的字段（如 note 用 {text}，文生图用 {params:{prompt,model}}）
   */
  update_node: async (input, ctx) => {
    const nodeId = asString(input?.nodeId);
    if (!nodeId) return { ok: false, message: 'nodeId 必填' };
    const hasTitle = Object.prototype.hasOwnProperty.call(input || {}, 'title');
    if (hasTitle && typeof input.title !== 'string') {
      return { ok: false, message: 'title 必须是字符串' };
    }
    const parsedData = parseNodeData(input?.data);
    if (!parsedData.ok) return parsedData;
    const hasData = parsedData.value !== undefined;
    if (!hasData && !hasTitle) return { ok: false, message: 'title 和 data 至少传一个' };
    const patch = { ...(hasData ? parsedData.value : {}) };
    if (hasTitle) patch.title = input.title.trim();
    const result = await rpc(ctx, 'canvas.updateNodeData', { nodeId, data: patch });
    if (result?.ok === false) return result;
    return { ok: true, nodeId, title: patch.title, applied: Object.keys(patch), message: `已更新节点 ${nodeId} 的 ${Object.keys(patch).length} 个字段` };
  },

  /** 批量更新节点，并可同时新增节点连线。 */
  update_nodes: async (input, ctx) => {
    const list = Array.isArray(input?.nodes) ? input.nodes : null;
    if (!list || !list.length) {
      return { ok: false, message: 'nodes 必须是非空数组，每项 {nodeId, title?, data?}' };
    }
    const cleaned = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};
      const nodeId = asString(item.nodeId);
      if (!nodeId) return { ok: false, message: `nodes[${i}].nodeId 必填` };
      const hasTitle = Object.prototype.hasOwnProperty.call(item, 'title');
      if (hasTitle && typeof item.title !== 'string') {
        return { ok: false, message: `nodes[${i}].title 必须是字符串` };
      }
      const parsedData = parseNodeData(item.data, `nodes[${i}].data`);
      if (!parsedData.ok) return parsedData;
      const hasData = parsedData.value !== undefined;
      if (!hasData && !hasTitle) {
        return { ok: false, message: `nodes[${i}] 的 title 和 data 至少传一个` };
      }
      const data = { ...(hasData ? parsedData.value : {}) };
      if (hasTitle) data.title = item.title.trim();
      cleaned.push({ nodeId, data });
    }

    const edgeList = input?.edges === undefined ? [] : input.edges;
    if (!Array.isArray(edgeList)) return { ok: false, message: 'edges 必须是数组' };
    const edges = [];
    for (let i = 0; i < edgeList.length; i++) {
      const edge = edgeList[i] || {};
      const sourceId = asString(edge.sourceId);
      const targetId = asString(edge.targetId);
      if (!sourceId || !targetId) {
        return { ok: false, message: `edges[${i}] 的 sourceId 和 targetId 都必填` };
      }
      if (sourceId === targetId) return { ok: false, message: `edges[${i}] 不能连接到自己` };
      edges.push({ sourceId, targetId, inputTarget: asString(edge.inputTarget) });
    }

    const result = await rpc(ctx, 'canvas.updateNodes', { nodes: cleaned, edges });
    if (result?.ok === false) return result;
    return {
      ok: true,
      updated: result?.updated || 0,
      edges: result?.edges,
      message: `已更新 ${result?.updated || 0} 个节点${edges.length ? `；连线新增 ${result?.edges?.created || 0} 条` : ''}`,
    };
  },

  /**
   * 查询当前画布上选中的节点（单选返回 1 个，多选返回多个）。
   * 用户说「这个」「它」「选中的」时调用，先获取选中节点 id 再操作。
   */
  get_selection: async (_input, ctx) => {
    const result = await rpc(ctx, 'canvas.getSelection', {});
    const items = Array.isArray(result?.items) ? result.items : [];
    return {
      ok: true,
      count: items.length,
      items,
      message: items.length === 0
        ? '当前没有选中节点'
        : `当前选中 ${items.length} 个节点：${items.map((n) => `${n.typeLabel}(${n.id})`).join(', ')}`,
    };
  },

  // —— 素材库：查询 ——
  // 返回的分类/资产 id 可直接用于 update_asset / remove_asset / add_asset 等。

  /**
   * 列出素材库所有分组（分类）。
   * 用户问「素材库有哪些分组/分类」「素材库有哪几类」时调用。
   * 仅返回分组摘要（id/name/资产数），不含单个资产详情；要看具体图片用 list_assets。
   */
  list_asset_categories: async (input, ctx) => {
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    const categories = lib.categories.map((c) => ({
      id: c.id,
      name: c.name,
      assetCount: Array.isArray(c.assets) ? c.assets.length : 0,
    }));
    return {
      ok: true,
      workspaceId,
      total: categories.length,
      totalAssets: categories.reduce((n, c) => n + c.assetCount, 0),
      categories,
      message: `素材库共 ${categories.length} 个分组（${categories.reduce((n, c) => n + c.assetCount, 0)} 张图片）`,
    };
  },

  /**
   * 查看素材库（可按分组过滤）。
   * - 不传 categoryId/name → 返回全部分组及其资产（按 url+name 精简）
   * - 传 categoryId（精确）或 name（模糊）→ 只返回该分组的资产
   * 用户问「看一下角色分组的图」「素材库都有啥」「分类 xxx 里有哪些图」时调用。
   */
  list_assets: async (input, ctx) => {
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    const filterCategoryId = asString(input?.categoryId);
    const filterName = asString(input?.categoryName) || asString(input?.name);
    const wantFilter = filterCategoryId || filterName;
    const slimAsset = (a) => ({
      id: a.id,
      url: a.url,
      name: a.name || '',
      size: typeof a.size === 'number' ? a.size : undefined,
      uploadedAt: typeof a.uploadedAt === 'number' ? a.uploadedAt : undefined,
    });
    if (!wantFilter) {
      const categories = lib.categories.map((c) => ({
        id: c.id,
        name: c.name,
        assets: (c.assets || []).map(slimAsset),
      }));
      return {
        ok: true,
        workspaceId,
        categoryCount: categories.length,
        totalAssets: categories.reduce((n, c) => n + c.assets.length, 0),
        categories,
        message: `素材库共 ${categories.length} 个分组`,
      };
    }
    const cat = findCategory(lib, { id: filterCategoryId, categoryName: filterName });
    if (!cat) {
      return { ok: false, message: `未找到分组${filterCategoryId ? `（id=${filterCategoryId}）` : filterName ? `「${filterName}」` : ''}` };
    }
    return {
      ok: true,
      workspaceId,
      category: { id: cat.id, name: cat.name },
      assets: (cat.assets || []).map(slimAsset),
      message: `分组「${cat.name}」共 ${(cat.assets || []).length} 张图片`,
    };
  },

  /**
   * 按文件名查询素材（全库搜索，跨所有分组）。
   * 用户问「找一下 berserker.png」「有没有叫 xxx 的图」时调用。
   * 支持精确匹配（exact=true）或包含匹配（默认）。
   */
  find_asset_by_name: async (input, ctx) => {
    const fileName = asString(input?.fileName) || asString(input?.name);
    if (!fileName) return { ok: false, message: 'fileName 必填（要查的图片文件名）' };
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    const exact = input?.exact === true;
    const q = fileName.toLowerCase();
    const hits = [];
    for (const cat of lib.categories || []) {
      for (const a of cat.assets || []) {
        const n = (a.name || '').toLowerCase();
        const matched = exact ? n === q : n.includes(q);
        if (matched) hits.push({
          id: a.id,
          url: a.url,
          name: a.name || '',
          categoryId: cat.id,
          categoryName: cat.name,
        });
      }
    }
    return {
      ok: true,
      workspaceId,
      query: fileName,
      exact,
      total: hits.length,
      items: hits,
      message: hits.length
        ? `找到 ${hits.length} 张匹配「${fileName}」的图片`
        : `未找到文件名包含「${fileName}」的图片`,
    };
  },

  // —— 素材库：编辑 ——

  /**
   * 插入新图片到指定分组。
   * 用户说「把这张图加到角色分组」「往素材库添加一张图」时调用。
   * url 必填（通常是已上传的图片 http 路径，如 http://.../xxx.png）；
   * 目标分组用 categoryId（精确 id）或 categoryName（分组名，模糊匹配）二选一。
   * fileName/assetId/size 可选，不传则自动生成/补默认值。
   */
  add_asset: async (input, ctx) => {
    const url = asString(input?.url);
    if (!url) return { ok: false, message: 'url 必填（图片的 http 路径）' };
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    // 目标分组：优先 categoryId，其次 categoryName；name 仅作旧调用兼容回退（与图片 fileName 区分）
    const categoryId = asString(input?.categoryId);
    const categoryName = asString(input?.categoryName) || asString(input?.name);
    if (!categoryId && !categoryName) {
      return { ok: false, message: '需指定目标分组：传 categoryId（推荐）或 categoryName' };
    }
    const cat = findCategory(lib, { id: categoryId, categoryName });
    if (!cat) {
      return {
        ok: false,
        message: `未找到目标分组${categoryId ? `（id=${categoryId}）` : categoryName ? `「${categoryName}」` : ''}；请先 list_asset_categories 确认分组 id，或用 create_asset_category 新建分组`,
      };
    }
    const asset = {
      id: asString(input?.assetId) || genAssetId(),
      url,
      name: asString(input?.fileName) || 'untitled',
      // 可选标题：优先 input.title，否则从 fileName 去扩展名推导
      title: asString(input?.title)
        || (() => { const f = asString(input?.fileName) || ''; const d = f.lastIndexOf('.'); return d > 0 ? f.slice(0, d) : ''; })()
        || undefined,
      size: typeof input?.size === 'number' ? input.size : 0,
      uploadedAt: typeof input?.uploadedAt === 'number' ? input.uploadedAt : Date.now(),
    };
    const next = {
      categories: lib.categories.map((c) =>
        c.id === cat.id
          ? { ...c, assets: [asset, ...(c.assets || [])].slice(0, ASSET_MAX_PER_CATEGORY) }
          : c,
      ),
    };
    writeAssetLibrary(ctx, workspaceId, next);
    return {
      ok: true,
      workspaceId,
      assetId: asset.id,
      categoryId: cat.id,
      categoryName: cat.name,
      message: `已把「${asset.name}」加到分组「${cat.name}」（当前 ${next.categories.find((c) => c.id === cat.id).assets.length} 张）`,
    };
  },

  /**
   * 更新素材库里的图片（改 url/name 等字段）。支持改 url（换图）或改名。
   * 用户说「把这张图换掉」「修改 xxx.png 的名字」时调用。
   * assetId 必填；payload 里至少传一个要改的字段（url / name / size）。
   * 可选 categoryId 限定分组（不传则全库按 assetId 查找）。
   */
  update_asset: async (input, ctx) => {
    const assetId = asString(input?.assetId);
    if (!assetId) return { ok: false, message: 'assetId 必填（先用 find_asset_by_name / list_assets 拿到）' };
    const patch = input?.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : null;
    if (!patch) return { ok: false, message: 'data 必填，是要改的字段（如 {url} 或 {name}）' };
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    let updated = null;
    const nextPatch = {};
    if (typeof patch.url === 'string' && patch.url.trim()) nextPatch.url = patch.url.trim();
    if (typeof patch.name === 'string') nextPatch.name = patch.name;
    if (typeof patch.title === 'string') nextPatch.title = patch.title.trim() ? patch.title.trim() : undefined;
    if (typeof patch.size === 'number') nextPatch.size = patch.size;
    if (Object.keys(nextPatch).length === 0) {
      return { ok: false, message: 'data 里没有可改的字段（支持 url / name / title / size）' };
    }
    const next = {
      categories: (lib.categories || []).map((c) => {
        if (input?.categoryId && c.id !== input.categoryId) return c;
        let changed = false;
        const assets = (c.assets || []).map((a) => {
          if (a.id === assetId) {
            changed = true;
            updated = { ...a, ...nextPatch };
            return updated;
          }
          return a;
        });
        return changed ? { ...c, assets } : c;
      }),
    };
    if (!updated) {
      return { ok: false, message: `未找到 assetId=${assetId} 的图片${input?.categoryId ? `（在分组 ${input.categoryId} 内）` : ''}` };
    }
    writeAssetLibrary(ctx, workspaceId, next);
    return {
      ok: true,
      workspaceId,
      assetId,
      applied: Object.keys(nextPatch),
      asset: updated,
      message: `已更新图片 ${assetId} 的 ${Object.keys(nextPatch).join(', ')}`,
    };
  },

  /**
   * 删除素材库里的图片。
   * 用户说「删掉这张图」「移除 xxx.png」时调用。
   * assetId 必填；categoryId 可选（不传则全库按 assetId 删除）。
   */
  remove_asset: async (input, ctx) => {
    const assetId = asString(input?.assetId);
    if (!assetId) return { ok: false, message: 'assetId 必填（先用 find_asset_by_name / list_assets 拿到）' };
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    let removed = null;
    const next = {
      categories: (lib.categories || []).map((c) => {
        if (input?.categoryId && c.id !== input.categoryId) return c;
        const before = c.assets || [];
        const assets = before.filter((a) => {
          if (a.id === assetId) { removed = a; return false; }
          return true;
        });
        return assets.length !== before.length ? { ...c, assets } : c;
      }),
    };
    if (!removed) {
      return { ok: false, message: `未找到 assetId=${assetId} 的图片${input?.categoryId ? `（在分组 ${input.categoryId} 内）` : ''}` };
    }
    writeAssetLibrary(ctx, workspaceId, next);
    return {
      ok: true,
      workspaceId,
      assetId,
      message: `已删除图片 ${assetId}（${removed.name || ''}）`,
    };
  },

  // —— 素材库：分组管理 ——
  // 对应前端 useAssetLibrary 的 createCategory/renameCategory/deleteCategory，
  // 让 agent 也能完整管理分组生命周期。

  /**
   * 新建分组（分类）。
   * 用户说「在素材库建个 UI 分组」「加一个新分类叫场景」时调用。
   * name 可选（缺省「新建分类 N」）；返回新分组 id。
   */
  create_asset_category: async (input, ctx) => {
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    const name = asString(input?.name) || asString(input?.categoryName)
      || `新建分类 ${(lib.categories || []).length + 1}`;
    const id = genCategoryId(lib);
    const cat = { id, name, createdAt: Date.now(), assets: [] };
    const next = { categories: [...(lib.categories || []), cat] };
    writeAssetLibrary(ctx, workspaceId, next);
    return {
      ok: true,
      workspaceId,
      categoryId: id,
      categoryName: name,
      message: `已新建分组「${name}」（id=${id}）`,
    };
  },

  /**
   * 重命名分组。
   * 用户说「把角色分组改名成主角」「这个分类名不对」时调用。
   * 目标分组用 categoryId（精确）或 categoryName（模糊）定位。
   */
  rename_asset_category: async (input, ctx) => {
    const newName = asString(input?.newName) || asString(input?.name);
    if (!newName) return { ok: false, message: 'newName 必填（新分组名）' };
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    const categoryId = asString(input?.categoryId);
    const categoryName = asString(input?.categoryName);
    if (!categoryId && !categoryName) {
      return { ok: false, message: '需指定目标分组：传 categoryId 或 categoryName' };
    }
    const cat = findCategory(lib, { id: categoryId, categoryName });
    if (!cat) {
      return { ok: false, message: `未找到分组${categoryId ? `（id=${categoryId}）` : `「${categoryName}」`}` };
    }
    const oldName = cat.name;
    const next = {
      categories: (lib.categories || []).map((c) =>
        c.id === cat.id ? { ...c, name: newName } : c,
      ),
    };
    writeAssetLibrary(ctx, workspaceId, next);
    return {
      ok: true,
      workspaceId,
      categoryId: cat.id,
      oldName,
      newName,
      message: `已把分组「${oldName}」重命名为「${newName}」`,
    };
  },

  /**
   * 删除分组（连同分组内所有图片）。
   * 用户说「删掉这个分组」「不要 UI 分类了」时调用。
   * 目标分组用 categoryId（精确）或 categoryName（模糊）定位。
   */
  delete_asset_category: async (input, ctx) => {
    const workspaceId = resolveWorkspaceId(ctx, input);
    const lib = readAssetLibrary(ctx, workspaceId);
    const categoryId = asString(input?.categoryId);
    const categoryName = asString(input?.categoryName);
    if (!categoryId && !categoryName) {
      return { ok: false, message: '需指定目标分组：传 categoryId 或 categoryName' };
    }
    const cat = findCategory(lib, { id: categoryId, categoryName });
    if (!cat) {
      return { ok: false, message: `未找到分组${categoryId ? `（id=${categoryId}）` : `「${categoryName}」`}` };
    }
    const assetCount = (cat.assets || []).length;
    const next = {
      categories: (lib.categories || []).filter((c) => c.id !== cat.id),
    };
    writeAssetLibrary(ctx, workspaceId, next);
    return {
      ok: true,
      workspaceId,
      categoryId: cat.id,
      categoryName: cat.name,
      assetCount,
      message: `已删除分组「${cat.name}」${assetCount ? `（含 ${assetCount} 张图片）` : ''}`,
    };
  },
};
