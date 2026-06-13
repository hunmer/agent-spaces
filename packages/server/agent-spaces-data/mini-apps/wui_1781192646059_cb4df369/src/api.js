export default {
  /**
   * 切换到下一首歌曲
   */
  next_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'next' });
    return { ok: true, action: 'next' };
  },

  /**
   * 切换到上一首歌曲
   */
  prev_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'prev' });
    return { ok: true, action: 'prev' };
  },

  /**
   * 根据提示词生成一首歌曲
   * @param {string} prompt - 音乐风格描述，如"轻快活泼的电子舞曲"
   * @param {string} [lyrics] - 歌词文本，留空表示纯音乐
   * @param {boolean} [instrumental] - 是否为纯音乐，默认 true
   */
  generate_music: async (input, ctx) => {
    try {
      const prompt = input.prompt || '轻柔舒缓的钢琴曲';
      const lyrics = input.lyrics || '';
      const instrumental = input.instrumental !== false;
      const result = await ctx.callPluginTool(
        'workflow.minimax',
        'minimax_music_generation',
        { prompt, lyrics, instrumental }
      );
      const data = result?.result?.data || result?.data;
      const audioUrl = data?.audioHex?.trim();
      if (audioUrl) {
        const title = prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt;
        ctx.broadcast('miniApp.musicGenerated', { audioUrl, prompt, lyrics, title });
      }
      return { ok: true, message: '歌曲生成完成', audioUrl };
    } catch (err) {
      return { ok: false, message: '生成失败：' + (err.message || String(err)) };
    }
  },

  /**
   * 切换当前歌曲的喜欢状态（喜欢/取消喜欢）
   */
  toggle_like: (_input, ctx) => {
    ctx.broadcast('miniApp.toggleLike', {});
    return { ok: true, message: '已切换喜欢状态' };
  },

  /**
   * 随机播放一首（播放列表由前端本地 localStorage 维护，后端不再读取）
   */
  play_random: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'random' });
    return { ok: true, action: 'random', message: '已随机播放一首' };
  },
};
