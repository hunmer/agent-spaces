export default {
  get_prefs: (_input, ctx) => ctx.readConfig('config.json') || null,
  update_prefs: (input, ctx) => {
    const next = ctx.updateConfig('config.json', (prev) => ({ ...prev, ...input }));
    return { ok: true, prefs: next };
  },
};
