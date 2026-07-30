// 文案转分镜 · 对话框（导入文案 / 生成参数 / Agent 配置 / 工作流设置）
import React, { useState, useEffect } from 'react';
import {
  BUILTIN_PLUGIN,
  MODEL_OPTIONS,
  VOICE_MODEL_OPTIONS,
  ASPECT_OPTIONS,
  SIZE_OPTIONS,
  QUALITY_OPTIONS,
  DURATION_OPTIONS,
  BATCH_LIMIT_OPTIONS,
  AGENT_INIT_NAME,
  AGENT_INIT_PROMPT,
} from '../utils/constants.js';
import { parseStoryboardJson, resolveUploadItem } from '../utils/workflow.js';

// 四个工作流槽位定义：label + settings 字段映射
const WORKFLOW_SLOTS = [
  { key: 'textToImage', idKey: 'textToImageWorkflowId', nameKey: 'textToImageWorkflowName', label: '文生图工作流', desc: '纯文本生成图片（角色、分镜画面）' },
  { key: 'editImage', idKey: 'editImageWorkflowId', nameKey: 'editImageWorkflowName', label: '图生图工作流', desc: '参考图生成 / 图像编辑' },
  { key: 'video', idKey: 'videoWorkflowId', nameKey: 'videoWorkflowName', label: '视频生成工作流', desc: '分镜画面生成视频' },
  { key: 'voice', idKey: 'voiceWorkflowId', nameKey: 'voiceWorkflowName', label: '语音合成工作流', desc: '分镜旁白文本生成语音' },
];

