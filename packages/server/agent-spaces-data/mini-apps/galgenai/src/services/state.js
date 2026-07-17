// 服务端单写者：负责可变共享状态的原子更新。
// 所有需要并发安全（多预览实例同时写）的状态都走这里；
// UI 读取用 getConfig('state.json') + onConfigChanged 监听。

export default {
  // 归档当前会话到历史，并清空当前会话
  archive_session: (_payload, ctx) => {
    ctx.updateConfig('state.json', (prev) => {
      const cur = prev || {};
      const messages = Array.isArray(cur.messages) ? cur.messages : [];
      const history = Array.isArray(cur.history) ? cur.history : [];
      if (messages.length === 0) return cur;
      return { ...cur, history: [messages, ...history].slice(0, 50), messages: [] };
    });
    return { ok: true };
  },

  // 清空当前会话消息
  clear_messages: (_payload, ctx) => {
    ctx.updateConfig('state.json', (prev) => ({ ...(prev || {}), messages: [] }));
    return { ok: true };
  },

  // 追加单条消息（用户或 AI）
  add_message: ({ message }, ctx) => {
    if (!message || !message.id) return { ok: false };
    ctx.updateConfig('state.json', (prev) => {
      const cur = prev || {};
      const messages = Array.isArray(cur.messages) ? cur.messages : [];
      // 同 id 幂等，避免重复写入
      if (messages.some((m) => m.id === message.id)) return cur;
      return { ...cur, messages: [...messages, message] };
    });
    return { ok: true };
  },

  // 删除指定历史会话（按索引）
  delete_history: ({ index }, ctx) => {
    ctx.updateConfig('state.json', (prev) => {
      const cur = prev || {};
      const history = Array.isArray(cur.history) ? cur.history : [];
      if (index < 0 || index >= history.length) return cur;
      return { ...cur, history: history.filter((_, i) => i !== index) };
    });
    return { ok: true };
  },
};
