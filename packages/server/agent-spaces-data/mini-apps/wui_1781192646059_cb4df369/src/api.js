export default {
  // 无参：广播切下一首
  next_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'next' });
    return { ok: true, action: 'next' };
  },
  // 无参：广播切上一首
  prev_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'prev' });
    return { ok: true, action: 'prev' };
  },
};
