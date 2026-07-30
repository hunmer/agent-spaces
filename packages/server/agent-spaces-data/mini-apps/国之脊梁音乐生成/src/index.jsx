const {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FileUpload,
  Badge,
  Loader2,
  Check,
  X,
  Music,
  Upload,
  WandSparkles,
  Trash2,
  History,
  Workflow,
  Download,
  Play,
  Pause,
} = window.AgentSpacesUI;

// 目标工作流（国之脊梁音乐生成）
const DEFAULT_WORKFLOW_ID = 'c7e6ae77-f694-48b6-8d98-4040c2393b11';
const DEFAULT_WORKFLOW_NAME = '国之脊梁音乐生成';

// 硬编码参考音频列表
const PRESET_AUDIOS = [
  {
    title: '参考风格1',
    audioUrl: 'https://drive-1252358454.cos.ap-guangzhou.myqcloud.com/test.wav',
    gender: 'f',
    style: '激昂，振奋',
  },
];

const DRAFT_KEY = 'gjMusicDraft';
const HISTORY_PATH = 'generation-history.json';
const CONFIG_PATH = 'shared-config.json';

const defaultForm = {
  mode: 'preset', // preset | upload
  presetIndex: 0,
  lyric: '',
  gender: 'f',
  style: '激昂，振奋',
  references: [],
};

function Style() {
  return (
    <style>{`
      .mg-app { height: 100vh; display: flex; flex-direction: column; background: #f7f7f4; color: #18181b; }
      .mg-workflow-btn { max-width: 360px; justify-content: flex-start; }
      .mg-workflow-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mg-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 400px minmax(0, 1fr); }
      .mg-left { min-height: 0; overflow: auto; border-right: 1px solid #e4e4e7; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #fbfbfa; }
      .mg-right { min-height: 0; overflow: auto; padding: 16px; }
      .mg-panel { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; }
      .mg-panel-title { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 14px; }
      .mg-field { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
      .mg-textarea { min-height: 150px; resize: vertical; }
      .mg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .mg-actions { margin-top: 16px; }
      .mg-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .mg-spin { animation: mg-spin 1s linear infinite; }
      @keyframes mg-spin { to { transform: rotate(360deg); } }
      .mg-error, .mg-status { margin-top: 12px; display: flex; align-items: center; gap: 8px; border-radius: 6px; padding: 9px 10px; font-size: 13px; }
      .mg-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
      .mg-status { background: #ecfdf5; color: #065f46; border: 1px solid #bbf7d0; }
      .mg-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 14px; background: #f4f4f5; border-radius: 7px; padding: 3px; }
      .mg-tab { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px; border-radius: 5px; font-size: 13px; cursor: pointer; border: 0; background: transparent; color: #71717a; }
      .mg-tab.is-active { background: #ffffff; color: #18181b; box-shadow: 0 1px 2px rgba(0,0,0,.06); font-weight: 600; }
      .mg-preset-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
      .mg-preset-item { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e4e4e7; border-radius: 7px; cursor: pointer; background: #ffffff; text-align: left; width: 100%; }
      .mg-preset-item.is-active { border-color: #111827; background: #fafafa; box-shadow: 0 0 0 1px #111827 inset; }
      .mg-preview-btn { width: 36px; height: 36px; border-radius: 50%; border: 0; background: linear-gradient(135deg, #fb7185, #f59e0b); color: #fff; display: grid; place-items: center; cursor: pointer; flex: 0 0 auto; transition: transform .15s, background .2s; }
      .mg-preview-btn:hover { transform: scale(1.06); }
      .mg-preview-btn .mg-icon { transform: translateX(1px); }
      .mg-preview-btn.is-playing { background: linear-gradient(135deg, #22c55e, #10b981); animation: mg-pulse 1.2s ease-in-out infinite; }
      .mg-preview-btn.is-playing .mg-icon { transform: none; }
      @keyframes mg-pulse { 0%,100%{ box-shadow: 0 0 0 0 rgba(34,197,94,.45);} 50%{ box-shadow: 0 0 0 7px rgba(34,197,94,0);} }
      .mg-preset-meta { min-width: 0; flex: 1; }
      .mg-preset-title { font-weight: 600; font-size: 13px; }
      .mg-preset-sub { color: #71717a; font-size: 12px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mg-history-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .mg-history-actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .mg-list { display: flex; flex-direction: column; gap: 12px; }
      .mg-card { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; }
      .mg-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .mg-card-title { font-weight: 650; font-size: 14px; display: flex; align-items: center; gap: 8px; min-width: 0; }
      .mg-card-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mg-card-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: #71717a; font-size: 12px; margin-top: 6px; }
      .mg-card-audio { width: 100%; margin-top: 10px; height: 36px; }
      .mg-card-actions { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
      .mg-empty { height: calc(100vh - 140px); border: 1px dashed #d4d4d8; border-radius: 8px; display: grid; place-items: center; color: #71717a; background: #ffffff; }
      .mg-workflow-list { max-height: 420px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
      .mg-workflow-list button { text-align: left; border: 1px solid #e4e4e7; background: #ffffff; border-radius: 7px; padding: 10px; cursor: pointer; }
      .mg-workflow-list button:hover { background: #f4f4f5; }
      .mg-workflow-list strong, .mg-workflow-list span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mg-workflow-list span { color: #71717a; font-size: 12px; margin-top: 4px; }
      .mg-floating-status { position: fixed; right: 18px; bottom: 18px; z-index: 80; background: #18181b; color: #ffffff; border-radius: 7px; padding: 8px 12px; font-size: 13px; }
      @media (max-width: 900px) {
        .mg-main { grid-template-columns: 1fr; }
        .mg-left { border-right: 0; border-bottom: 1px solid #e4e4e7; max-height: none; }
        .mg-workflow-btn { max-width: 100%; width: 100%; }
      }
    `}</style>
  );
}

