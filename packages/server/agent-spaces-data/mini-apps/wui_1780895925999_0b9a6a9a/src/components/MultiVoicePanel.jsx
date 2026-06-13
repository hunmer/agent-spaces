const { useState, useCallback, useRef } = React;
const {
  Button, Badge, Textarea, Alert, AlertDescription,
  Select, SelectTrigger, SelectContent, SelectItem, Separator,
} = window.AgentSpacesUI;
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from '../utils/styles';
import { PROVIDERS, buildTTSArgs, extractAudioUrl, genId } from '../utils/providers';

const SYNTH_CONCURRENCY = 3;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// 并发池：最多 concurrency 个 worker 同时消费队列
async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const n = Math.max(1, Math.min(concurrency, items.length));
  const runners = Array.from({ length: n }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(runners);
}

function triggerAnchor(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadOne(url, filename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('bad status');
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    triggerAnchor(objUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
  } catch {
    // 跨域 fetch 失败时回退为直接下载
    triggerAnchor(url, filename);
  }
}

// 单条消息（可拖拽）。拖拽手柄 ⠿，避免与 textarea / select 冲突
function SortableMessage({ msg, index, roles, onText, onRole, onAddAfter, onRemove, onPreview, onSynth, previewingId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: msg.id });
  const role = roles.find((r) => r.id === msg.roleId);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.msgItem,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...(isDragging ? { boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 10 } : {}),
      }}
    >
      <div style={styles.msgTopRow}>
        {/* 拖拽手柄 */}
        <button
          {...attributes}
          {...listeners}
          style={{ ...styles.iconBtn, cursor: 'grab', touchAction: 'none' }}
          title="拖拽排序"
        >
          ⠿
        </button>
        <span style={styles.msgIndex}>#{index + 1}</span>

        <Select value={msg.roleId} onValueChange={(v) => onRole(msg.id, v)}>
          <SelectTrigger style={{ flex: '1', minWidth: '140px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {role ? `${role.icon} ${role.name}` : <span style={{ opacity: 0.5 }}>选择配音人</span>}
            </span>
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.icon} {r.name} · {PROVIDERS[r.provider]?.name || r.provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div style={styles.msgActions}>
          <button style={styles.iconBtn} onClick={() => onPreview(msg)} disabled={!role || previewingId === msg.id} title="试听配音人">
            {previewingId === msg.id ? '⏳' : '▶'}
          </button>
          <button style={styles.iconBtn} onClick={() => onSynth(msg)} disabled={msg.status === 'pending'} title={msg.audioUrl ? '重新合成' : '合成本条'}>
            {msg.status === 'pending' ? '⏳' : msg.audioUrl ? '🔄' : '🎬'}
          </button>
          <button style={styles.iconBtn} onClick={() => onAddAfter(msg.prevId)} title="在上方插入">↑</button>
          <button style={styles.iconBtn} onClick={() => onAddAfter(msg.id)} title="在下方插入">↓</button>
          <button style={{ ...styles.iconBtn, color: '#f87171' }} onClick={() => onRemove(msg.id)} title="删除本条">🗑</button>
        </div>
      </div>

      <Textarea
        style={{ minHeight: '52px', resize: 'vertical', fontSize: '13px' }}
        value={msg.text}
        onChange={(e) => onText(msg.id, e.target.value)}
        placeholder="输入该角色的配音文本..."
        maxLength={10000}
      />

      {msg.audioUrl && msg.status === 'done' && (
        <audio style={styles.audioPlayer} controls src={msg.audioUrl}>您的浏览器不支持音频播放</audio>
      )}
      {msg.status === 'error' && msg.error && (
        <div style={{ fontSize: '12px', color: '#f87171' }}>❌ {msg.error}</div>
      )}
    </div>
  );
}

