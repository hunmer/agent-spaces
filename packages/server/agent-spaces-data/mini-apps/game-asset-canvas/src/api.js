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
  'textToImage',   // 文字生成图片
  'editImage',     // 编辑图片
  'imageDisplay',  // 图片展示
  'imageProcess',  // 图像处理（旧单节点，兼容）
  // 图像处理拆分节点（一个处理器 = 一个节点类型）
  'ipGifSplit',       // GIF 拆帧
  'ipGifMerge',       // GIF 合成
  'ipSpriteSplit',    // Sheet 拆分
  'ipSpriteMerge',    // Sheet 合成
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
  'directorDesk',  // 3D导演台
  'note',          // 便签
];

const NODE_LABELS = {
  textToImage: '文字生成图片',
  editImage: '编辑图片',
  imageDisplay: '图片展示',
  imageProcess: '图像处理',
  ipGifSplit: 'GIF 拆帧',
  ipGifMerge: 'GIF 合成',
  ipSpriteSplit: 'Sheet 拆分',
  ipSpriteMerge: 'Sheet 合成',
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
  directorDesk: '3D导演台',
  note: '便签',
};

function asString(v, def = '') {
  return typeof v === 'string' ? v.trim() : def;
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
   * @param {string} [input.label]  节点标题（可选）
   * @param {object} [input.position] 坐标 {x,y}；不传则由画布自动错落
   * @param {object} [input.data]   节点初始 data 覆盖（如 {text:'备注'} / {params:{prompt:'...'}}）
   * @param {boolean} [input.focus] 创建后是否聚焦到该节点（默认 true）
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
    const label = asString(input?.label);
    if (label) payload.label = label;
    if (input?.position && typeof input.position === 'object') {
      const x = Number(input.position.x);
      const y = Number(input.position.y);
      if (Number.isFinite(x) && Number.isFinite(y)) payload.position = { x, y };
    }
    if (input?.data && typeof input?.data === 'object' && !Array.isArray(input.data)) {
      payload.data = input.data;
    }
    payload.focus = input?.focus !== false; // 默认聚焦
    // 可选 groupName：建完节点后归入同名分组（不存在则创建）
    const groupName = asString(input?.groupName);
    if (groupName) payload.groupName = groupName;
    const result = await rpc(ctx, 'canvas.addNode', payload);
    return {
      ok: true,
      nodeId: result?.nodeId,
      type,
      typeLabel: NODE_LABELS[type] || type,
      position: result?.position,
      groupName: groupName || undefined,
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
   * @param {Array} input.nodes  节点规格数组，每项 {type, label?, position?, data?, focus?}
   * @param {boolean} [input.focusFirst] 是否聚焦到首个新增节点（默认 true）
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
      if (typeof item.label === 'string' && item.label.trim()) spec.label = item.label.trim();
      if (item.position && typeof item.position === 'object') {
        const x = Number(item.position.x);
        const y = Number(item.position.y);
        if (Number.isFinite(x) && Number.isFinite(y)) spec.position = { x, y };
      }
      if (item.data && typeof item.data === 'object' && !Array.isArray(item.data)) spec.data = item.data;
      cleaned.push(spec);
    }
    const result = await rpc(ctx, 'canvas.addNodes', {
      nodes: cleaned,
      focusFirst: input?.focusFirst !== false,
      // 可选 groupName：本次批量建的节点一起归入同名分组（不存在则创建）
      groupName: asString(input?.groupName) || undefined,
    });
    const ids = Array.isArray(result?.nodeIds) ? result.nodeIds : [];
    const groupName = asString(input?.groupName);
    return {
      ok: true,
      count: ids.length,
      nodeIds: ids,
      groupName: groupName || undefined,
      message: `已新增 ${ids.length} 个节点：${ids.map((id) => id).join(', ')}${groupName ? `，并归入分组「${groupName}」` : ''}`,
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
    return {
      ok: true,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        typeLabel: NODE_LABELS[n.type] || n.type,
        label: n.label || '',
        position: n.position,
      })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
      message: `画布当前 ${nodes.length} 个节点 / ${edges.length} 条连线`,
    };
  },

  /**
   * 连接两个节点（source 的输出 → target 的输入）。
   * @param {object} input
   * @param {string} input.sourceId 源节点 id
   * @param {string} input.targetId 目标节点 id
   */
  connect_nodes: async (input, ctx) => {
    const sourceId = asString(input?.sourceId);
    const targetId = asString(input?.targetId);
    if (!sourceId || !targetId) {
      return { ok: false, message: 'sourceId 和 targetId 都必填（先用 get_canvas / list_nodes 查节点 id）' };
    }
    if (sourceId === targetId) {
      return { ok: false, message: '不能连接到自己' };
    }
    const result = await rpc(ctx, 'canvas.connectNodes', { sourceId, targetId });
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
      cleaned.push({ sourceId, targetId });
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
   * @param {object} input.data 合并到节点 data 的字段（如 note 用 {text}，文生图用 {params:{prompt,model}}）
   */
  update_node: async (input, ctx) => {
    const nodeId = asString(input?.nodeId);
    if (!nodeId) return { ok: false, message: 'nodeId 必填' };
    if (!input?.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
      return { ok: false, message: 'data 必须是对象（合并到节点 data 的字段）' };
    }
    const result = await rpc(ctx, 'canvas.updateNodeData', { nodeId, data: input.data });
    if (result?.ok === false) return result;
    return { ok: true, nodeId, applied: Object.keys(input.data), message: `已更新节点 ${nodeId} 的 ${Object.keys(input.data).length} 个字段` };
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
};