function App() {
  const AS = window.AgentSpaces;
  const [form, setForm] = React.useState(() => ({
    ...defaultForm,
    ...(AS.getUserSetting?.(DRAFT_KEY, {}) || {}),
  }));
  const [history, setHistory] = React.useState([]);
  const [sharedConfig, setSharedConfig] = React.useState({ workflowId: DEFAULT_WORKFLOW_ID, workflowName: DEFAULT_WORKFLOW_NAME });
  const [running, setRunning] = React.useState(false);
  const [uploadingReference, setUploadingReference] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    AS.saveUserSettings?.({ [DRAFT_KEY]: { ...form, references: persistableReferences(form.references) } });
  }, [form]);

  React.useEffect(() => {
    const initialHistory = AS.getConfig?.(HISTORY_PATH);
    if (Array.isArray(initialHistory)) setHistory(initialHistory);
    const initialConfig = AS.getConfig?.(CONFIG_PATH);
    if (initialConfig && typeof initialConfig === 'object') {
      setSharedConfig({ workflowId: DEFAULT_WORKFLOW_ID, workflowName: DEFAULT_WORKFLOW_NAME, ...initialConfig });
    }
    const off = AS.onConfigChanged?.((path, value) => {
      if (path === HISTORY_PATH) setHistory(Array.isArray(value) ? value : []);
      if (path === CONFIG_PATH && value && typeof value === 'object') {
        setSharedConfig({ workflowId: DEFAULT_WORKFLOW_ID, workflowName: DEFAULT_WORKFLOW_NAME, ...value });
      }
    });
    return () => off?.();
  }, []);

  const audioRef = React.useRef(null);
  const [previewingUrl, setPreviewingUrl] = React.useState('');

  // 预览试听：复用单个 Audio 实例，切换曲目自动停旧的，保证全局只有一个预览在播
  const togglePreview = (url) => {
    if (!url) return;
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.addEventListener('ended', () => setPreviewingUrl(''));
      audioRef.current = audio;
    }
    if (previewingUrl === url && !audio.paused) {
      audio.pause();
      setPreviewingUrl('');
      return;
    }
    audio.pause();
    audio.src = url;
    audio.play().catch(() => {});
    setPreviewingUrl(url);
  };

  React.useEffect(() => () => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ''; }
  }, []);

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const selectPreset = (index) => {
    const preset = PRESET_AUDIOS[index];
    if (!preset) return;
    updateForm({ mode: 'preset', presetIndex: index, gender: preset.gender, style: preset.style });
  };

  const openWorkflowDialog = async () => {
    try {
      const workflow = await AS.openWorkflowListDialog();
      if (workflow) await selectWorkflow(workflow);
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const selectWorkflow = async (workflow) => {
    const next = {
      workflowId: workflow.workflow_id || workflow.id,
      workflowName: workflow.title || workflow.name || '未命名工作流',
    };
    setSharedConfig(next);
    await AS.invokeService('save_shared_config', next);
  };

  const generate = async () => {
    const lyric = String(form.lyric || '').trim();
    const gender = String(form.gender || 'f').trim();
    const style = String(form.style || '').trim();

    if (!lyric) {
      setError('请输入歌词/文案');
      return;
    }

    // 解析参考音频 url
    let audioUrl = '';
    try {
      if (form.mode === 'upload') {
        const refs = Array.isArray(form.references) ? form.references : [];
        if (!refs.length) {
          setError('请上传一段参考音频');
          return;
        }
        const resolved = await resolveUploadItem(refs[0]);
        audioUrl = resolved.url;
      } else {
        const preset = PRESET_AUDIOS[form.presetIndex] || PRESET_AUDIOS[0];
        audioUrl = preset?.audioUrl || '';
      }
    } catch (err) {
      setError(err?.message || '参考音频解析失败');
      return;
    }
    if (!audioUrl) {
      setError('未能获取参考音频地址');
      return;
    }

    setRunning(true);
    setError('');
    setStatus('正在调用工作流...');
    try {
      const workflowId = sharedConfig.workflowId || DEFAULT_WORKFLOW_ID;
      const taskId = `gj-music-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const result = await AS.callPluginTool(
        '@agent-spaces/builtin',
        'execute_workflow_sync',
        {
          workflow_id: workflowId,
          input: {
            audio_url: audioUrl,
            lyric,
            is_custom_audio: false,
            style,
            gender,
          },
          max_wait_ms: 600000,
        },
        {
          taskId,
          meta: { workflowId, gender, style, label: '国之脊梁音乐生成' },
        },
      );

      const payload = unwrapWorkflowPayload(result);
      if (payload?.status && payload.status !== 'completed' && payload.status !== 'success') {
        throw new Error(payload.timedOut ? '工作流仍在运行，请稍后在历史列表查看' : `工作流状态：${payload.status}`);
      }
      const audios = extractAudios(payload);
      if (!audios.length) throw new Error('工作流没有返回音频结果');

      await AS.invokeService('add_results', {
        items: audios,
        lyric,
        style,
        gender,
        sourceTitle: form.mode === 'preset' ? (PRESET_AUDIOS[form.presetIndex]?.title || '') : '自上传参考',
        workflowId,
        workflowName: sharedConfig.workflowName,
      });
      setStatus(`已生成 ${audios.length} 首音乐`);
      // 完成通知：桌面通知（权限被拒时静默）+ 服务端通知中心
      try {
        await AS.sendNotifiction?.('国之脊梁音乐生成', `已生成 ${audios.length} 首音乐，已加入列表`);
      } catch { /* noop */ }
      try {
        await AS.sendNotification?.('success', '国之脊梁音乐生成完成', `已生成 ${audios.length} 首音乐`, { count: audios.length });
      } catch { /* noop */ }
    } catch (err) {
      const msg = err?.message || String(err || '生成失败');
      setError(msg);
      setStatus('');
      try {
        await AS.sendNotifiction?.('国之脊梁音乐生成失败', msg);
      } catch { /* noop */ }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mg-app">
      <Style />
      <main className="mg-main">
        <section className="mg-left">
          <div className="mg-panel">
            <div className="mg-panel-title">
              <Music className="mg-icon" />
              <span>国之脊梁 · 音乐生成</span>
            </div>

            <div className="mg-tabs" role="tablist">
              <button
                type="button"
                className={`mg-tab${form.mode === 'preset' ? ' is-active' : ''}`}
                onClick={() => updateForm({ mode: 'preset' })}
              >
                <Music className="mg-icon" />预设参考
              </button>
              <button
                type="button"
                className={`mg-tab${form.mode === 'upload' ? ' is-active' : ''}`}
                onClick={() => updateForm({ mode: 'upload' })}
              >
                <Upload className="mg-icon" />上传参考
              </button>
            </div>

            {form.mode === 'preset' ? (
              <div className="mg-preset-list">
                {PRESET_AUDIOS.map((preset, index) => {
                  const isPlaying = previewingUrl === preset.audioUrl;
                  return (
                    <div
                      key={preset.audioUrl}
                      role="button"
                      tabIndex={0}
                      className={`mg-preset-item${form.presetIndex === index ? ' is-active' : ''}`}
                      onClick={() => selectPreset(index)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPreset(index); } }}
                    >
                      <button
                        type="button"
                        className={`mg-preview-btn${isPlaying ? ' is-playing' : ''}`}
                        onClick={(e) => { e.stopPropagation(); togglePreview(preset.audioUrl); }}
                        title={isPlaying ? '暂停预览' : '试听'}
                      >
                        {isPlaying ? <Pause className="mg-icon" /> : <Play className="mg-icon" />}
                      </button>
                      <div className="mg-preset-meta">
                        <div className="mg-preset-title">{preset.title}</div>
                        <div className="mg-preset-sub">{genderLabel(preset.gender)} · {preset.style}</div>
                      </div>
                      {form.presetIndex === index && <Check className="mg-icon" />}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mg-field">
                <Label>参考音频（wav / mp3 等）</Label>
                <FileUpload
                  value={form.references}
                  onChange={(files) => {
                    updateForm({ references: files || [] });
                  }}
                  onUploadStatusChange={(uploadStatus) => setUploadingReference(!!uploadStatus?.uploading)}
                  accept="audio/*"
                  autoUpload
                />
              </div>
            )}

            <div className="mg-field">
              <Label>歌词 / 文案</Label>
              <Textarea
                value={form.lyric}
                onChange={(event) => updateForm({ lyric: event.target.value })}
                placeholder="输入要演唱的歌词或致敬文案..."
                className="mg-textarea"
              />
            </div>

            <div className="mg-grid">
              <div className="mg-field" style={{ marginTop: 0 }}>
                <Label>性别</Label>
                <Select value={form.gender} onValueChange={(value) => updateForm({ gender: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="f">女声</SelectItem>
                    <SelectItem value="m">男声</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mg-field" style={{ marginTop: 0 }}>
                <Label>歌曲风格</Label>
                <Input
                  value={form.style}
                  onChange={(event) => updateForm({ style: event.target.value })}
                  placeholder="如：激昂，振奋"
                />
              </div>
            </div>

            {error && <div className="mg-error"><X className="mg-icon" />{error}</div>}
            {status && <div className="mg-status"><Check className="mg-icon" />{status}</div>}

            <div className="mg-actions">
              <Button onClick={generate} disabled={running || uploadingReference} className="w-full">
                {running || uploadingReference ? <Loader2 className="mg-icon mg-spin" /> : <WandSparkles className="mg-icon" />}
                {running ? '生成中' : uploadingReference ? '上传中' : '一键生成'}
              </Button>
            </div>
          </div>
        </section>

        <section className="mg-right">
          <div className="mg-history-head">
            <div className="mg-panel-title">
              <History className="mg-icon" />
              <span>生成结果</span>
              <Badge variant="secondary">{history.length}</Badge>
            </div>
            <div className="mg-history-actions">
              <Button variant="outline" size="sm" onClick={openWorkflowDialog} className="mg-workflow-btn">
                <Workflow className="mg-icon" />
                <span>{sharedConfig.workflowName || sharedConfig.workflowId || '选择工作流'}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => AS.invokeService('clear_results')}>
                <Trash2 className="mg-icon" />清空
              </Button>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="mg-empty">生成的音乐会显示在这里</div>
          ) : (
            <div className="mg-list">
              {history.map((item) => (
                <article className="mg-card" key={item.id}>
                  <div className="mg-card-head">
                    <div className="mg-card-title">
                      <Music className="mg-icon" />
                      <span>{item.title || '未命名'}</span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => AS.invokeService('remove_result', { id: item.id })}
                      title="删除"
                    >
                      <Trash2 className="mg-icon" />
                    </Button>
                  </div>
                  <div className="mg-card-meta">
                    <Badge variant="secondary">{genderLabel(item.gender)}</Badge>
                    {item.style && <Badge variant="outline">{item.style}</Badge>}
                    {typeof item.duration === 'number' && item.duration > 0 && (
                      <span>{Math.round(item.duration)}s</span>
                    )}
                    <span>{item.createdAt}</span>
                  </div>
                  {item.lyric && (
                    <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: '#52525b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.lyric}
                    </p>
                  )}
                  <audio className="mg-card-audio" controls src={item.url} preload="metadata" />
                  <div className="mg-card-actions">
                    <Button size="sm" variant="outline" onClick={() => window.open(item.url, '_blank')}>
                      <Download className="mg-icon" />下载
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {running && <div className="mg-floating-status">{status || '生成中...'}</div>}
    </div>
  );
}

function genderLabel(g) {
  return g === 'm' ? '男声' : g === 'f' ? '女声' : '—';
}

async function resolveUploadItem(item) {
  const file = item?.file || item;
  if (!file) throw new Error('参考音频无效');
  if (file.uploadError) throw new Error(file.uploadError);
  if (file.uploadPromise) {
    const uploaded = await file.uploadPromise;
    Object.assign(file, {
      uploadedPath: uploaded.path,
      uploadedUrl: uploaded.url,
      uploadedHttpPath: uploaded.httpPath,
      uploading: false,
      uploadError: undefined,
      uploadPromise: Promise.resolve(uploaded),
    });
  }
  const url = file.uploadedHttpPath || file.uploadedUrl || file.httpPath || file.url || '';
  return {
    name: file.name || file.uploadedPath || 'reference.wav',
    path: file.uploadedPath || file.path || url,
    url,
  };
}

function persistableReferences(references) {
  return (Array.isArray(references) ? references : [])
    .map((item) => {
      const file = item?.file || item;
      const url = file?.uploadedHttpPath || file?.uploadedUrl || file?.httpPath || file?.url || '';
      if (!url) return null;
      return {
        id: item?.id || `ref-${Math.random().toString(36).slice(2)}`,
        file: {
          name: file.name || 'reference.wav',
          size: file.size || 0,
          type: file.type || 'audio/wav',
          url,
          httpPath: url,
          uploadedUrl: file.uploadedUrl || url,
          uploadedHttpPath: file.uploadedHttpPath || url,
          uploadedPath: file.uploadedPath || file.path || '',
        },
      };
    })
    .filter(Boolean);
}

// 层层解包 execute_workflow_sync 的返回，定位到 { status, steps, ... } 这一格
function unwrapWorkflowPayload(value) {
  let payload = value;
  for (let i = 0; i < 5; i += 1) {
    if (!payload || typeof payload !== 'object') break;
    if (Array.isArray(payload.steps) || payload.status || payload.workflow_id || payload.executionId) break;
    if (payload.result && typeof payload.result === 'object') { payload = payload.result; continue; }
    if (payload.data && typeof payload.data === 'object') { payload = payload.data; continue; }
    break;
  }
  return payload;
}

// 从 end 节点 output.result_url 提取音频 url；fallback 到 suno 节点 sunoData
function extractAudios(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];

  const endStep = steps.find((step) =>
    String(step?.nodeId || '').endsWith('_end')
    || String(step?.nodeLabel || '').includes('结束'),
  );
  const endOut = endStep?.output || {};
  const rawUrls = endOut.result_url || endOut.result || [];
  const urlList = Array.isArray(rawUrls) ? rawUrls : [rawUrls];

  const fromUrls = urlList
    .map((item) => {
      if (typeof item === 'string') return { url: item };
      if (item?.url) return { url: item.url };
      if (item?.audioUrl) return { url: item.audioUrl };
      return null;
    })
    .filter((item) => item && item.url)
    .map((item) => ({ type: 'audio', url: item.url }));
  if (fromUrls.length) return fromUrls;

  // fallback：直接从 suno 节点的 sunoData 取 audioUrl + title + duration
  const sunoStep = steps.find((step) =>
    Array.isArray(step?.output?.data?.sunoData)
    || Array.isArray(step?.output?.response?.sunoData),
  );
  const sunoData = sunoStep?.output?.data?.sunoData || sunoStep?.output?.response?.sunoData || [];
  return sunoData
    .map((item) => {
      const url = item?.audioUrl || item?.sourceAudioUrl || item?.streamAudioUrl;
      if (!url) return null;
      return { type: 'audio', url, title: item?.title, duration: item?.duration };
    })
    .filter(Boolean);
}

export default App;
