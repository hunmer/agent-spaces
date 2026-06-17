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
  Popover,
  PopoverContent,
  PopoverTrigger,
  ImagePlus,
  WandSparkles,
  Save,
  Trash2,
  History,
  Workflow,
  Loader2,
  Check,
  X,
  Pencil,
  Plus,
  WorkflowListDialog,
} = window.AgentSpacesUI;

const DEFAULT_WORKFLOW_ID = '905c9f2f-4b49-48e9-b307-24751bc03ec2';
const PRESETS_KEY = 'coverGeneratorPresets';
const DRAFT_KEY = 'coverGeneratorDraft';
const HISTORY_PATH = 'generation-history.json';
const CONFIG_PATH = 'shared-config.json';

const defaultForm = {
  prompt: '',
  provider: 'openai',
  model: 'gpt-image-2',
  references: [],
};

function Style() {
  return (
    <style>{`
      .cg-app { height: 100vh; display: flex; flex-direction: column; background: #f7f7f4; color: #18181b; }
      .cg-workflow-btn { max-width: 360px; justify-content: flex-start; }
      .cg-workflow-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cg-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 380px minmax(0, 1fr); }
      .cg-left { min-height: 0; overflow: auto; border-right: 1px solid #e4e4e7; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #fbfbfa; }
      .cg-right { min-height: 0; overflow: auto; padding: 16px; }
      .cg-panel { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; }
      .cg-panel-title { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 14px; }
      .cg-field { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
      .cg-textarea { min-height: 138px; resize: vertical; }
      .cg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .cg-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
      .cg-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .cg-spin { animation: cg-spin 1s linear infinite; }
      @keyframes cg-spin { to { transform: rotate(360deg); } }
      .cg-error, .cg-status { margin-top: 12px; display: flex; align-items: center; gap: 8px; border-radius: 6px; padding: 9px 10px; font-size: 13px; }
      .cg-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
      .cg-status { background: #ecfdf5; color: #065f46; border: 1px solid #bbf7d0; }
      .cg-popover-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
      .cg-popover-title { font-weight: 650; font-size: 14px; }
      .cg-popover-list { max-height: 320px; overflow: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
      .cg-popover-item { display: grid; grid-template-columns: minmax(0, 1fr) 30px 30px; gap: 4px; align-items: center; border-radius: 6px; }
      .cg-popover-item:hover { background: #f4f4f5; }
      .cg-popover-item > button:first-child { text-align: left; min-width: 0; border: 0; background: transparent; padding: 4px 6px; cursor: pointer; border-radius: 5px; }
      .cg-popover-item strong, .cg-popover-item span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cg-popover-item span { color: #71717a; font-size: 12px; margin-top: 2px; }
      .cg-popover-item.is-editing { display: flex; padding: 6px; background: #f4f4f5; }
      .cg-history-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .cg-history-actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .cg-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .cg-card { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden; }
      .cg-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: #e5e7eb; }
      .cg-card-body { padding: 10px; }
      .cg-card-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #71717a; font-size: 12px; }
      .cg-card p { margin: 8px 0 10px; font-size: 13px; line-height: 1.45; color: #27272a; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .cg-card-actions { display: flex; align-items: center; justify-content: space-between; }
      .cg-empty { height: calc(100vh - 140px); border: 1px dashed #d4d4d8; border-radius: 8px; display: grid; place-items: center; color: #71717a; background: #ffffff; }
      .cg-empty-small { color: #71717a; font-size: 13px; padding: 12px 0; }
      .cg-workflow-list { max-height: 420px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
      .cg-workflow-list button { text-align: left; border: 1px solid #e4e4e7; background: #ffffff; border-radius: 7px; padding: 10px; cursor: pointer; }
      .cg-workflow-list button:hover { background: #f4f4f5; }
      .cg-workflow-list strong, .cg-workflow-list span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cg-workflow-list span { color: #71717a; font-size: 12px; margin-top: 4px; }
      .cg-floating-status { position: fixed; right: 18px; bottom: 18px; z-index: 80; background: #18181b; color: #ffffff; border-radius: 7px; padding: 8px 12px; font-size: 13px; }
      @media (max-width: 900px) {
        .cg-main { grid-template-columns: 1fr; }
        .cg-left { border-right: 0; border-bottom: 1px solid #e4e4e7; max-height: none; }
        .cg-workflow-btn { max-width: 100%; width: 100%; }
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
  const [presets, setPresets] = React.useState(() => AS.getUserSetting?.(PRESETS_KEY, []) || []);
  const [history, setHistory] = React.useState([]);
  const [sharedConfig, setSharedConfig] = React.useState({ workflowId: DEFAULT_WORKFLOW_ID, workflowName: '封面图生成工作流' });
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  const [workflows, setWorkflows] = React.useState([]);
  const [workflowLoading, setWorkflowLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [uploadingReferences, setUploadingReferences] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [presetOpen, setPresetOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);
  const [editingName, setEditingName] = React.useState('');

  React.useEffect(() => {
    AS.saveUserSettings?.({ [DRAFT_KEY]: { ...form, references: persistableReferences(form.references) } });
  }, [form]);

  React.useEffect(() => {
    const initialHistory = AS.getConfig?.(HISTORY_PATH);
    if (Array.isArray(initialHistory)) setHistory(initialHistory);
    const initialConfig = AS.getConfig?.(CONFIG_PATH);
    if (initialConfig && typeof initialConfig === 'object') {
      setSharedConfig({ workflowId: DEFAULT_WORKFLOW_ID, workflowName: '封面图生成工作流', ...initialConfig });
    }
    const off = AS.onConfigChanged?.((path, value) => {
      if (path === HISTORY_PATH) setHistory(Array.isArray(value) ? value : []);
      if (path === CONFIG_PATH && value && typeof value === 'object') {
        setSharedConfig({ workflowId: DEFAULT_WORKFLOW_ID, workflowName: '封面图生成工作流', ...value });
      }
    });
    return () => off?.();
  }, []);

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const savePreset = () => {
    const name = window.prompt('预设名称', form.prompt ? form.prompt.slice(0, 20) : '新预设');
    if (!name) return;
    const next = [
      { id: `preset-${Date.now()}`, name, form: { ...form, references: [] }, createdAt: new Date().toLocaleString('zh-CN') },
      ...presets,
    ].slice(0, 30);
    setPresets(next);
    AS.saveUserSettings?.({ [PRESETS_KEY]: next });
  };

  const applyPreset = (preset) => {
    setForm((prev) => ({ ...prev, ...preset.form, references: prev.references || [] }));
  };

  const removePreset = (id) => {
    const next = presets.filter((item) => item.id !== id);
    setPresets(next);
    AS.saveUserSettings?.({ [PRESETS_KEY]: next });
    if (editingId === id) setEditingId(null);
  };

  const startRenamePreset = (preset) => {
    setEditingId(preset.id);
    setEditingName(preset.name);
  };

  const commitRenamePreset = () => {
    const name = String(editingName || '').trim();
    if (editingId && name) {
      const next = presets.map((p) => (p.id === editingId ? { ...p, name } : p));
      setPresets(next);
      AS.saveUserSettings?.({ [PRESETS_KEY]: next });
    }
    setEditingId(null);
    setEditingName('');
  };

  const cancelRenamePreset = () => {
    setEditingId(null);
    setEditingName('');
  };

  const openWorkflowDialog = async () => {
    setWorkflowOpen(true);
    setWorkflowLoading(true);
    try {
      const resp = await AS.callPluginTool('@agent-spaces/builtin', 'list_workflows', { page_size: 50 });
      const list = resp?.data?.workflows || resp?.result?.data?.workflows || resp?.result?.workflows || resp?.workflows || [];
      setWorkflows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setWorkflowLoading(false);
    }
  };

  const selectWorkflow = async (workflow) => {
    const next = {
      workflowId: workflow.workflow_id || workflow.id,
      workflowName: workflow.title || workflow.name || '未命名工作流',
    };
    setSharedConfig(next);
    setWorkflowOpen(false);
    await AS.invokeService('save_shared_config', next);
  };

  const generate = async () => {
    const prompt = String(form.prompt || '').trim();
    const references = Array.isArray(form.references) ? form.references : [];
    if (!prompt) {
      setError('请输入封面描述');
      return;
    }
    if (!references.length) {
      setError('请至少上传一张参考图');
      return;
    }

    setRunning(true);
    setError('');
    setStatus('正在上传参考图...');
    try {
      const images = await Promise.all(references.map(resolveUploadItem));
      setStatus('正在执行工作流...');
      const workflowId = sharedConfig.workflowId || DEFAULT_WORKFLOW_ID;
      const taskId = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const result = await AS.callPluginTool(
        '@agent-spaces/builtin',
        'execute_workflow_sync',
        {
          workflow_id: workflowId,
          input: {
            images,
            prompt,
            provider: form.provider,
            model: form.model,
          },
          max_wait_ms: 600000,
        },
        {
          taskId,
          meta: { workflowId, prompt, model: form.model, provider: form.provider, label: '封面生成' },
        },
      );

      const payload = unwrapWorkflowPayload(result);
      if (payload?.status && payload.status !== 'completed' && payload.status !== 'success') {
        throw new Error(payload.timedOut ? '工作流仍在运行，请稍后查看历史' : `工作流状态：${payload.status}`);
      }
      const imagesOut = extractImages(payload);
      if (!imagesOut.length) throw new Error('工作流没有返回图片结果');

      await AS.invokeService('add_results', {
        items: imagesOut,
        prompt,
        provider: form.provider,
        model: form.model,
        workflowId,
        workflowName: sharedConfig.workflowName,
      });
      setStatus(`已生成 ${imagesOut.length} 张图片`);
    } catch (err) {
      const msg = err?.message || String(err || '生成失败');
      setError(msg);
      setStatus('');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="cg-app">
      <Style />
      <main className="cg-main">
        <section className="cg-left">
          <div className="cg-panel">
            <div className="cg-panel-title">
              <ImagePlus className="cg-icon" />
              <span>输入</span>
            </div>
            <Field label="参考图">
              <FileUpload
                value={form.references}
                onChange={(files) => {
                  updateForm({ references: files });
                  Promise.all((files || []).map(resolveUploadItem))
                    .then(() => {
                      setForm((prev) => ({ ...prev, references: persistableReferences(prev.references) }));
                    })
                    .catch(() => {});
                }}
                onUploadStatusChange={(uploadStatus) => setUploadingReferences(!!uploadStatus?.uploading)}
                accept="image/*"
                multiple
                autoUpload
              />
            </Field>
            <Field label="描述">
              <Textarea
                value={form.prompt}
                onChange={(event) => updateForm({ prompt: event.target.value })}
                placeholder="例如：科技感课程封面，主体突出，留出标题区域，深浅对比强"
                className="cg-textarea"
              />
            </Field>
            <div className="cg-grid">
              <Field label="提供商">
                <Select value={form.provider} onValueChange={(value) => updateForm({ provider: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="模型">
                <Select value={form.model} onValueChange={(value) => updateForm({ model: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-image-2">gpt-image-2</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {error && <div className="cg-error"><X className="cg-icon" />{error}</div>}
            {status && <div className="cg-status"><Check className="cg-icon" />{status}</div>}
            <div className="cg-actions">
              <Popover open={presetOpen} onOpenChange={setPresetOpen}>
                <PopoverTrigger render={<Button variant="outline" />}>
                  <Save className="cg-icon" />预设
                  <Badge variant="secondary" className="ml-1">{presets.length}</Badge>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[300px] p-0 gap-0">
                  <div className="cg-popover-head">
                    <span className="cg-popover-title">预设</span>
                    <Button size="sm" variant="ghost" onClick={savePreset}>
                      <Plus className="cg-icon" />新建
                    </Button>
                  </div>
                  <div className="cg-popover-list">
                    {presets.length === 0 ? (
                      <div className="cg-empty-small">暂无预设，点击"新建"保存当前配置</div>
                    ) : presets.map((preset) => (
                      <div className={`cg-popover-item${editingId === preset.id ? ' is-editing' : ''}`} key={preset.id}>
                        {editingId === preset.id ? (
                          <>
                            <Input
                              value={editingName}
                              autoFocus
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitRenamePreset(); }
                                if (e.key === 'Escape') { e.preventDefault(); cancelRenamePreset(); }
                              }}
                              className="h-8 text-[13px]"
                            />
                            <Button size="icon" variant="ghost" onClick={commitRenamePreset} title="保存">
                              <Check className="cg-icon" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={cancelRenamePreset} title="取消">
                              <X className="cg-icon" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { applyPreset(preset); setPresetOpen(false); }} title="应用此预设">
                              <strong>{preset.name}</strong>
                              <span>{preset.form?.prompt || '无描述'}</span>
                            </button>
                            <Button size="icon" variant="ghost" onClick={() => startRenamePreset(preset)} title="编辑名称">
                              <Pencil className="cg-icon" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => removePreset(preset.id)} title="删除预设">
                              <Trash2 className="cg-icon" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button onClick={generate} disabled={running || uploadingReferences}>
                {running || uploadingReferences ? <Loader2 className="cg-icon cg-spin" /> : <WandSparkles className="cg-icon" />}
                {uploadingReferences ? '上传中' : '生成图片'}
              </Button>
            </div>
          </div>
        </section>

        <section className="cg-right">
          <div className="cg-history-head">
            <div className="cg-panel-title">
              <History className="cg-icon" />
              <span>历史输出</span>
              <Badge variant="secondary">{history.length}</Badge>
            </div>
            <div className="cg-history-actions">
              <Button variant="outline" size="sm" onClick={openWorkflowDialog} className="cg-workflow-btn">
                <Workflow className="cg-icon" />
                <span>{sharedConfig.workflowName || sharedConfig.workflowId || '选择工作流'}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => AS.invokeService('clear_results')}>
                <Trash2 className="cg-icon" />清空
              </Button>
            </div>
          </div>
          {history.length === 0 ? (
            <div className="cg-empty">生成结果会显示在这里</div>
          ) : (
            <div className="cg-gallery">
              {history.map((item) => (
                <article className="cg-card" key={item.id}>
                  <img src={item.url} alt={item.prompt || 'cover result'} />
                  <div className="cg-card-body">
                    <div className="cg-card-row">
                      <Badge>{item.model || 'gpt-image-2'}</Badge>
                      <span>{item.createdAt}</span>
                    </div>
                    <p>{item.prompt}</p>
                    <div className="cg-card-actions">
                      <Button size="sm" variant="outline" onClick={() => window.open(item.url, '_blank')}>打开</Button>
                      <Button size="sm" variant="ghost" onClick={() => AS.invokeService('remove_result', { id: item.id })}>
                        <Trash2 className="cg-icon" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <WorkflowListDialog
        open={workflowOpen}
        workflows={workflows.map(normalizeWorkflow)}
        onSelect={selectWorkflow}
        onCreate={() => window.open('/workflows', '_blank')}
        onClose={() => setWorkflowOpen(false)}
      />
      {workflowOpen && workflowLoading && <div className="cg-floating-status">工作流加载中...</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="cg-field">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

async function resolveUploadItem(item) {
  const file = item?.file || item;
  if (!file) throw new Error('参考图无效');
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
    name: file.name || file.uploadedPath || 'reference.png',
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
          name: file.name || 'reference.png',
          size: file.size || 0,
          type: file.type || 'image/png',
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

function normalizeWorkflow(workflow) {
  return {
    ...workflow,
    id: workflow.id || workflow.workflow_id,
    name: workflow.name || workflow.title || '未命名工作流',
    updatedAt: workflow.updatedAt || 0,
    nodes: workflow.nodes || [],
  };
}

function unwrapWorkflowPayload(value) {
  let payload = value;
  for (let i = 0; i < 5; i += 1) {
    if (!payload || typeof payload !== 'object') break;
    if (Array.isArray(payload.steps) || payload.status || payload.workflow_id || payload.executionId) break;
    if (payload.result && typeof payload.result === 'object') {
      payload = payload.result;
      continue;
    }
    if (payload.data && typeof payload.data === 'object') {
      payload = payload.data;
      continue;
    }
    break;
  }
  return payload;
}

function extractImages(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const endStep = steps.find((step) =>
    step?.nodeId === 'node_1781681576137_end'
    || String(step?.nodeId || '').endsWith('_end')
    || String(step?.nodeLabel || '').includes('结束')
  );
  const result = endStep?.output?.result
    || payload?.result
    || steps.find((step) => Array.isArray(step?.output?.data?.images))?.output?.data?.images
    || steps.find((step) => Array.isArray(step?.output?.images))?.output?.images
    || [];
  const images = Array.isArray(result) ? result : [result];
  return images
    .map((item) => {
      if (typeof item === 'string') return { type: 'image', url: item };
      if (item?.url) return { type: 'image', url: item.url };
      if (item?.imageUrl) return { type: 'image', url: item.imageUrl };
      return null;
    })
    .filter((item) => item.url)
    .filter(Boolean);
}

export default App;