// 多人配音编辑区（左侧）：角色列表 + 可拖拽消息列表 + 工具栏
function MultiVoicePanel({ providerStates, roles, onRemoveRole, messages, onMessagesChange }) {
  const [batchLoading, setBatchLoading] = useState(false);
  const [previewingId, setPreviewingId] = useState(null);
  const [batchError, setBatchError] = useState('');
  const previewAudioRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ===== 消息增删改 =====
  const patchMessage = useCallback((id, patch) => {
    onMessagesChange((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, [onMessagesChange]);

  const updateMessageText = useCallback((id, text) => {
    onMessagesChange((prev) =>
      prev.map((m) =>
        m.id === id
          ? m.text === text ? m : { ...m, text, audioUrl: '', status: 'idle', error: '' }
          : m
      )
    );
  }, [onMessagesChange]);

  const updateMessageRole = useCallback((id, roleId) => {
    onMessagesChange((prev) =>
      prev.map((m) => (m.id === id ? { ...m, roleId, audioUrl: '', status: 'idle', error: '' } : m))
    );
  }, [onMessagesChange]);

  const addMessageAfter = useCallback((id) => {
    onMessagesChange((prev) => {
      const newMsg = { id: genId('msg'), roleId: roles[0]?.id || '', text: '', audioUrl: '', status: 'idle', error: '' };
      if (!id) return [...prev, newMsg];
      const idx = prev.findIndex((m) => m.id === id);
      if (idx < 0) return [...prev, newMsg];
      const next = [...prev];
      next.splice(idx + 1, 0, newMsg);
      return next;
    });
  }, [onMessagesChange, roles]);

  const removeMessage = useCallback((id) => {
    onMessagesChange((prev) => prev.filter((m) => m.id !== id));
  }, [onMessagesChange]);

  // ===== 拖拽排序 =====
  const handleDragEnd = useCallback((e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onMessagesChange((prev) => {
      const oldIndex = prev.findIndex((m) => m.id === active.id);
      const newIndex = prev.findIndex((m) => m.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, [onMessagesChange]);

  // ===== 合成 =====
  const synthOne = useCallback(async (msg) => {
    const role = roles.find((r) => r.id === msg.roleId);
    if (!role || !msg.text.trim()) {
      patchMessage(msg.id, { status: 'error', error: !role ? '请选择配音人' : '请输入文本' });
      return;
    }
    patchMessage(msg.id, { status: 'pending', error: '' });
    try {
      const prov = PROVIDERS[role.provider];
      const settings = providerStates[role.provider] || {};
      const args = buildTTSArgs(role.provider, role.voiceId, settings, msg.text);
      const result = await window.AgentSpaces.callPluginTool(prov.pluginId, prov.toolName, args);
      const url = extractAudioUrl(result);
      if (!url) throw new Error('未获取到音频地址');
      patchMessage(msg.id, { status: 'done', audioUrl: url, error: '' });
    } catch (e) {
      patchMessage(msg.id, { status: 'error', error: e?.message || e?.toString() || '合成失败' });
    }
  }, [roles, providerStates, patchMessage]);

  const handleGenerateAll = useCallback(async () => {
    const pending = messages.filter((m) => m.roleId && m.text.trim() && m.status !== 'done');
    if (!pending.length) {
      setBatchError('没有待合成的消息（需选择配音人并填写文本）');
      return;
    }
    setBatchError('');
    setBatchLoading(true);
    try {
      await runPool(pending, synthOne, SYNTH_CONCURRENCY);
    } finally {
      setBatchLoading(false);
    }
  }, [messages, synthOne]);

  const handlePreview = useCallback(async (msg) => {
    const role = roles.find((r) => r.id === msg.roleId);
    if (!role) return;
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setPreviewingId(msg.id);
    try {
      const prov = PROVIDERS[role.provider];
      const args = buildTTSArgs(role.provider, role.voiceId, {}, '这是一段测试文本');
      const result = await window.AgentSpaces.callPluginTool(prov.pluginId, prov.toolName, args);
      const url = extractAudioUrl(result);
      if (url) {
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.play();
      }
    } catch {
      // 静默
    } finally {
      setPreviewingId(null);
    }
  }, [roles]);

  // ===== 批量下载（文件名用序号）=====
  const handleDownloadAll = useCallback(async () => {
    const done = messages.filter((m) => m.status === 'done' && m.audioUrl);
    if (!done.length) {
      setBatchError('没有已合成的音频可下载');
      return;
    }
    setBatchError('');
    for (let i = 0; i < done.length; i++) {
      const filename = `${String(i + 1).padStart(2, '0')}.mp3`;
      await downloadOne(done[i].audioUrl, filename);
      await delay(500);
    }
  }, [messages]);

  const doneCount = messages.filter((m) => m.status === 'done').length;
  const pendingCount = messages.filter((m) => m.roleId && m.text.trim() && m.status !== 'done').length;

  return (
    <div style={{ flex: '1', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 角色列表 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', opacity: 0.8 }}>👥 角色</span>
        <Badge variant="secondary">{roles.length}</Badge>
        {roles.length > 0 ? (
          <div style={styles.roleList}>
            {roles.map((r) => (
              <span key={r.id} style={styles.roleItem} title={`${PROVIDERS[r.provider]?.name || r.provider} · ${r.voiceId}`}>
                <span>{r.icon} {r.name}</span>
                <span style={styles.roleRemove} onClick={() => onRemoveRole(r.id)} title="移除角色">×</span>
              </span>
            ))}
          </div>
        ) : (
          <span style={styles.emptyHint}>从右侧音色库点击右下角 ＋ 添加角色</span>
        )}
      </div>

      <Separator style={{ margin: '10px 0' }} />

      {/* 可拖拽消息列表 */}
      <div style={{ flex: '1', overflowY: 'auto', paddingRight: '4px', minHeight: 0 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={messages.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div style={styles.msgList}>
              {messages.length === 0 && (
                <div style={styles.emptyHint}>暂无消息，点击下方「＋ 添加消息」开始</div>
              )}
              {messages.map((m, i) => (
                <SortableMessage
                  key={m.id}
                  msg={{ ...m, prevId: messages[i - 1]?.id }}
                  index={i}
                  roles={roles}
                  onText={updateMessageText}
                  onRole={updateMessageRole}
                  onAddAfter={addMessageAfter}
                  onRemove={removeMessage}
                  onPreview={handlePreview}
                  onSynth={synthOne}
                  previewingId={previewingId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* 工具栏 */}
      <Separator style={{ margin: '10px 0' }} />
      <div style={styles.toolbarRow}>
        <Button variant="outline" size="sm" onClick={() => addMessageAfter()}>＋ 添加消息</Button>
        <Button onClick={handleGenerateAll} disabled={batchLoading || pendingCount === 0}>
          {batchLoading ? '⏳ 批量合成中...' : `🎙️ 一键合成${pendingCount ? ` (${pendingCount})` : ''}`}
        </Button>
        <Button variant="secondary" onClick={handleDownloadAll} disabled={doneCount === 0 || batchLoading} title="下载所有已合成音频">
          ⬇️ 批量下载{doneCount ? ` (${doneCount})` : ''}
        </Button>
        {batchLoading && <Badge variant="secondary">并发上限 {SYNTH_CONCURRENCY}</Badge>}
      </div>

      {batchError && (
        <Alert variant="destructive" style={{ marginTop: '8px' }}>
          <AlertDescription>❌ {batchError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default MultiVoicePanel;
