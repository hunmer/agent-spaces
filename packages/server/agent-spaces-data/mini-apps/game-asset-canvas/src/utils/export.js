import { NODE_META } from './constants';

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
    format: 'game-asset-canvas',
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: cleanNodes,
    edges: edges || [],
  };
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
