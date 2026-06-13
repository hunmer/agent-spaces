const { useState, useCallback, useEffect, useRef } = React;
const {
  Card, CardContent, CardHeader,
  Textarea, RadioGroup, RadioGroupItem,
  Badge, Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectContent, SelectItem,
} = window.AgentSpacesUI;

import { PROVIDERS, buildDefaultProviderStates, buildTTSArgs, extractAudioUrl, genId } from './utils/providers';
import { readConfig, persistProviderStates, persistMultiState } from './utils/config';
import styles from './utils/styles';
import VoiceSelector from './components/VoiceSelector';
import ParameterPanel from './components/ParameterPanel';
import BackgroundMusic from './components/BackgroundMusic';
import PlayerBar from './components/PlayerBar';
import MultiVoicePanel from './components/MultiVoicePanel';
import { normalizeLaunchParams, parseUrlLaunchParams } from './schems';

function App() {
  // 配音模式：单人 / 多人（仅切换左侧；右侧角色设置卡固定不变）
  const [mode, setMode] = useState('single');

  const [text, setText] = useState('');
  const [provider, setProvider] = useState('minimax');
  const [providerStates, setProviderStates] = useState(buildDefaultProviderStates);

  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  // 多人配音：角色列表 / 消息列表
  const [roles, setRoles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matchRules, setMatchRules] = useState([]);

  // 背景音乐（单人模式，会话级，仅本地混音播放）
  const bgmAudioRef = useRef(null);
  const [bgmUrl, setBgmUrl] = useState('');
  const [bgmVolume, setBgmVolume] = useState(30);
  const consumedLaunchRef = useRef(new Set());

  const current = providerStates[provider];
  const voices = current.voices;
  const voiceId = current.voiceId;
  const isMulti = mode === 'multi';

  const applyLaunchPayload = useCallback((payload, sourceKey) => {
    const launch = normalizeLaunchParams(payload);
    if (!launch || !sourceKey) return false;
    if (consumedLaunchRef.current.has(sourceKey)) return false;
    consumedLaunchRef.current.add(sourceKey);

    const nextProvider = PROVIDERS[launch.provider] ? launch.provider : 'minimax';
    setProvider(nextProvider);
    setError('');
    setAudioUrl('');

    if (launch.mode === 'multi') {
      const lines = launch.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) return false;

      setMode('multi');
      setText('');
      setMessages(lines.map((line) => ({
        id: genId('msg'),
        roleId: '',
        text: line,
        matchPrefix: '',
        audioUrl: '',
        status: 'idle',
        error: '',
      })));
    } else {
      setMode('single');
      setRoles([]);
      setMessages([]);
      setText(launch.text);
    }
    return true;
  }, []);

  // ========== 启动时加载配置 ==========

  useEffect(() => {
    readConfig()
      .then((cfg) => {
        if (cfg.mode === 'multi' || cfg.mode === 'single') setMode(cfg.mode);
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

        // 恢复多人配音状态
        if (Array.isArray(cfg.roles)) {
          setRoles(cfg.roles.filter((r) => r && r.id && r.provider && r.voiceId));
        }
        if (Array.isArray(cfg.messages)) {
          setMessages(
            cfg.messages
              .filter((m) => m && m.id)
              .map((m) => ({
                id: m.id,
                roleId: m.roleId || '',
                text: m.text || '',
                matchPrefix: m.matchPrefix || '',
                audioUrl: m.audioUrl || '',
                status: m.audioUrl ? 'done' : 'idle',
                error: '',
              }))
          );
        }
      })
      .catch((e) => {
        setError('加载配置失败: ' + (e?.message || e?.toString()));
      })
      .finally(() => setConfigLoaded(true));
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    const launch = parseUrlLaunchParams(window.location.search);
    if (launch) applyLaunchPayload(launch, `url:${window.location.search}`);
  }, [configLoaded, applyLaunchPayload]);

  useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS?.onTaskEvent) return undefined;
    const unsubscribe = AS.onTaskEvent((event, data) => {
      if (event !== 'miniApp.ttsLaunch') return;
      applyLaunchPayload(data, `event:${JSON.stringify(data)}`);
    });
    return () => {
      try { unsubscribe(); } catch {}
    };
  }, [applyLaunchPayload]);

  // ========== 多人状态持久化 ==========
  useEffect(() => {
    if (!configLoaded) return;
    persistMultiState(mode, roles, messages).catch(() => {});
  }, [mode, roles, messages, configLoaded]);

  // ========== 单人模式 TTS 生成 ==========

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
      const args = buildTTSArgs(provider, s.voiceId, s, text);

      await persistProviderStates(providerStates, text, provider);

      const result = await window.AgentSpaces.callPluginTool(prov.pluginId, prov.toolName, args);
      const url = extractAudioUrl(result);
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

  // ========== 音色增删（右侧固定卡） ==========

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

  // ========== 多人模式：角色增删 ==========

  const handleAddRole = useCallback((voice) => {
    setRoles((prev) => {
      const key = `${provider}:${voice.id}`;
      if (prev.some((r) => `${r.provider}:${r.voiceId}` === key)) return prev;
      return [
        ...prev,
        { id: genId('role'), name: voice.name, icon: voice.icon || '🎭', provider, voiceId: voice.id },
      ];
    });
  }, [provider]);

  const handleRemoveRole = useCallback((roleId) => {
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    // 同步清空消息列表里使用该角色的选择，并失效其已合成音频
    setMessages((prev) =>
      prev.map((m) =>
        m.roleId === roleId ? { ...m, roleId: '', audioUrl: '', status: 'idle', error: '' } : m
      )
    );
  }, []);

  const openMatchDialog = useCallback(() => {
    setMatchRules((prev) => (
      prev.length
        ? prev
        : [{ id: genId('rule'), prefix: '', roleId: roles[0]?.id || '' }]
    ));
    setMatchDialogOpen(true);
  }, [roles]);

  const updateMatchRule = useCallback((id, patch) => {
    setMatchRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  }, []);

  const addMatchRule = useCallback(() => {
    setMatchRules((prev) => [...prev, { id: genId('rule'), prefix: '', roleId: roles[0]?.id || '' }]);
  }, [roles]);

  const removeMatchRule = useCallback((id) => {
    setMatchRules((prev) => prev.filter((rule) => rule.id !== id));
  }, []);

  const countRuleMatches = useCallback((prefix) => {
    const p = String(prefix || '').trim();
    if (!p) return 0;
    return messages.filter((msg) => String(msg.text || '').trimStart().startsWith(p)).length;
  }, [messages]);

  const applyMatchRules = useCallback(() => {
    const usableRules = matchRules
      .map((rule) => ({
        prefix: String(rule.prefix || '').trim(),
        roleId: rule.roleId,
      }))
      .filter((rule) => rule.prefix && roles.some((role) => role.id === rule.roleId));

    setMessages((prev) => prev.map((msg) => {
      const textValue = String(msg.text || '').trimStart();
      const matched = usableRules.find((rule) => textValue.startsWith(rule.prefix));
      return {
        ...msg,
        roleId: matched?.roleId || '',
        matchPrefix: matched?.prefix || '',
        audioUrl: '',
        status: 'idle',
        error: '',
      };
    }));
    setMatchDialogOpen(false);
  }, [matchRules, roles]);

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
      <style>{`
        .voice-grid { grid-template-columns: repeat(2, 1fr); }
        @media (min-width: 560px)  { .voice-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 760px)  { .voice-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 960px)  { .voice-grid { grid-template-columns: repeat(5, 1fr); } }
        @media (min-width: 1200px) { .voice-grid { grid-template-columns: repeat(6, 1fr); } }
      `}</style>
      <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'center', padding: '4px 0' }}>
        {PROVIDERS[provider].icon} {PROVIDERS[provider].name} 配音
      </div>

      <div style={styles.main}>
        {/* ===== 左侧：Tabs 切换单人 / 多人 ===== */}
        <Card style={{ flex: '1', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <CardHeader style={{ padding: '6px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ ...styles.tabBar, flex: '1' }}>
                <button
                  style={{ ...styles.tabBtn, ...(mode === 'single' ? styles.tabBtnActive : {}) }}
                  onClick={() => setMode('single')}
                >
                  🎙️ 单人配音
                </button>
                <button
                  style={{ ...styles.tabBtn, ...(mode === 'multi' ? styles.tabBtnActive : {}) }}
                  onClick={() => setMode('multi')}
                >
                  👥 多人配音
                </button>
              </div>
              {mode === 'multi' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openMatchDialog}
                  disabled={!messages.length || !roles.length}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  智能匹配
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent style={{ flex: '1', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px 16px' }}>
            {mode === 'single' ? (
              <>
                <Textarea
                  style={{ flex: '1', minHeight: '160px', resize: 'vertical' }}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="在此输入需要配音的文本内容..."
                  maxLength={10000}
                />
                <div style={styles.charCount}>{text.length} / 10000</div>
                <PlayerBar
                  loading={loading}
                  error={error}
                  audioUrl={audioUrl}
                  onGenerate={handleGenerate}
                  bgmAudioRef={bgmAudioRef}
                  bgmUrl={bgmUrl}
                />
              </>
            ) : (
              <MultiVoicePanel
                providerStates={providerStates}
                roles={roles}
                onRemoveRole={handleRemoveRole}
                messages={messages}
                onMessagesChange={(updater) =>
                  setMessages((prev) => (typeof updater === 'function' ? updater(prev) : updater))
                }
              />
            )}
          </CardContent>
        </Card>

        {/* ===== 右侧：角色设置（固定不变，不随 Tab 切换） ===== */}
        <Card style={{ flex: '1', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <CardHeader style={{ padding: '12px 16px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RadioGroup
              value={provider}
              onValueChange={handleProviderChange}
              style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
            >
              {Object.entries(PROVIDERS).map(([key, prov]) => {
                const selected = provider === key;
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border, #444)',
                      ...(selected
                        ? { borderColor: 'var(--primary, #4fc3f7)', background: 'var(--primary, #4fc3f7)15' }
                        : {}),
                    }}
                  >
                    <RadioGroupItem value={key} style={{ width: '13px', height: '13px' }} />
                    <span>{prov.icon} {prov.name}</span>
                  </label>
                );
              })}
            </RadioGroup>
          </CardHeader>
          <CardContent style={{ flex: '1', overflowY: 'auto', padding: '0 16px 16px' }}>
            <VoiceSelector
              mode={mode}
              voices={voices}
              voiceId={voiceId}
              provider={provider}
              onSelect={handleSelectVoice}
              onDelete={handleDeleteVoice}
              onAdd={handleAddVoice}
              onAddRole={isMulti ? handleAddRole : undefined}
              addedRoleKeys={isMulti ? roles.map((r) => `${r.provider}:${r.voiceId}`) : undefined}
            />
            <ParameterPanel provider={provider} current={current} onUpdate={handleParamUpdate} />
            <BackgroundMusic
              audioRef={bgmAudioRef}
              url={bgmUrl}
              onUrlChange={setBgmUrl}
              volume={bgmVolume}
              onVolumeChange={setBgmVolume}
            />
          </CardContent>
        </Card>
      </div>
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent style={{ maxWidth: '620px' }}>
          <DialogHeader>
            <DialogTitle>智能匹配</DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {matchRules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 180px 72px 32px',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <Input
                  value={rule.prefix}
                  onChange={(e) => updateMatchRule(rule.id, { prefix: e.target.value })}
                  placeholder="前缀，如：哲学家："
                />
                <Select value={rule.roleId} onValueChange={(value) => updateMatchRule(rule.id, { roleId: value })}>
                  <SelectTrigger>
                    <span>
                      {roles.find((role) => role.id === rule.roleId)?.name || '选择角色'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.icon} {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="secondary">{countRuleMatches(rule.prefix)} 条</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMatchRule(rule.id)}
                  disabled={matchRules.length <= 1}
                  title="删除规则"
                >
                  ×
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={addMatchRule} style={{ alignSelf: 'flex-start' }}>
              添加规则
            </Button>
            {!roles.length && <div style={styles.emptyHint}>请先从右侧音色库添加角色</div>}
            {!!roles.length && !messages.length && <div style={styles.emptyHint}>请先添加消息</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMatchDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={applyMatchRules}
              disabled={!matchRules.some((rule) => String(rule.prefix || '').trim() && rule.roleId)}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
