// 服务端 configs 单一写入方。客户端只读内存快照 + onConfigChanged，
// 所有写操作走 invokeService，避免多端并发覆盖。

const HISTORY_PATH = 'generation-history.json';
const CUSTOM_STYLES_PATH = 'custom-styles.json';
const SHARED_CONFIG_PATH = 'shared-config.json';

export default {
  // 新增生成结果（去重 + 倒序 + 限长 200）
  add_results: ({ items, prompt, model, styleId, styleName, aspect, size, kind, workflowId }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existing = new Set(list.map((item) => item.url));
      const now = Date.now();
      const fresh = (Array.isArray(items) ? items : [])
        .filter((item) => item?.url && !existing.has(item.url))
        .map((item, index) => ({
          id: `${now}-${index}`,
          url: item.url,
          prompt,
          model,
          styleId,
          styleName,
          aspect,
          size,
          kind,
          workflowId,
          createdAt: new Date().toLocaleString('zh-CN'),
        }));
      return fresh.length ? [...fresh, ...list].slice(0, 200) : list;
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

  // 自定义风格：保存 / 删除
  save_custom_style: ({ style }, ctx) => {
    if (!style?.id) return { ok: false };
    ctx.updateConfig(CUSTOM_STYLES_PATH, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const filtered = list.filter((s) => s.id !== style.id);
      return [style, ...filtered].slice(0, 50);
    });
    return { ok: true };
  },

  remove_custom_style: ({ id }, ctx) => {
    ctx.updateConfig(CUSTOM_STYLES_PATH, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((s) => s.id !== id),
    );
    return { ok: true };
  },

  save_shared_config: (payload, ctx) => {
    ctx.writeConfig(SHARED_CONFIG_PATH, {
      defaultModel: typeof payload?.defaultModel === 'string' ? payload.defaultModel : '',
      defaultAgentPresetId: typeof payload?.defaultAgentPresetId === 'string' ? payload.defaultAgentPresetId : '',
    });
    return { ok: true };
  },
};

export { HISTORY_PATH, CUSTOM_STYLES_PATH, SHARED_CONFIG_PATH };
