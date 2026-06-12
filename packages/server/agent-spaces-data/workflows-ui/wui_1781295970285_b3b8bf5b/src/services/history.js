// 生成历史的服务端 handler。服务端是 configs 的唯一写入方，
// ctx.writeConfig / ctx.updateConfig 写回后会自动广播 workflowUi.configChanged，
// 所有客户端据此更新内存缓存，避免多端互相覆盖。
const HISTORY_PATH = 'generation-history.json';

export default {
  // 追加生成结果（按 url 去重）
  // payload: { items: [{type, url}], mode, provider, prompt }
  add_results: ({ items, mode, provider, prompt }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existing = new Set(list.map((r) => r.url));
      const timestamp = Date.now();
      const fresh = (items || [])
        .filter((item) => item && item.url && !existing.has(item.url))
        .map((item, i) => ({
          id: `${timestamp}-${i}`,
          type: item.type,
          url: item.url,
          mode,
          provider,
          prompt,
          createdAt: new Date().toLocaleString('zh-CN'),
        }));
      return fresh.length ? [...fresh, ...list] : list;
    });
    return { ok: true };
  },

  // 清空全部历史
  clear_results: (_payload, ctx) => {
    ctx.writeConfig(HISTORY_PATH, []);
    return { ok: true };
  },

  // 删除单条结果。payload: { id }
  remove_result: ({ id }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((r) => r.id !== id),
    );
    return { ok: true };
  },
};
