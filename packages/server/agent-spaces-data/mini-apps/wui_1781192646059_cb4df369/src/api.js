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
      ctx.broadcast('miniApp.musicGenerated', { result });
      return { ok: true, message: '歌曲生成中，请稍候...', result };
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
   * 从播放列表中随机选一首歌曲播放
   */
  play_random: (_input, ctx) => {
    try {
      const history = ctx.readConfig('music-history.json');
      if (!history || !Array.isArray(history) || history.length === 0) {
        return { ok: false, message: '播放列表为空，请先生成歌曲' };
      }
      const index = Math.floor(Math.random() * history.length);
      const song = history[index];
      ctx.broadcast('miniApp.playerAction', {
        dir: 'goto',
        index,
        id: song.id,
        audioUrl: song.audioUrl,
        title: song.title,
        artist: song.artist,
      });
      return {
        ok: true,
        message: `正在播放「${song.title || '未命名'}」- ${song.artist || '未知艺术家'}`,
        song: { id: song.id, title: song.title, artist: song.artist },
      };
    } catch (err) {
      return { ok: false, message: '读取播放列表失败：' + (err.message || String(err)) };
    }
  },
};
