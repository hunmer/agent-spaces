// 服务端单写者：画布状态 + 生成记录 + 设置由服务端统一写 configs 并广播，避免多端互相覆盖
const CANVAS_CONFIG = 'canvas.json';
const HISTORY_CONFIG = 'generation-history.json';
const SETTINGS_CONFIG = 'settings.json';
const PROMPT_CONFIG = 'prompt-library.json';
const HISTORY_MAX = 200;

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

  // 读取画布状态
  load_canvas: (_payload, ctx) => ctx.readConfig(CANVAS_CONFIG) || null,

  // 清空画布
  clear_canvas: (_payload, ctx) => {
    ctx.writeConfig(CANVAS_CONFIG, { nodes: [], edges: [], savedAt: Date.now() });
    return { ok: true };
  },

  // 新增一条生成记录（原子追加，最新在前，限制总量）
  add_history: ({ item }, ctx) => {
    if (!item) return { ok: false };
    ctx.updateConfig(HISTORY_CONFIG, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const next = [item, ...list];
      return next.slice(0, HISTORY_MAX);
    });
    return { ok: true };
  },

  // 删除指定生成记录
  remove_history: ({ id }, ctx) => {
    ctx.updateConfig(HISTORY_CONFIG, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((it) => it.id !== id);
    });
    return { ok: true };
  },

  // 清空生成记录
  clear_history: (_payload, ctx) => {
    ctx.writeConfig(HISTORY_CONFIG, []);
    return { ok: true };
  },

  // 保存设置（整体覆盖；前端已 merge 默认值）
  save_settings: ({ settings }, ctx) => {
    ctx.writeConfig(SETTINGS_CONFIG, settings || {});
    return { ok: true };
  },

  // 新增/更新一条自定义提示词（upsert：同 id 覆盖，否则追加到最前）
  save_prompt: ({ item }, ctx) => {
    if (!item || !item.id) return { ok: false };
    ctx.updateConfig(PROMPT_CONFIG, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const next = [item, ...list.filter((it) => it.id !== item.id)];
      return next;
    });
    return { ok: true };
  },

  // 删除一条自定义提示词（按 id）
  delete_prompt: ({ id }, ctx) => {
    ctx.updateConfig(PROMPT_CONFIG, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((it) => it.id !== id);
    });
    return { ok: true };
  },
};
