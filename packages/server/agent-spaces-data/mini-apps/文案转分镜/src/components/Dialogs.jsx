// 文案转分镜 · 对话框（导入文案 / 生成参数 / Agent 配置）
import React, { useState, useEffect } from 'react';
import {
  BUILTIN_PLUGIN,
  MODEL_OPTIONS,
  ASPECT_OPTIONS,
  SIZE_OPTIONS,
  QUALITY_OPTIONS,
  DURATION_OPTIONS,
  BATCH_LIMIT_OPTIONS,
  AGENT_INIT_NAME,
  AGENT_INIT_PROMPT,
} from '../utils/constants.js';
import { parseStoryboardJson, resolveUploadItem } from '../utils/workflow.js';

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
  const { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, FileUpload, Trash2, Loader2 } = window.AgentSpacesUI;

  const [cfg, setCfg] = useState(value || {});
  const [imageMode, setImageMode] = useState('text');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [referenceImages, setReferenceImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const next = value || {};
    const validModel = MODEL_OPTIONS.some((m) => m.value === next.model);
    setCfg(validModel ? next : { ...next, model: MODEL_OPTIONS[0]?.value || '' });
    setImageMode(next.generationMode || 'text');
    setPendingFiles([]);
    setReferenceImages(Array.isArray(next.referenceImages) ? next.referenceImages : []);
    setUploading(false);
  }, [open, value]);

  const patch = (p) => setCfg((prev) => ({ ...prev, ...p }));
  const enableImageTabs = mode === 'image' && variant === 'character';
  const enableBatchLimit = variant === 'bulk';

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
        {enableImageTabs && (
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
        {enableBatchLimit && (
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
      </div>

      <div className="sb-modal-foot">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button
          disabled={uploading || (enableImageTabs && imageMode === 'reference' && referenceImages.length === 0)}
          onClick={() => {
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