// 通用 dialog 外壳（使用 AgentSpacesUI 自带 Dialog，避免 Select 浮层层级异常）
function Modal({ open, onClose, title, children, width, className = '', bodyClassName = '' }) {
  const { Dialog, DialogContent, DialogHeader, DialogTitle } = window.AgentSpacesUI;
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        className={className || undefined}
        style={width ? { maxWidth: width } : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className={bodyClassName || undefined}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}

// Agent 配置按钮（podcast 同款 openAgentEditor）
export function AgentConfigButton({ agentConfigId, agentMeta, onConfigured }) {
  const { Button } = window.AgentSpacesUI;
  const AS = window.AgentSpaces;

  const configure = async () => {
    try {
      const saved = await AS.openAgentEditor({
        initialName: AGENT_INIT_NAME,
        initialPrompt: AGENT_INIT_PROMPT,
        agentId: agentConfigId || undefined,
      });
      if (!saved) return;
      onConfigured({
        id: saved.id,
        name: saved.name || AGENT_INIT_NAME,
        modelProvider: saved.modelProvider,
      });
    } catch (e) {
      window.alert?.('打开模型配置失败：' + (e?.message || e));
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={configure} title="配置文案转分镜 AI">
      {agentMeta ? `🤖 ${agentMeta.name}${agentMeta.modelProvider ? ` · ${agentMeta.modelProvider}` : ''}` : '⚙️ 配置 AI'}
    </Button>
  );
}

// 生成参数对话框：每次生成前弹出，默认填入上次参数
export function GenerateParamsDialog({ open, value, mode, variant, onConfirm, onCancel }) {
  const { Button, Label, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, FileUpload, Trash2, Loader2 } = window.AgentSpacesUI;

  const [cfg, setCfg] = useState(value || {});
  const [imageMode, setImageMode] = useState('text');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [referenceImages, setReferenceImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const next = value || {};
    if (mode === 'voice') {
      const validVoiceModel = VOICE_MODEL_OPTIONS.some((m) => m.value === next.voiceModel);
      setCfg(validVoiceModel ? next : { ...next, voiceModel: VOICE_MODEL_OPTIONS[0]?.value || '' });
    } else {
      const validModel = MODEL_OPTIONS.some((m) => m.value === next.model);
      setCfg(validModel ? next : { ...next, model: MODEL_OPTIONS[0]?.value || '' });
    }
    setImageMode(next.generationMode || 'text');
    setPendingFiles([]);
    setReferenceImages(Array.isArray(next.referenceImages) ? next.referenceImages : []);
    setUploading(false);
  }, [open, value, mode]);

  const patch = (p) => setCfg((prev) => ({ ...prev, ...p }));
  const enableImageTabs = mode === 'image' && variant === 'character';
  const enableBatchLimit = variant === 'bulk';
  const isVoice = mode === 'voice';

  const onUploadStatus = (s) => {
    const isUploading = !!s?.uploading;
    setUploading(isUploading);
    if (!isUploading && pendingFiles.length) {
      const files = pendingFiles.slice();
      Promise.all(files.map((f) => resolveUploadItem(f).catch(() => null))).then((urls) => {
        const valid = urls.filter(Boolean);
        if (valid.length) setReferenceImages((prev) => [...prev, ...valid]);
        setPendingFiles([]);
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="生成参数"
      width={460}
      className="sm:max-w-[460px]"
      bodyClassName="sb-modal-body"
    >
      <div>
        {isVoice && (
          <>
            <div className="sb-field">
              <Label>语音服务商</Label>
              <Select value={cfg.voiceModel} onValueChange={(v) => patch({ voiceModel: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择服务商" /></SelectTrigger>
                <SelectContent>
                  {VOICE_MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sb-field">
              <Label>发音人 ID（可选）</Label>
              <Input
                value={cfg.voiceId || ''}
                onChange={(e) => patch({ voiceId: e.target.value })}
                placeholder="fish-audio 传 referenceId / minimax 传 voiceId / qianyin 传 speakerId"
              />
            </div>
          </>
        )}
        {!isVoice && enableImageTabs && (
          <div className="sb-field">
            <Label>生成方式</Label>
            <div className="sb-tab-row">
              <button type="button" className={`sb-radio${imageMode === 'text' ? ' is-on' : ''}`} onClick={() => setImageMode('text')}>
                纯文本生图
              </button>
              <button type="button" className={`sb-radio${imageMode === 'reference' ? ' is-on' : ''}`} onClick={() => setImageMode('reference')}>
                上传参考图生图
              </button>
            </div>
          </div>
        )}
        {!isVoice && (
        <>
        <div className="sb-field">
          <Label>模型</Label>
          <Select value={cfg.model} onValueChange={(v) => patch({ model: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="选择模型" /></SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label} · {m.providerLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sb-field">
          <Label>比例</Label>
          <Select value={cfg.aspect} onValueChange={(v) => patch({ aspect: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASPECT_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="sb-field">
          <Label>{mode === 'video' ? '画质' : '尺寸'}</Label>
          <Select value={mode === 'video' ? cfg.quality : cfg.size} onValueChange={(v) => patch(mode === 'video' ? { quality: v } : { size: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(mode === 'video' ? QUALITY_OPTIONS : SIZE_OPTIONS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {mode === 'video' && (
          <div className="sb-field">
            <Label>时长</Label>
            <Select value={cfg.duration} onValueChange={(v) => patch({ duration: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {enableBatchLimit && !isVoice && (
          <div className="sb-field">
            <Label>批量运行上限</Label>
            <Select value={cfg.batchLimit || '1'} onValueChange={(v) => patch({ batchLimit: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BATCH_LIMIT_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {enableImageTabs && imageMode === 'reference' && (
          <div className="sb-field">
            <Label>参考图</Label>
            {referenceImages.length > 0 && (
              <div className="sb-img-grid">
                {referenceImages.map((url, i) => (
                  <div key={`${url}-${i}`} className="sb-img-thumb">
                    <img src={url} alt="" />
                    <button
                      type="button"
                      className="sb-img-del"
                      onClick={() => setReferenceImages((prev) => prev.filter((_, idx) => idx !== i))}
                      title="删除"
                    >
                      <Trash2 className="sb-icon" />
                    </button>
                  </div>
                ))}
                {uploading && <div className="sb-img-thumb is-uploading"><Loader2 className="sb-icon sb-spin" /></div>}
              </div>
            )}
            {referenceImages.length === 0 && !uploading && (
              <div className="sb-chips-empty">请先上传至少一张参考图</div>
            )}
            <FileUpload
              value={pendingFiles}
              onChange={(files) => setPendingFiles(files || [])}
              onUploadStatusChange={onUploadStatus}
              accept="image/*"
              autoUpload
              multiple
            />
          </div>
        )}
        </>
        )}
      </div>

      <div className="sb-modal-foot">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button
          disabled={uploading || (enableImageTabs && imageMode === 'reference' && referenceImages.length === 0)}
          onClick={() => {
            if (isVoice) {
              onConfirm({
                ...cfg,
                voiceModel: cfg.voiceModel || VOICE_MODEL_OPTIONS[0]?.value || '',
                voiceId: cfg.voiceId || '',
              });
              return;
            }
            const modelMeta = MODEL_OPTIONS.find((m) => m.value === cfg.model);
            onConfirm({
              ...cfg,
              provider: modelMeta?.provider || cfg.provider || '',
              generationMode: enableImageTabs ? imageMode : 'text',
              referenceImages: enableImageTabs && imageMode === 'reference' ? referenceImages : [],
            });
          }}
        >
          开始生成
        </Button>
      </div>
    </Modal>
  );
}

// 导入文案对话框
export function ImportDialog({ open, onClose, actions, agentConfigId }) {
  const { Button, Textarea, Label, Loader2, WandSparkles } = window.AgentSpacesUI;
  const AS = window.AgentSpaces;

  const [text, setText] = useState('');
  const [mode, setMode] = useState('merge');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setText(''); setError(''); setRunning(false); } }, [open]);

  const run = async () => {
    if (!text.trim()) { setError('请输入设定文案'); return; }
    if (!agentConfigId) { setError('请先点击「配置 AI」创建模型'); return; }
    setError(''); setRunning(true);
    try {
      const taskId = `sb-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const ret = await AS.callPluginTool(
        BUILTIN_PLUGIN,
        'agent_run',
        {
          prompt: text,
          agentConfigId,
          systemPrompt: AGENT_INIT_PROMPT,
          permissionMode: 'bypassPermissions',
        },
        { taskId, meta: { mode: 'import', label: '文案转分镜' } },
      );
      const raw = ret?.result?.result ?? ret?.result ?? ret;
      const parsed = parseStoryboardJson(raw);
      if (!parsed) throw new Error('AI 未返回有效 JSON：' + String(raw || '').slice(0, 200));

      const characters = (parsed.characters || []).map((c) => ({
        name: c.name || '',
        prompt: c.prompt || '',
        images: [],
      }));
      const scenes = (parsed.scenes || []).map((s) => ({
        index: typeof s.index === 'number' ? s.index : 0,
        narration: s.narration || '',
        visualPrompt: s.visualPrompt || '',
        animationPrompt: s.animationPrompt || '',
        characterNames: Array.isArray(s.characterNames) ? s.characterNames : [],
        characterIds: [],
      }));

      await actions.importStoryboard({ characters, scenes, mode });
      onClose();
    } catch (e) {
      setError(e?.message || '导入失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="导入文案生成分镜"
      width={680}
      className="sm:max-w-[680px]"
      bodyClassName="sb-modal-body sb-modal-body-scroll"
    >
      <div className="sb-field">
        <Label>设定 / 文案（Agent 会据此输出角色 + 分镜 JSON 并导入）</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴一段故事设定、产品文案或脚本大纲..."
          className="sb-textarea-lg"
        />
      </div>

      <div className="sb-field">
        <Label>导入方式</Label>
        <div className="sb-radio-row">
          <button type="button" className={`sb-radio${mode === 'merge' ? ' is-on' : ''}`} onClick={() => setMode('merge')}>
            合并（同 index 覆盖，角色同名沿用）
          </button>
          <button type="button" className={`sb-radio${mode === 'replace' ? ' is-on' : ''}`} onClick={() => setMode('replace')}>
            替换（清空当前项目的角色与分镜）
          </button>
        </div>
      </div>

      {error && <div className="sb-error">{error}</div>}

      <div className="sb-modal-foot">
        <Button variant="outline" onClick={onClose} disabled={running}>取消</Button>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="sb-icon sb-spin" /> : <WandSparkles className="sb-icon" />}
          {running ? '生成中' : '生成并导入'}
        </Button>
      </div>
    </Modal>
  );
}

// 工作流设置对话框：为三个用途分别指定工作流
export function SettingsDialog({ open, value, onClose, onSave }) {
  const { Button, Label, Workflow } = window.AgentSpacesUI;
  const AS = window.AgentSpaces;

  const [cfg, setCfg] = useState(value || {});
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setCfg(value || {});
      setError('');
    }
  }, [open, value]);

  // 打开宿主工作流选择器
  const openPicker = async (slotKey) => {
    try {
      const workflow = await AS.openWorkflowListDialog();
      if (!workflow) return;
      const slot = WORKFLOW_SLOTS.find((item) => item.key === slotKey);
      if (!slot) return;
      const id = workflow.id || workflow.workflow_id;
      const name = workflow.name || workflow.title || '未命名工作流';
      setCfg((prev) => ({ ...prev, [slot.idKey]: id, [slot.nameKey]: name }));
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="工作流设置"
      width={520}
      className="sm:max-w-[520px]"
      bodyClassName="sb-modal-body sb-modal-body-scroll"
    >
      <div className="sb-field" style={{ marginTop: 0 }}>
        <Label>为当前项目指定以下工作流</Label>
      </div>

      {WORKFLOW_SLOTS.map((slot) => {
        const name = cfg[slot.nameKey] || '';
        const id = cfg[slot.idKey] || '';
        return (
          <div className="sb-field" key={slot.key}>
            <Label>{slot.label}</Label>
            <div className="sb-slot-row">
              <button type="button" className="sb-slot-btn" onClick={() => openPicker(slot.key)} title={id || '未设置'}>
                <Workflow className="sb-icon" />
                <span className="sb-slot-name">{name || id || '点击选择工作流'}</span>
              </button>
            </div>
            <div className="sb-slot-desc">{slot.desc}</div>
          </div>
        );
      })}

      {error && <div className="sb-error">{error}</div>}

      <div className="sb-modal-foot">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button onClick={() => onSave(cfg)}>保存</Button>
      </div>

    </Modal>
  );
}

// 项目管理对话框：选择 / 新建 / 重命名 / 删除当前项目（替代 Select + window.prompt）
export function ProjectPickerDialog({ open, projects, currentId, onClose, actions }) {
  const { Button, Input, Label, FolderKanban, Plus, Pencil, Trash2, Check, X, Loader2 } = window.AgentSpacesUI;

  const [mode, setMode] = useState('select'); // select | new | rename
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('select');
    setName('');
    setError('');
    setBusy(false);
  }, [open]);

  const startNew = () => { setMode('new'); setName(''); setError(''); };
  const startRename = () => {
    const cur = projects.find((p) => p.id === currentId);
    setMode('rename');
    setName(cur?.name || '');
    setError('');
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('名称不能为空'); return; }
    setBusy(true);
    setError('');
    try {
      if (mode === 'new') {
        await actions.newProject(trimmed);
      } else {
        await actions.renameProject(currentId, trimmed);
      }
      setMode('select');
      setName('');
    } catch (e) {
      setError(e?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (!window.confirm(`删除项目「${p.name}」？此操作不可撤销。`)) return;
    setBusy(true);
    try {
      await actions.deleteProject(id);
    } catch (e) {
      setError(e?.message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="项目管理"
      width={560}
      className="sm:max-w-[560px]"
      bodyClassName="sb-modal-body sb-modal-body-scroll"
    >
      {mode === 'select' ? (
        <>
          <div className="sb-field" style={{ marginTop: 0 }}>
            <Label>选择项目（当前项目高亮）</Label>
          </div>
          <div className="sb-pj-list">
            {projects.length === 0 ? (
              <div className="sb-list-empty">暂无项目，点击下方「新建项目」</div>
            ) : projects.map((p) => {
              const active = p.id === currentId;
              return (
                <div key={p.id} className={`sb-pj-row${active ? ' is-active' : ''}`}>
                  <button type="button" className="sb-pj-main" onClick={() => { actions.setActiveProject(p.id); onClose(); }}>
                    <FolderKanban className="sb-icon" />
                    <span className="sb-pj-name">{p.name}</span>
                    {active && <span className="sb-pj-badge">当前</span>}
                  </button>
                  <button type="button" className="sb-pj-act" onClick={() => { actions.setActiveProject(p.id); startRename(); }} title="重命名">
                    <Pencil className="sb-icon" />
                  </button>
                  <button type="button" className="sb-pj-act sb-pj-del" onClick={() => remove(p.id)} title="删除">
                    <Trash2 className="sb-icon" />
                  </button>
                </div>
              );
            })}
          </div>

          {error && <div className="sb-error">{error}</div>}

          <div className="sb-modal-foot">
            <Button onClick={startNew}><Plus className="sb-icon" />新建项目</Button>
            <Button variant="outline" onClick={onClose}>关闭</Button>
          </div>
        </>
      ) : (
        <div className="sb-field" style={{ marginTop: 0 }}>
          <Label>{mode === 'new' ? '新项目名称' : '项目新名称'}</Label>
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder="输入项目名称"
          />
          {error && <div className="sb-error">{error}</div>}
          <div className="sb-modal-foot">
            <Button variant="outline" onClick={() => { setMode('select'); setError(''); }} disabled={busy}>返回</Button>
            <Button onClick={submit} disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="sb-icon sb-spin" /> : <Check className="sb-icon" />}
              {busy ? '处理中' : '确定'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
