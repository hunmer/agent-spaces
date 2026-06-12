const { useState, useCallback, useEffect, useRef } = React;
const {
  Button, Card, CardContent, CardHeader, CardTitle,
  Textarea, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Slider, Alert, AlertDescription, Badge, Separator, Input,
} = window.AgentSpacesUI;

// ========== 常量 ==========

const CONFIG_PATH = 'config.json';

const DEFAULT_VOICES = [
  { id: 'Chinese (Mandarin)_Lyrical_Voice', name: '抒情女声', icon: '🎤' },
  { id: 'Chinese (Mandarin)_Sweet_Voice', name: '甜美女声', icon: '🎵' },
  { id: 'Chinese (Mandarin)_Storytelling_Voice', name: '有声书男声', icon: '📖' },
  { id: 'Chinese (Mandarin)_News_Voice', name: '新闻播报', icon: '📺' },
  { id: 'Chinese (Mandarin)_Assistant_Voice', name: '助手音', icon: '🤖' },
  { id: 'male-qn-qingse', name: '青涩男声', icon: '🧑' },
  { id: 'male-qn-jingying', name: '精英男声', icon: '👔' },
  { id: 'male-qn-badao', name: '霸道男声', icon: '🔥' },
  { id: 'female-shaonv', name: '少女音', icon: '👧' },
  { id: 'female-yujie', name: '御姐音', icon: '👩‍💼' },
  { id: 'presenter_male', name: '主持人男', icon: '🎙️' },
  { id: 'presenter_female', name: '主持人女', icon: '🎙️' },
];

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

// ========== 配置读写 ==========

async function readConfig() {
  return (await window.AgentSpacesUI.readConfigJson(CONFIG_PATH)) || {};
}

async function writeConfig(data) {
  await window.AgentSpacesUI.writeConfigJson(CONFIG_PATH, data);
}

async function mergeConfig(partial) {
  const prev = await readConfig();
  await writeConfig({ ...prev, ...partial });
}

// ========== 样式 ==========

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: '16px',
    padding: '16px',
    boxSizing: 'border-box',
  },
  main: {
    display: 'flex',
    flex: '1',
    gap: '16px',
    minHeight: 0,
  },
  voiceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '8px',
  },
  voiceItem: {
    padding: '8px 6px',
    borderRadius: '8px',
    border: '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: '12px',
    transition: 'all 0.2s',
    position: 'relative',
  },
  deleteBtn: {
    position: 'absolute',
    top: '2px',
    right: '4px',
    fontSize: '13px',
    lineHeight: 1,
    opacity: 0.4,
    cursor: 'pointer',
    fontWeight: '700',
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },
  addVoiceItem: {
    padding: '8px 6px',
    borderRadius: '8px',
    border: '2px dashed var(--border, #444)',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--muted-foreground, #999)',
    transition: 'all 0.2s',
  },
  addForm: {
    marginTop: '8px',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid var(--border, #444)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  audioPlayer: {
    width: '100%',
    height: '40px',
    borderRadius: '8px',
    outline: 'none',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '4px',
    width: '100%',
  },
  sliderValue: {
    fontSize: '13px',
    fontWeight: '600',
    minWidth: '36px',
    textAlign: 'right',
  },
  charCount: {
    fontSize: '11px',
    textAlign: 'right',
    marginTop: '4px',
    opacity: 0.6,
  },
};

// ========== 主组件 ==========

