const HISTORY_PATH = 'generation-history.json';
const CONFIG_PATH = 'shared-config.json';

export default {
  // 追加生成结果到历史（去重，按 url，最多保留 100 条）
  add_results: ({ items, lyric, style, gender, sourceTitle, workflowId, workflowName }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existing = new Set(list.map((item) => item.url));
      const now = Date.now();
      const fresh = (Array.isArray(items) ? items : [])
        .filter((item) => item?.url && !existing.has(item.url))
        .map((item, index) => ({
          id: `${now}-${index}`,
          type: 'audio',
          url: item.url,
          title: item.title || sourceTitle || '国之脊梁',
          lyric,
          style,
          gender,
          duration: typeof item.duration === 'number' ? item.duration : null,
          workflowId,
          workflowName,
          createdAt: new Date().toLocaleString('zh-CN'),
        }));
      return fresh.length ? [...fresh, ...list].slice(0, 100) : list;
    });
    return { ok: true };
  },

  remove_result: ({ id }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((item) => item.id !== id),
    );
    return { ok: true };
  },

  clear_results: (_payload, ctx) => {
    ctx.writeConfig(HISTORY_PATH, []);
    return { ok: true };
  },

  save_shared_config: (payload, ctx) => {
    const workflowId = typeof payload?.workflowId === 'string' ? payload.workflowId : '';
    const workflowName = typeof payload?.workflowName === 'string' ? payload.workflowName : '';
    ctx.writeConfig(CONFIG_PATH, { workflowId, workflowName });
    return { ok: true };
  },
};
