import { NODE_META } from './constants';

const CANVAS_FORMAT = 'game-asset-canvas';

/**
 * 把画布节点/边序列化为可导出的干净 JSON（去掉注入的函数回调）。
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {object} { format, exportedAt, nodes, edges }
 */
export function serializeCanvas(nodes, edges) {
  const cleanNodes = (nodes || []).map((n) => {
    const { onUpdate, onGenerate, ...restData } = n.data || {};
    void onUpdate; void onGenerate;
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: restData,
      meta: NODE_META[n.type] ? { label: NODE_META[n.type].label } : undefined,
    };
  });
  return {
    format: CANVAS_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: cleanNodes,
    edges: edges || [],
  };
}

/**
 * 解析导入的画布 JSON：校验格式、过滤多余字段，返回可直接 setNodes/setEdges 的 {nodes, edges}。
 * 校验失败抛 Error，调用方负责 catch + 提示。
 *
 * @param {string} text  - 文件文本内容
 * @returns {{ nodes: Array, edges: Array }}
 */
export function parseCanvasJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON 格式无效：' + e.message);
  }
  if (!data || typeof data !== 'object') throw new Error('文件内容不是合法的 JSON 对象');
  if (data.format !== CANVAS_FORMAT) throw new Error(`格式不匹配（期望 ${CANVAS_FORMAT}，实际 ${data.format || '未知'}）`);
  if (!Array.isArray(data.nodes)) throw new Error('nodes 字段缺失或非数组');
  if (!Array.isArray(data.edges)) throw new Error('edges 字段缺失或非数组');

  // 保留 ReactFlow 运行所需字段，剔除注入回调 / selected / 等 UI 态（避免污染目标画布选中态）
  const nodes = data.nodes.map((n) => {
    const data0 = n.data || {};
    // 反序列化 data 内的函数回调字段本就不可能存在（导出时已剥），保险起见再剥一次
    const { onUpdate, onGenerate, selected, ...restData } = data0;
    void onUpdate; void onGenerate; void selected;
    return {
      id: String(n.id),
      type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: restData,
    };
  });
  const edges = data.edges.map((e) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
  return { nodes, edges };
}

/**
 * 触发文件选择 → 读取 → 解析 → 返回 {nodes, edges}。
 * 用户取消选文件时 resolve(null)（不抛错，调用方按 null 处理）。
 * @returns {Promise<{nodes:Array, edges:Array} | null>}
 */
export function pickAndParseCanvasFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(parseCanvasJson(String(reader.result)));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    };
    input.click();
  });
}

/**
 * 触发浏览器下载 JSON 文件。
 * @param {object} data
 * @param {string} filename
 */
export function downloadJson(data, filename = 'game-asset-canvas.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
