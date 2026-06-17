const HISTORY_PATH = 'generation-history.json';
const CONFIG_PATH = 'shared-config.json';

export default {
  add_results: ({ items, prompt, provider, model, workflowId, workflowName }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existing = new Set(list.map((item) => item.url));
      const now = Date.now();
      const fresh = (Array.isArray(items) ? items : [])
        .filter((item) => item?.url && !existing.has(item.url))
        .map((item, index) => ({
          id: `${now}-${index}`,
          type: 'image',
          url: item.url,
          prompt,
          provider,
          model,
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