function App() {
  // 默认值，等待异步加载配置后覆盖
  const [text, setText] = useState('');
  const [voices, setVoices] = useState(DEFAULT_VOICES);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICES[0]?.id || '');
  const [emotion, setEmotion] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [vol, setVol] = useState(1.0);
  const [pitch, setPitch] = useState(0);

  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  // 添加音色表单
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newVoiceName, setNewVoiceName] = useState('');

  const audioRef = useRef(null);

  // ========== 启动时异步加载配置 ==========

  useEffect(() => {
    readConfig()
      .then((cfg) => {
        if (cfg.text) setText(cfg.text);
        if (Array.isArray(cfg.voices) && cfg.voices.length > 0) {
          setVoices(cfg.voices);
          if (cfg.voiceId && cfg.voices.some((v) => v.id === cfg.voiceId)) {
            setVoiceId(cfg.voiceId);
          } else {
            setVoiceId(cfg.voices[0]?.id || '');
          }
        } else if (cfg.voiceId) {
          setVoiceId(cfg.voiceId);
        }
        if (cfg.emotion != null) setEmotion(cfg.emotion);
        if (cfg.speed != null) setSpeed(cfg.speed);
        if (cfg.vol != null) setVol(cfg.vol);
        if (cfg.pitch != null) setPitch(cfg.pitch);
      })
      .catch((e) => {
        setError('加载配置失败: ' + (e?.message || e?.toString()));
      })
      .finally(() => setConfigLoaded(true));
  }, []);

  // ========== 提交并保存配置 ==========

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
      // 提交时保存所有参数到配置
      await mergeConfig({ text, voiceId, emotion, speed, vol, pitch });

      const args = {
        text: text.trim(),
        voiceId,
        speed,
        vol,
        pitch,
        audioFormat: 'mp3',
        outputFormat: 'url',
      };
      if (emotion) args.emotion = emotion;

      const result = await window.AgentSpaces.callPluginTool(
        'workflow.minimax',
        'minimax_tts',
        args
      );

      const url = result?.data?.audioUrl
        || result?.data?.url
        || result?.audioUrl
        || result?.url
        || result?.data
        || (typeof result === 'string' ? result : null);

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
  }, [text, voiceId, emotion, speed, vol, pitch]);

  // ========== 音色增删 ==========

  const handleAddVoice = useCallback(async () => {
    const id = newVoiceId.trim();
    const name = newVoiceName.trim();
    if (!id || !name) return;
    if (voices.some((v) => v.id === id)) return;

    const updated = [...voices, { id, name, icon: '🎵' }];
    setVoices(updated);
    try {
      await mergeConfig({ voices: updated });
      setNewVoiceId('');
      setNewVoiceName('');
      setShowAddForm(false);
    } catch (e) {
      // 保存失败，回滚
      setVoices(voices);
      setError('保存音色失败: ' + (e?.message || e?.toString()));
    }
  }, [voices, newVoiceId, newVoiceName]);

  const handleDeleteVoice = useCallback(async (id) => {
    if (voices.length <= 1) return;
    const updated = voices.filter((v) => v.id !== id);
    const prevVoices = voices;
    const prevVoiceId = voiceId;

    setVoices(updated);
    try {
      await mergeConfig({ voices: updated });
      if (voiceId === id) {
        const next = updated[0]?.id || '';
        setVoiceId(next);
        await mergeConfig({ voiceId: next });
      }
    } catch (e) {
      // 保存失败，回滚
      setVoices(prevVoices);
      setVoiceId(prevVoiceId);
      setError('删除音色失败: ' + (e?.message || e?.toString()));
    }
  }, [voices, voiceId]);

  const handleSelectVoice = useCallback((id) => {
    setVoiceId(id);
  }, []);

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
      {/* 标题 */}
      <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'center', padding: '12px 0' }}>
        🎙️ Minimax 配音
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
          <CardHeader style={{ padding: '12px 16px' }}>
            <CardTitle style={{ fontSize: '14px' }}>🎭 角色设置</CardTitle>
          </CardHeader>
          <CardContent style={{ flex: '1', overflowY: 'auto', padding: '0 16px 16px' }}>
            {/* 音色选择网格 */}
            <Label>音色选择</Label>
            <div style={styles.voiceGrid}>
              {voices.map((v) => (
                <div
                  key={v.id}
                  style={{
                    ...styles.voiceItem,
                    ...(voiceId === v.id
                      ? { border: '2px solid var(--primary, #4fc3f7)', background: 'var(--primary, #4fc3f7)20' }
                      : { border: '2px solid transparent', background: 'var(--muted, #2a4a6c)' }),
                  }}
                  onClick={() => handleSelectVoice(v.id)}
                >
                  <span
                    style={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); handleDeleteVoice(v.id); }}
                    title="删除此音色"
                  >
                    ×
                  </span>
                  <div>{v.icon}</div>
                  <div>{v.name}</div>
                </div>
              ))}

              {/* 添加音色按钮 */}
              <div
                style={styles.addVoiceItem}
                onClick={() => setShowAddForm(true)}
              >
                <div style={{ fontSize: '18px' }}>＋</div>
                <div>添加音色</div>
              </div>
            </div>

            {/* 添加音色表单 */}
            {showAddForm && (
              <div style={styles.addForm}>
                <Input
                  placeholder="音色 ID（如 female-shaonv）"
                  value={newVoiceId}
                  onChange={(e) => setNewVoiceId(e.target.value)}
                  style={{ fontSize: '12px' }}
                />
                <Input
                  placeholder="显示名称（如 少女音）"
                  value={newVoiceName}
                  onChange={(e) => setNewVoiceName(e.target.value)}
                  style={{ fontSize: '12px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    size="sm"
                    onClick={handleAddVoice}
                    disabled={!newVoiceId.trim() || !newVoiceName.trim()}
                  >
                    ✓ 确认
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewVoiceId('');
                      setNewVoiceName('');
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}

            <Separator style={{ margin: '12px 0' }} />

            {/* 情绪选择 */}
            <Label>情绪</Label>
            <Select value={emotion || 'default'} onValueChange={(v) => setEmotion(v === 'default' ? '' : v)}>
              <SelectTrigger style={{ marginTop: '6px' }}>
                <SelectValue placeholder="选择情绪" />
              </SelectTrigger>
              <SelectContent>
                {EMOTIONS.map((e) => (
                  <SelectItem key={e.value || 'default'} value={e.value || 'default'}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 语速 */}
            <Label style={{ marginTop: '12px' }}>语速</Label>
            <div style={styles.sliderRow}>
              <Slider
                style={{ flex: '1' }}
                min={0.5}
                max={2.0}
                step={0.1}
                value={[speed]}
                onValueChange={([v]) => setSpeed(v)}
              />
              <span style={styles.sliderValue}>{speed.toFixed(1)}</span>
            </div>

            {/* 音量 */}
            <Label style={{ marginTop: '12px' }}>音量</Label>
            <div style={styles.sliderRow}>
              <Slider
                style={{ flex: '1' }}
                min={0}
                max={10}
                step={0.5}
                value={[vol]}
                onValueChange={([v]) => setVol(v)}
              />
              <span style={styles.sliderValue}>{vol.toFixed(1)}</span>
            </div>

            {/* 语调 */}
            <Label style={{ marginTop: '12px' }}>语调</Label>
            <div style={styles.sliderRow}>
              <Slider
                style={{ flex: '1' }}
                min={-12}
                max={12}
                step={1}
                value={[pitch]}
                onValueChange={([v]) => setPitch(v)}
              />
              <span style={styles.sliderValue}>{pitch}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 底部：控制区 + 播放器 */}
      <Card>
        <CardContent style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={styles.controlsRow}>
            <Button
              onClick={handleGenerate}
              disabled={loading || !text.trim()}
            >
              {loading ? '⏳ 合成中...' : '🎙️ 开始配音'}
            </Button>
            {loading && (
              <Badge variant="secondary">正在生成语音，请稍候...</Badge>
            )}
            {error && (
              <Alert variant="destructive" style={{ flex: '1' }}>
                <AlertDescription>❌ {error}</AlertDescription>
              </Alert>
            )}
          </div>

          {audioUrl && (
            <audio
              ref={audioRef}
              style={styles.audioPlayer}
              controls
              autoPlay
              src={audioUrl}
            >
              您的浏览器不支持音频播放
            </audio>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
