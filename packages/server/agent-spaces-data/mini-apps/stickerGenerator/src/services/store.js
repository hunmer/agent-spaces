// 服务端 configs 单一写入方。客户端只读内存快照 + onConfigChanged，
// 所有写操作走 invokeService，避免多端并发覆盖。

const HISTORY_PATH = 'generation-history.json';
const CUSTOM_STYLES_PATH = 'custom-styles.json';
const SETTINGS_PATH = 'settings.json';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

export default {
  // 新增生成结果（去重 + 倒序 + 限长 200）
  add_results: ({ items, prompt, model, styleId, styleName, aspect, size, kind, workflowId }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) => {
      const list = asArray(prev);
      const existing = new Set(list.map((item) => item.url));
      const now = Date.now();
      const fresh = asArray(items)
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
    ctx.updateConfig(HISTORY_PATH, (prev) => asArray(prev).filter((item) => item.id !== id));
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
      const list = asArray(prev);
      const filtered = list.filter((s) => s.id !== style.id);
      return [style, ...filtered].slice(0, 50);
    });
    return { ok: true };
  },

  remove_custom_style: ({ id }, ctx) => {
    ctx.updateConfig(CUSTOM_STYLES_PATH, (prev) => asArray(prev).filter((s) => s.id !== id));
    return { ok: true };
  },

  // 保存设置：工作流 / 默认模型 / agent。整体合并写入，广播给所有客户端。
  save_settings: ({ settings }, ctx) => {
    if (!settings || typeof settings !== 'object') return { ok: false };
    ctx.updateConfig(SETTINGS_PATH, (prev) => ({
      ...(prev && typeof prev === 'object' ? prev : {}),
      ...settings,
    }));
    return { ok: true };
  },

  // 批量添加拆分子贴纸：dataUrl 直接作为 url 落库（浏览器端 Canvas 处理结果）
  // { items: [{ url }], sourceId, prompt, model, styleName }
  add_split_pieces: ({ items, sourceId, prompt, model, styleName }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) => {
      const list = asArray(prev);
      const now = Date.now();
      const fresh = asArray(items)
        .filter((item) => item?.url)
        .map((item, index) => ({
          id: `${now}-split-${index}`,
          url: item.url,
          prompt: prompt || '',
          model: model || '',
          styleName: styleName || '',
          kind: 'split',
          sourceId: sourceId || '',
          isSplitPiece: true,
          createdAt: new Date().toLocaleString('zh-CN'),
        }));
      return fresh.length ? [...fresh, ...list].slice(0, 200) : list;
    });
    return { ok: true };
  },
};
