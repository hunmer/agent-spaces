export default {
  /**
   * 通过 WS 请求客户端读取浏览器 localStorage 中的用户歌曲列表。
   */
  get_music_library: async (_input, ctx) => {
    try {
      const library = await ctx.requestClient('musicLibrary');
      const songs = Array.isArray(library?.songs) ? library.songs : [];
      return {
        ok: true,
        count: songs.length,
        updatedAt: library?.updatedAt || null,
        songs,
        message: songs.length
          ? '已读取用户歌曲列表'
          : '用户歌曲列表为空',
      };
    } catch (err) {
      return { ok: false, message: '读取用户歌曲列表失败：' + (err.message || String(err)) };
    }
  },

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
   * 根据提示词生成歌词。参数说明维护在同目录 tools.js。
   */
  generate_lyrics: async (input, ctx) => {
    try {
      const prompt = input.prompt || '写一首完整歌曲歌词';
      const mode = input.mode || 'write_full_song';
      const lyrics = input.lyrics || '';
      const title = input.title || '';
      const result = await ctx.callPluginTool(
        'workflow.minimax',
        'minimax_lyrics_generation',
        { prompt, mode, lyrics, title }
      );
      const pluginResult = result?.result || result || {};
      const data = pluginResult.data || {};
      return {
        ok: pluginResult.success !== false,
        message: pluginResult.message || '歌词生成完成',
        songTitle: data.songTitle || data.song_title || title || '',
        styleTags: data.styleTags || data.style_tags || '',
        lyrics: data.lyrics || '',
        raw: result,
      };
    } catch (err) {
      return { ok: false, message: '歌词生成失败：' + (err.message || String(err)) };
    }
  },

  /**
   * 根据提示词生成一首歌曲。成功后会广播 miniApp.musicGenerated，前端会自动加入列表并播放。
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

  /**
   * 根据 id、标题或关键词播放用户歌曲列表中的一首歌。
   */
  play_music: async (input, ctx) => {
    let library;
    try {
      library = await ctx.requestClient('musicLibrary');
    } catch (err) {
      return { ok: false, message: '读取用户歌曲列表失败：' + (err.message || String(err)) };
    }
    const songs = Array.isArray(library?.songs) ? library.songs : [];
    if (songs.length === 0) {
      return { ok: false, message: '用户歌曲列表为空或尚未从客户端同步' };
    }

    const id = String(input.id || '').trim();
    const query = String(input.query || input.title || '').trim().toLowerCase();
    const song = songs.find((item) => id && item?.id === id)
      || songs.find((item) => query && String(item?.title || '').toLowerCase().includes(query))
      || songs.find((item) => query && String(item?.prompt || '').toLowerCase().includes(query));

    if (!song) {
      return {
        ok: false,
        message: '未找到匹配歌曲',
        candidates: songs.slice(0, 10).map((item) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          prompt: item.prompt,
        })),
      };
    }

    ctx.broadcast('miniApp.playerAction', {
      dir: 'goto',
      id: song.id,
      audioUrl: song.audioUrl,
      title: song.title,
    });
    return { ok: true, action: 'goto', song };
  },
};
