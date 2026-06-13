// Provider 定义、常量

const PROVIDERS = {
  minimax: {
    name: 'MiniMax',
    icon: '🎙️',
    pluginId: 'workflow.minimax',
    toolName: 'minimax_tts',
    defaultVoices: [
      { id: 'Chinese (Mandarin)_Lyrical_Voice', name: '抒情女声', icon: '🎤' },
    ],
    defaultSettings: { speed: 1.0, vol: 1.0, pitch: 0, emotion: '' },
  },
  fishaudio: {
    name: 'FishAudio',
    icon: '🐟',
    pluginId: 'workflow.fish-audio',
    toolName: 'fish_audio_tts',
    defaultVoices: [
      { id: '54a5170f-5e7d-4f73-9e3d-50792e61a2a0', name: '通用女声', icon: '👩' },
      { id: '067a63e4-40d3-4a5f-8b42-1a6a8a4e8ea8', name: '通用男声', icon: '👨' },
    ],
    defaultSettings: { speed: 1.0, temperature: 0.7 },
  },
  qianyin: {
    name: '千音',
    icon: '🔊',
    pluginId: 'workflow.qianyin',
    toolName: 'qianyin_tts',
    defaultVoices: [
      { id: '521', name: '默认女声', icon: '👩' },
      { id: '1051', name: '晓晓 Ultra', icon: '🎙️' },
    ],
    defaultSettings: { speed: 1.0, volume: 100, pitch: 0 },
  },
};

const EMOTIONS = [
  { value: '', label: '默认' },
  { value: 'happy', label: '😊 开心' },
  { value: 'sad', label: '😢 悲伤' },
  { value: 'angry', label: '😠 愤怒' },
  { value: 'fearful', label: '😨 恐惧' },
  { value: 'surprised', label: '😲 惊讶' },
  { value: 'calm', label: '😌 平静' },
  { value: 'fluent', label: '🗣️ 流畅' },
  { value: 'whisper', label: '🤫 耳语' },
  { value: 'disgusted', label: '🤢 厌恶' },
];

function buildDefaultProviderStates() {
  const states = {};
  for (const [key, prov] of Object.entries(PROVIDERS)) {
    states[key] = {
      voices: [...prov.defaultVoices],
      voiceId: prov.defaultVoices[0]?.id || '',
      ...prov.defaultSettings,
    };
  }
  return states;
}

// 按服务商 + 音色 + 参数 + 文本构建正式 TTS 调用参数
function buildTTSArgs(providerKey, voiceId, settings, text) {
  const s = settings || {};
  const trimmed = (text || '').trim();
  switch (providerKey) {
    case 'minimax':
      return {
        text: trimmed,
        voiceId,
        speed: s.speed ?? 1.0,
        vol: s.vol ?? 1.0,
        pitch: s.pitch ?? 0,
        audioFormat: 'mp3',
        outputFormat: 'url',
        ...(s.emotion ? { emotion: s.emotion } : {}),
      };
    case 'fishaudio':
      return {
        text: trimmed,
        referenceId: voiceId,
        speed: s.speed ?? 1.0,
        temperature: s.temperature ?? 0.7,
        format: 'mp3',
      };
    case 'qianyin':
      return {
        text: trimmed,
        speakerId: voiceId,
        speed: s.speed ?? 1.0,
        volume: s.volume ?? 100,
        pitch: s.pitch ?? 0,
        format: 'mp3',
      };
    default:
      return { text: trimmed };
  }
}

// 从插件返回结果中按优先级提取音频 URL（兼容各服务商返回格式）
function extractAudioUrl(result) {
  return (
    result?.data?.audioUrl ||
    result?.data?.httpPath?.trim() ||
    result?.data?.fileUrl?.trim() ||
    result?.data?.url ||
    result?.audioUrl ||
    result?.url ||
    (typeof result?.data === 'string' ? result.data : null) ||
    (typeof result === 'string' ? result : null)
  );
}

// 生成简单唯一 id（沙箱环境不依赖 uuid 库）
function genId(prefix) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix || 'id'}_${Date.now().toString(36)}_${rnd}`;
}

export {
  PROVIDERS,
  EMOTIONS,
  buildDefaultProviderStates,
  buildTTSArgs,
  extractAudioUrl,
  genId,
};
