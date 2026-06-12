const { useState, useCallback, useRef } = React;
const { Input, Button, Label } = window.AgentSpacesUI;
import styles from '../utils/styles';
import { PROVIDERS } from '../utils/providers';

/**
 * 根据服务商类型构建试听 TTS 请求参数
 */
function buildPreviewArgs(providerKey, voiceId) {
  const base = { text: '这是一段测试文本' };
  switch (providerKey) {
    case 'minimax':
      return { ...base, voiceId, speed: 1.0, vol: 1.0, pitch: 0, audioFormat: 'mp3', outputFormat: 'url' };
    case 'fishaudio':
      return { ...base, referenceId: voiceId, speed: 1.0, temperature: 0.7, format: 'mp3' };
    case 'qianyin':
      return { ...base, speakerId: voiceId, speed: 1.0, volume: 100, pitch: 0, format: 'mp3' };
    default:
      return base;
  }
}

function VoiceSelector({ voices, voiceId, provider, onSelect, onDelete, onAdd }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newVoiceName, setNewVoiceName] = useState('');
  const [searchText, setSearchText] = useState('');
  const [hoveredId, setHoveredId] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);

  const audioRef = useRef(null);

  const handleAdd = useCallback(async () => {
    await onAdd(newVoiceId, newVoiceName);
    setNewVoiceId('');
    setNewVoiceName('');
    setShowAddForm(false);
  }, [newVoiceId, newVoiceName, onAdd]);

  const handlePreview = useCallback(async (e, v) => {
    e.stopPropagation();
    if (previewingId === v.id) return;

    const prov = PROVIDERS[provider];
    const args = buildPreviewArgs(provider, v.id);

    setPreviewingId(v.id);
    try {
      const result = await window.AgentSpaces.callPluginTool(prov.pluginId, prov.toolName, args);

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
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.play();
      }
    } catch {
      // 试听失败静默处理
    } finally {
      setPreviewingId(null);
    }
  }, [provider, previewingId]);

  const voiceIdPlaceholder =
    provider === 'fishaudio'
      ? '音色模型 ID（referenceId）'
      : provider === 'qianyin'
        ? '发音人 ID（如 521）'
        : '音色 ID（如 female-shaonv）';

  const filteredVoices = voices.filter((v) => {
    if (!searchText.trim()) return true;
    const q = searchText.trim().toLowerCase();
    return v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q);
  });

  return (
    <>
      <Label style={{ marginTop: '12px' }}>音色选择</Label>
      <Input
        placeholder="🔍 搜索音色名称或 ID..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginTop: '8px', fontSize: '13px' }}
      />
      <div style={styles.voiceGridWrapper}>
        <div style={styles.voiceGrid}>
          {filteredVoices.map((v) => (
            <div
              key={v.id}
              style={{
                ...styles.voiceItem,
                ...(voiceId === v.id
                  ? { border: '2px solid var(--primary, #4fc3f7)', background: 'var(--primary, #4fc3f7)20' }
                  : { border: '2px solid transparent', background: 'var(--muted, #2a4a6c)' }),
              }}
              onMouseEnter={() => setHoveredId(v.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(v.id)}
            >
              {/* 试听按钮 - 左上角 */}
              <span
                style={{
                  ...styles.actionBtn,
                  left: '2px',
                  opacity: hoveredId === v.id ? 0.8 : 0,
                  pointerEvents: hoveredId === v.id ? 'auto' : 'none',
                }}
                onClick={(e) => handlePreview(e, v)}
                title="试听此音色"
              >
                {previewingId === v.id ? '⏳' : '▶'}
              </span>

              {/* 删除按钮 - 右上角，仅 hover 时展示 */}
              <span
                style={{
                  ...styles.actionBtn,
                  right: '2px',
                  opacity: hoveredId === v.id ? 0.6 : 0,
                  pointerEvents: hoveredId === v.id ? 'auto' : 'none',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(v.id);
                }}
                title="删除此音色"
              >
                ×
              </span>
              <div>{v.icon}</div>
              <div>{v.name}</div>
            </div>
          ))}

          <div style={styles.addVoiceItem} onClick={() => setShowAddForm(true)}>
            <div style={{ fontSize: '18px' }}>＋</div>
            <div>添加音色</div>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div style={styles.addForm}>
          <Input
            placeholder={voiceIdPlaceholder}
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
              onClick={handleAdd}
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
    </>
  );
}

export default VoiceSelector;
