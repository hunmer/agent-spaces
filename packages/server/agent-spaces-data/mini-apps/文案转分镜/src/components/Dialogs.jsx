// 文案转分镜 · 对话框（导入文案 / 生成参数 / Agent 配置）
import React, { useState, useEffect } from 'react';
import {
  BUILTIN_PLUGIN,
  MODEL_OPTIONS,
  ASPECT_OPTIONS,
  SIZE_OPTIONS,
  AGENT_INIT_NAME,
  AGENT_INIT_PROMPT,
} from '../utils/constants.js';
import { parseStoryboardJson } from '../utils/workflow.js';

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
export function GenerateParamsDialog({ open, value, onConfirm, onCancel }) {
  const { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = window.AgentSpacesUI;

  const [cfg, setCfg] = useState(value || {});
  useEffect(() => {
    if (!open) return;
    const next = value || {};
    const validModel = MODEL_OPTIONS.some((m) => m.value === next.model);
    setCfg(validModel ? next : { ...next, model: MODEL_OPTIONS[0]?.value || '' });
  }, [open, value]);

  const patch = (p) => setCfg((prev) => ({ ...prev, ...p }));

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
          <Label>尺寸</Label>
          <Select value={cfg.size} onValueChange={(v) => patch({ size: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="sb-modal-foot">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button
          onClick={() => {
            const modelMeta = MODEL_OPTIONS.find((m) => m.value === cfg.model);
            onConfirm({ ...cfg, provider: modelMeta?.provider || cfg.provider || '' });
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
