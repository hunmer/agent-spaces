// 服务端单写者：画布状态由服务端统一写 configs/canvas.json 并广播，避免多端互相覆盖
const CANVAS_CONFIG = 'canvas.json';

export default {
  // 保存整张画布（节点 + 连线）
  save_canvas: ({ nodes, edges }, ctx) => {
    ctx.writeConfig(CANVAS_CONFIG, {
      nodes: Array.isArray(nodes) ? nodes : [],
      edges: Array.isArray(edges) ? edges : [],
      savedAt: Date.now(),
    });
    return { ok: true };
  },

  // 读取画布状态（供初次加载兜底；前端通常直接用 getConfig 缓存）
  load_canvas: (_payload, ctx) => ctx.readConfig(CANVAS_CONFIG) || null,

  // 清空画布
  clear_canvas: (_payload, ctx) => {
    ctx.writeConfig(CANVAS_CONFIG, { nodes: [], edges: [], savedAt: Date.now() });
    return { ok: true };
  },
};
