const { useState, useCallback, useEffect } = React;
const {
  Card, CardContent, CardHeader, CardTitle,
  Textarea, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Badge,
} = window.AgentSpacesUI;

import { PROVIDERS, buildDefaultProviderStates } from './utils/providers';
import { readConfig, persistProviderStates } from './utils/config';
import styles from './utils/styles';
import VoiceSelector from './components/VoiceSelector';
import ParameterPanel from './components/ParameterPanel';
import ControlBar from './components/ControlBar';

function App() {
  const [text, setText] = useState('');
  const [provider, setProvider] = useState('minimax');
  const [providerStates, setProviderStates] = useState(buildDefaultProviderStates);

  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  const current = providerStates[provider];
  const voices = current.voices;
  const voiceId = current.voiceId;

  // ========== 启动时加载配置 ==========

  useEffect(() => {
    readConfig()
      .then((cfg) => {
        if (cfg.text) setText(cfg.text);
        if (cfg.provider && PROVIDERS[cfg.provider]) setProvider(cfg.provider);

        const states = buildDefaultProviderStates();

        if (cfg.providers && typeof cfg.providers === 'object') {
          for (const key of Object.keys(PROVIDERS)) {
            const pc = cfg.providers[key];
            if (!pc) continue;
            if (Array.isArray(pc.voices) && pc.voices.length > 0) {
              states[key].voices = pc.voices;
            }
            if (pc.voiceId) {
              const hasVoice = states[key].voices.some((v) => v.id === pc.voiceId);
              states[key].voiceId = hasVoice ? pc.voiceId : states[key].voices[0]?.id || '';
            }
            for (const [sk] of Object.entries(PROVIDERS[key].defaultSettings)) {
              if (pc[sk] != null) states[key][sk] = pc[sk];
            }
          }
        } else if (Array.isArray(cfg.voices)) {
          states.minimax.voices = cfg.voices;
          states.minimax.voiceId =
            cfg.voiceId && cfg.voices.some((v) => v.id === cfg.voiceId)
              ? cfg.voiceId
              : cfg.voices[0]?.id || '';
          if (cfg.speed != null) states.minimax.speed = cfg.speed;
          if (cfg.vol != null) states.minimax.vol = cfg.vol;
          if (cfg.pitch != null) states.minimax.pitch = cfg.pitch;
          if (cfg.emotion != null) states.minimax.emotion = cfg.emotion;
        }

        setProviderStates(states);
      })
      .catch((e) => {
        setError('加载配置失败: ' + (e?.message || e?.toString()));
      })
      .finally(() => setConfigLoaded(true));
  }, []);

  // ========== TTS 生成 ==========

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      setError('请输入需要配音的文本');
      return;
    }
    if (text.length > 10000) {
      setError('文本长度不能超过 10000 个字符');
      return;
    }

    setLoading(true);
    setError('');
    setAudioUrl('');

    try {
      const s = providerStates[provider];
      const prov = PROVIDERS[provider];
      let args = { text: text.trim() };

      switch (provider) {
        case 'minimax':
          args.voiceId = s.voiceId;
          args.speed = s.speed;
          args.vol = s.vol;
          args.pitch = s.pitch;
          args.audioFormat = 'mp3';
          args.outputFormat = 'url';
          if (s.emotion) args.emotion = s.emotion;
          break;
        case 'fishaudio':
          args.referenceId = s.voiceId;
          args.speed = s.speed;
          args.temperature = s.temperature;
          args.format = 'mp3';
          break;
        case 'qianyin':
          args.speakerId = s.voiceId;
          args.speed = s.speed;
          args.volume = s.volume;
          args.pitch = s.pitch;
          args.format = 'mp3';
          break;
      }

      await persistProviderStates(providerStates, text, provider);

      const result = await window.AgentSpaces.callPluginTool(
        prov.pluginId,
        prov.toolName,
        args
      );

      const url =
        result?.data?.audioUrl ||
        result?.data?.httpPath?.trim() ||
        result?.data?.fileUrl?.trim() ||
        result?.data?.url ||
        result?.audioUrl ||
        result?.url ||
        (typeof result?.data === 'string' ? result.data : null) ||
        (typeof result === 'string' ? result : null);

      if (url) {
        setAudioUrl(url);
      } else {
        setError('未获取到音频地址，返回数据：' + JSON.stringify(result).slice(0, 200));
      }
    } catch (e) {
      setError(e?.message || e?.toString() || '语音合成失败');
    } finally {
      setLoading(false);
    }
  }, [text, provider, providerStates]);

  // ========== 音色增删 ==========

  const handleAddVoice = useCallback(async (newId, newName) => {
    const id = newId.trim();
    const name = newName.trim();
    if (!id || !name) return;
    if (voices.some((v) => v.id === id)) return;

    const updated = [...voices, { id, name, icon: '🎵' }];
    const prevStates = providerStates;
    const newStates = {
      ...providerStates,
      [provider]: { ...providerStates[provider], voices: updated },
    };
    setProviderStates(newStates);

    try {
      await persistProviderStates(newStates, text, provider);
    } catch (e) {
      setProviderStates(prevStates);
      setError('保存音色失败: ' + (e?.message || e?.toString()));
    }
  }, [voices, provider, providerStates, text]);

  const handleDeleteVoice = useCallback(async (id) => {
    if (voices.length <= 1) return;

    const updated = voices.filter((v) => v.id !== id);
    const prevStates = providerStates;
    const newStates = {
      ...providerStates,
      [provider]: {
        ...providerStates[provider],
        voices: updated,
        ...(voiceId === id ? { voiceId: updated[0]?.id || '' } : {}),
      },
    };
    setProviderStates(newStates);

    try {
      await persistProviderStates(newStates, text, provider);
    } catch (e) {
      setProviderStates(prevStates);
      setError('删除音色失败: ' + (e?.message || e?.toString()));
    }
  }, [voices, voiceId, provider, providerStates, text]);

  const handleSelectVoice = useCallback((id) => {
    setProviderStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], voiceId: id },
    }));
  }, [provider]);

  const handleProviderChange = useCallback((newProvider) => {
    setProvider(newProvider);
  }, []);

  const handleParamUpdate = useCallback((updated) => {
    setProviderStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], ...updated },
    }));
  }, [provider]);

  // ========== 渲染 ==========

  if (!configLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Badge variant="secondary">加载配置中...</Badge>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'center', padding: '12px 0' }}>
        {PROVIDERS[provider].icon} {PROVIDERS[provider].name} 配音
      </div>

      <div style={styles.main}>
        {/* 左侧：文本输入 */}
        <Card style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
          <CardHeader style={{ padding: '12px 16px' }}>
            <CardTitle style={{ fontSize: '14px' }}>📝 输入文本</CardTitle>
          </CardHeader>
          <CardContent style={{ flex: '1', display: 'flex', flexDirection: 'column', padding: '0 16px 16px' }}>
            <Textarea
              style={{ flex: '1', minHeight: '160px', resize: 'vertical' }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="在此输入需要配音的文本内容..."
              maxLength={10000}
            />
            <div style={styles.charCount}>{text.length} / 10000</div>
          </CardContent>
        </Card>

        {/* 右侧：角色设置 */}
        <Card style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
          <CardHeader style={{ padding: '12px 16px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <CardTitle style={{ fontSize: '14px' }}>🎭 角色设置</CardTitle>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger style={{ width: '150px', fontSize: '13px' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROVIDERS).map(([key, prov]) => (
                  <SelectItem key={key} value={key}>
                    {prov.icon} {prov.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent style={{ flex: '1', overflowY: 'auto', padding: '0 16px 16px' }}>
            <VoiceSelector
              voices={voices}
              voiceId={voiceId}
              provider={provider}
              onSelect={handleSelectVoice}
              onDelete={handleDeleteVoice}
              onAdd={handleAddVoice}
            />

            <ParameterPanel
              provider={provider}
              current={current}
              onUpdate={handleParamUpdate}
            />
          </CardContent>
        </Card>
      </div>

      <ControlBar
        loading={loading}
        error={error}
        audioUrl={audioUrl}
        onGenerate={handleGenerate}
      />
    </div>
  );
}

export default App;
