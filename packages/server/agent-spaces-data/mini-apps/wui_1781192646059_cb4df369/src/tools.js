export default [
  {
    name: 'get_music_library',
    description: '读取用户歌曲列表。用户问“有什么好听的音乐”“推荐一首”“我有哪些歌”，或要求播放某首歌之前，必须先调用此工具获取歌曲 id、标题、prompt 和音频地址等服务端镜像数据。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'next_music',
    description: '切换到播放列表中的下一首歌曲。无参数。成功后通过 miniApp.playerAction 广播 { dir: "next" }，由前端播放器执行切歌。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'prev_music',
    description: '切换到播放列表中的上一首歌曲。无参数。成功后通过 miniApp.playerAction 广播 { dir: "prev" }，由前端播放器执行切歌。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'generate_music',
    description: '根据用户给出的音乐风格和可选歌词调用 workflow.minimax 的 minimax_music_generation 插件生成歌曲。生成成功且返回 audioHex 时，会广播 miniApp.musicGenerated，把音频地址、提示词、歌词和标题交给前端加入播放器。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '音乐风格描述或生成要求，例如“轻快活泼的电子舞曲”。缺省时 api.js 使用“轻柔舒缓的钢琴曲”。',
        },
        lyrics: {
          type: 'string',
          description: '歌词文本。留空表示纯音乐或不指定歌词。',
        },
        instrumental: {
          type: 'boolean',
          description: '是否生成纯音乐。缺省为 true；传 false 表示允许使用歌词/人声。',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'toggle_like',
    description: '切换当前播放歌曲的喜欢状态。无参数。成功后广播 miniApp.toggleLike，由前端对当前歌曲执行喜欢/取消喜欢。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'play_random',
    description: '从前端本地播放列表随机播放一首歌曲。无参数。成功后通过 miniApp.playerAction 广播 { dir: "random" }。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'play_music',
    description: '播放用户歌曲列表中的指定歌曲。调用前应先调用 get_music_library 读取列表，再优先传入歌曲 id；如果用户只说了歌名或风格关键词，可以传 query 做标题/prompt 模糊匹配。成功后广播 miniApp.playerAction { dir: "goto" }，由前端播放器播放。',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '歌曲 id，来自 get_music_library 返回的 songs[].id。优先使用。',
        },
        query: {
          type: 'string',
          description: '用户提到的歌名、标题片段或风格关键词，例如“钢琴”“电子舞曲”。没有 id 时使用。',
        },
        title: {
          type: 'string',
          description: '歌曲标题片段。兼容字段，等价于 query。',
        },
      },
    },
  },
];
