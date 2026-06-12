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

export { PROVIDERS, EMOTIONS, buildDefaultProviderStates };
