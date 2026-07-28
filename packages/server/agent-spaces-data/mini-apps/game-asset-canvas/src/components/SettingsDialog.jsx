// 设置对话框：为每种节点类型配置执行时调用的目标工作流
// 参考 stickerGenerator/SettingsDialog.jsx + WorkflowListDialog 工作流选择模式
// 修改即保存（无保存/取消按钮）：cfg 变化时自动 onSave，用 JSON 比较避免与父组件回传 value 死循环。
import { useEffect, useRef, useState } from 'react';
import {
  WORKFLOW_SLOTS, BUILTIN_PLUGIN,
  DEFAULT_TEXT_TO_IMAGE_MODELS, DEFAULT_EDIT_IMAGE_MODELS,
} from '../utils/settings';
import { BBOX_AGENT_INIT_NAME, BBOX_AI_SYSTEM_PROMPT, BBOX_AI_USER_PROMPT, PROMPT_REVERSE_AGENT_INIT_NAME, PROMPT_REVERSE_SYSTEM_PROMPT, PROMPT_REVERSE_USER_PROMPT, PROMPT_OPTIMIZE_AGENT_INIT_NAME, PROMPT_OPTIMIZE_SYSTEM_PROMPT, PROMPT_OPTIMIZE_USER_PROMPT } from '../utils/constants';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Label, Input, NumberInput, Textarea, WorkflowListDialog, Workflow, RotateCcw, Bot, Sparkles, Search, TagInput, Switch, Wand2,
} = window.AgentSpacesUI;

// 工作流列表归一化（兼容 workflow_id/id、title/name）
function normalizeWorkflow(workflow) {
  return {
    ...workflow,
    id: workflow.id || workflow.workflow_id,
    name: workflow.name || workflow.title || '未命名工作流',
    updatedAt: workflow.updatedAt || 0,
    nodes: workflow.nodes || [],
  };
}

// 工作流槽位行
function WorkflowSlot({ slot, value, onPick, onReset }) {
  const name = value[slot.nameKey] || '';
  const id = value[slot.idKey] || '';
  const usingDefault = id === slot.defaultId;
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">{slot.label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition hover:border-primary"
          onClick={() => onPick(slot.key)}
          title={id || '未设置'}
        >
          <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-left">
            {name || id || '点击选择工作流'}
          </span>
          {usingDefault && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">默认</span>}
        </button>
        {id && !usingDefault && (
          <Button size="sm" variant="ghost" className="shrink-0" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{slot.desc}</div>
    </div>
  );
}

export default function SettingsDialog({ open, value, onClose, onSave }) {
  const AS = window.AgentSpaces;
  const [cfg, setCfg] = useState(value || {});
  const [workflows, setWorkflows] = useState([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [pickingSlot, setPickingSlot] = useState(null);
  const [error, setError] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);

  // lastSavedJson 必须先声明（在两个 effect 之前），供自动保存比较基准使用。
  const lastSavedJson = useRef('');
  const savedRef = useRef(onSave);
  savedRef.current = onSave;

  // 打开时同步外部 value + 重置基准（不触发保存）
  // 必须在「自动保存」effect 之前声明：首次打开时先初始化 lastSavedJson，
  // 否则自动保存 effect 会因 lastSavedJson 为空字符串而误触发一次保存。
  useEffect(() => {
    if (open) {
      setCfg(value || {});
      lastSavedJson.current = JSON.stringify(value || {});
      setError('');
    }
  }, [open, value]);

  // 自动保存：cfg 变化且与上次已保存值不同时，调 onSave。
  // 用 lastSavedJson 比较规避与父组件回传 value 的死循环（父传回相同 value 不再触发保存）。
  useEffect(() => {
    if (!open) return;
    const json = JSON.stringify(cfg);
    if (json === lastSavedJson.current) return;
    lastSavedJson.current = json;
    savedRef.current?.(cfg);
  }, [open, cfg]);

  // —— 配置 BBox AI 模型（openAgentEditor 弹窗，systemPrompt 在 preset 内配置） ——
  const configureBboxAgent = async () => {
    if (!AS?.openAgentEditor) { setError('宿主未提供 openAgentEditor'); return; }
    setAgentBusy(true);
    setError('');
    try {
      const saved = await AS.openAgentEditor({
        initialName: BBOX_AGENT_INIT_NAME,
        initialPrompt: BBOX_AI_SYSTEM_PROMPT,
        agentId: cfg.bboxAgentConfigId || undefined,
      });
      if (!saved) { setAgentBusy(false); return; }
      setCfg((prev) => ({
        ...prev,
        bboxAgentConfigId: saved.id,
        bboxAgentName: saved.name || BBOX_AGENT_INIT_NAME,
      }));
    } catch (e) {
      setError('打开模型配置失败：' + (e?.message || e));
    } finally {
      setAgentBusy(false);
    }
  };

  const resetBboxAgent = () => {
    setCfg((prev) => ({
      ...prev,
      bboxAgentConfigId: '',
      bboxAgentName: '',
      bboxAiUserPrompt: BBOX_AI_USER_PROMPT,
    }));
  };

  // —— 配置 反推提示词 AI 模型（与 BBox AI 同款：openAgentEditor 弹窗，systemPrompt 在 preset 内配置） ——
  const configurePromptReverseAgent = async () => {
    if (!AS?.openAgentEditor) { setError('宿主未提供 openAgentEditor'); return; }
    setAgentBusy(true);
    setError('');
    try {
      const saved = await AS.openAgentEditor({
        initialName: PROMPT_REVERSE_AGENT_INIT_NAME,
        initialPrompt: PROMPT_REVERSE_SYSTEM_PROMPT,
        agentId: cfg.promptReverseAgentConfigId || undefined,
      });
      if (!saved) { setAgentBusy(false); return; }
      setCfg((prev) => ({
        ...prev,
        promptReverseAgentConfigId: saved.id,
        promptReverseAgentName: saved.name || PROMPT_REVERSE_AGENT_INIT_NAME,
      }));
    } catch (e) {
      setError('打开模型配置失败：' + (e?.message || e));
    } finally {
      setAgentBusy(false);
    }
  };

  const resetPromptReverseAgent = () => {
    setCfg((prev) => ({
      ...prev,
      promptReverseAgentConfigId: '',
      promptReverseAgentName: '',
      promptReverseUserPrompt: PROMPT_REVERSE_USER_PROMPT,
    }));
  };

  // —— 配置 提示词优化 AI 模型（与反推同款：openAgentEditor 弹窗，systemPrompt 在 preset 内配置） ——
  const configurePromptOptimizeAgent = async () => {
    if (!AS?.openAgentEditor) { setError('宿主未提供 openAgentEditor'); return; }
    setAgentBusy(true);
    setError('');
    try {
      const saved = await AS.openAgentEditor({
        initialName: PROMPT_OPTIMIZE_AGENT_INIT_NAME,
        initialPrompt: PROMPT_OPTIMIZE_SYSTEM_PROMPT,
        agentId: cfg.promptOptimizeAgentConfigId || undefined,
      });
      if (!saved) { setAgentBusy(false); return; }
      setCfg((prev) => ({
        ...prev,
        promptOptimizeAgentConfigId: saved.id,
        promptOptimizeAgentName: saved.name || PROMPT_OPTIMIZE_AGENT_INIT_NAME,
      }));
    } catch (e) {
      setError('打开模型配置失败：' + (e?.message || e));
    } finally {
      setAgentBusy(false);
    }
  };

  const resetPromptOptimizeAgent = () => {
    setCfg((prev) => ({
      ...prev,
      promptOptimizeAgentConfigId: '',
      promptOptimizeAgentName: '',
      promptOptimizeUserPrompt: PROMPT_OPTIMIZE_USER_PROMPT,
    }));
  };

  // 打开工作流选择器：拉取列表
  const openPicker = async (slotKey) => {
    setPickingSlot(slotKey);
    setWorkflowLoading(true);
    try {
      const resp = await AS.callPluginTool(BUILTIN_PLUGIN, 'list_workflows', { page_size: 50 });
      const list = resp?.data?.workflows || resp?.result?.data?.workflows || resp?.result?.workflows || resp?.workflows || [];
      setWorkflows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setWorkflowLoading(false);
    }
  };

  const onPickWorkflow = (workflow) => {
    const slot = WORKFLOW_SLOTS.find((s) => s.key === pickingSlot);
    if (!slot) return;
    const id = workflow.workflow_id || workflow.id;
    const name = workflow.title || workflow.name || '未命名工作流';
    setCfg((prev) => ({ ...prev, [slot.idKey]: id, [slot.nameKey]: name }));
    setPickingSlot(null);
  };

  const resetSlot = (slot) => {
    setCfg((prev) => ({
      ...prev,
      [slot.idKey]: slot.defaultId,
      [slot.nameKey]: slot.defaultName,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: '94vw', maxWidth: '94vw', maxHeight: '94vh', height: '94vh' }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div className="text-sm font-semibold text-muted-foreground">工作流</div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {WORKFLOW_SLOTS.map((slot) => (
              <WorkflowSlot
                key={slot.key}
                slot={slot}
                value={cfg}
                onPick={openPicker}
                onReset={() => resetSlot(slot)}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            节点执行时会调用此处配置的工作流；未设置时使用内置默认值。
          </p>

          {/* 模型列表（文生图 / 编辑图片） */}
          <div className="mt-1 border-t border-border pt-4">
            <div className="mb-1 text-sm font-semibold text-muted-foreground">模型列表</div>
            <p className="mb-3 text-xs text-muted-foreground">
              自定义节点模型选择器的可选值。节点支持临时输入列表外的值。
            </p>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">文生图模型</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => setCfg((prev) => ({ ...prev, textToImageModels: [...DEFAULT_TEXT_TO_IMAGE_MODELS] }))}
                    title="恢复内置默认模型列表"
                  >
                    <RotateCcw className="h-3 w-3" /> 恢复默认
                  </Button>
                </div>
                <TagInput
                  value={Array.isArray(cfg.textToImageModels) ? cfg.textToImageModels : []}
                  onChange={(tags) => setCfg((prev) => ({ ...prev, textToImageModels: tags }))}
                  placeholder="输入模型名，如 gpt-image-1"
                  addLabel="添加"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">编辑图片模型</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => setCfg((prev) => ({ ...prev, editImageModels: [...DEFAULT_EDIT_IMAGE_MODELS] }))}
                    title="恢复内置默认模型列表"
                  >
                    <RotateCcw className="h-3 w-3" /> 恢复默认
                  </Button>
                </div>
                <TagInput
                  value={Array.isArray(cfg.editImageModels) ? cfg.editImageModels : []}
                  onChange={(tags) => setCfg((prev) => ({ ...prev, editImageModels: tags }))}
                  placeholder="输入模型名，如 gpt-image-1"
                  addLabel="添加"
                />
              </div>
            </div>
          </div>

          {/* 完成后通知 */}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-4">
            <div className="flex flex-col gap-0.5">
              <Label className="text-sm font-medium">完成后通知</Label>
              <span className="text-xs text-muted-foreground">节点生成成功后发送系统通知</span>
            </div>
            <Switch
              checked={!!cfg.notifyOnComplete}
              onCheckedChange={(v) => setCfg((prev) => ({ ...prev, notifyOnComplete: v }))}
            />
          </div>

          {/* BBox AI 分析配置 */}
          <div className="mt-1 border-t border-border pt-4 sm:col-span-2">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Sparkles className="h-4 w-4" /> BBox AI 分析
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition hover:border-primary disabled:opacity-60"
                  onClick={configureBboxAgent}
                  disabled={agentBusy}
                  title={cfg.bboxAgentConfigId || '未配置'}
                >
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">
                    {cfg.bboxAgentName || cfg.bboxAgentConfigId || '点击配置 AI 模型'}
                  </span>
                  {agentBusy && <span className="shrink-0 text-[10px] text-muted-foreground">打开中…</span>}
                </button>
                {cfg.bboxAgentConfigId && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={resetBboxAgent}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium">用户提示词（图片会以附件形式传给 AI）</Label>
                <Textarea
                  value={cfg.bboxAiUserPrompt ?? ''}
                  onChange={(e) => setCfg((prev) => ({ ...prev, bboxAiUserPrompt: e.target.value }))}
                  rows={3}
                  className="text-xs"
                  placeholder="请分析这张界面图像，按系统提示词的 JSON schema 输出检测结果。"
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Label className="flex flex-col gap-1">
                  <span className="text-xs font-medium">压缩阈值 (MB)</span>
                  <NumberInput
                    min={0}
                    step={0.1}
                    value={cfg.bboxCompressThresholdMB ?? 2}
                    onChange={(v) => setCfg((prev) => ({ ...prev, bboxCompressThresholdMB: v ?? 2 }))}
                    className="h-8 w-28 text-xs"
                  />
                </Label>
                <Label className="flex flex-col gap-1">
                  <span className="text-xs font-medium">压缩目标 (MB)</span>
                  <NumberInput
                    min={0.01}
                    step={0.1}
                    value={cfg.bboxCompressTargetMB ?? 1}
                    onChange={(v) => setCfg((prev) => ({ ...prev, bboxCompressTargetMB: v ?? 1 }))}
                    className="h-8 w-28 text-xs"
                  />
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                图片以 base64 附件形式传给视觉模型（需 agent runtime 支持，如 Claude/GPT-4o/Gemini）。原图体积超过「压缩阈值」时才压缩，<b>仅降体积不改尺寸</b>（AI 看到的图与画布原图坐标 1:1 同源，画布预览图不被替换）；≤ 阈值时直接用原图。「配置 AI 模型」弹窗里设置系统提示词（检测规则）。
              </p>
            </div>
          </div>

          {/* 反推提示词 AI 配置 */}
          <div className="mt-1 border-t border-border pt-4 sm:col-span-2">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Search className="h-4 w-4" /> 反推提示词 AI
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition hover:border-primary disabled:opacity-60"
                  onClick={configurePromptReverseAgent}
                  disabled={agentBusy}
                  title={cfg.promptReverseAgentConfigId || '未配置'}
                >
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">
                    {cfg.promptReverseAgentName || cfg.promptReverseAgentConfigId || '点击配置 AI 模型'}
                  </span>
                  {agentBusy && <span className="shrink-0 text-[10px] text-muted-foreground">打开中…</span>}
                </button>
                {cfg.promptReverseAgentConfigId && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={resetPromptReverseAgent}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium">用户提示词（图片会以附件形式传给 AI）</Label>
                <Textarea
                  value={cfg.promptReverseUserPrompt ?? ''}
                  onChange={(e) => setCfg((prev) => ({ ...prev, promptReverseUserPrompt: e.target.value }))}
                  rows={3}
                  className="text-xs"
                  placeholder="请对附带的每张图片分别反推一段可直接用于文生图的提示词。"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                反推提示词节点支持上传/连线多张图，AI 按顺序为每张图生成一段提示词文本。图片以 base64 附件形式传给视觉模型（需 agent runtime 支持）。「配置 AI 模型」弹窗里设置系统提示词（输出格式）。
              </p>
            </div>
          </div>

          {/* 提示词优化 AI 配置 */}
          <div className="mt-1 border-t border-border pt-4 sm:col-span-2">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Wand2 className="h-4 w-4" /> 提示词优化 AI
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition hover:border-primary disabled:opacity-60"
                  onClick={configurePromptOptimizeAgent}
                  disabled={agentBusy}
                  title={cfg.promptOptimizeAgentConfigId || '未配置'}
                >
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">
                    {cfg.promptOptimizeAgentName || cfg.promptOptimizeAgentConfigId || '点击配置 AI 模型'}
                  </span>
                  {agentBusy && <span className="shrink-0 text-[10px] text-muted-foreground">打开中…</span>}
                </button>
                {cfg.promptOptimizeAgentConfigId && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={resetPromptOptimizeAgent}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1 text-xs font-medium">
                  用户提示词模板
                  <span className="text-[10px] text-muted-foreground">（{`{prompt}`}=原始提示词，{`{direction}`}=优化方向）</span>
                </Label>
                <Textarea
                  value={cfg.promptOptimizeUserPrompt ?? ''}
                  onChange={(e) => setCfg((prev) => ({ ...prev, promptOptimizeUserPrompt: e.target.value }))}
                  rows={3}
                  className="text-xs"
                  placeholder={PROMPT_OPTIMIZE_USER_PROMPT}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                文生图/编辑图片节点提示词框右下角的「优化」图标会调用此模型：输入优化方向后，AI 返回优化结果并以 diff 形式展示新旧差异，确认后应用。纯文本调用（无图），「配置 AI 模型」弹窗里设置系统提示词（输出格式）。
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>
          )}
          <div className="pb-4" />
        </div>
      </DialogContent>

      <WorkflowListDialog
        open={!!pickingSlot}
        workflows={workflows.map(normalizeWorkflow)}
        onSelect={onPickWorkflow}
        onCreate={() => window.open('/workflows', '_blank')}
        onClose={() => setPickingSlot(null)}
      />
      {pickingSlot && workflowLoading && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-card px-4 py-2 text-sm shadow-lg">
          工作流加载中...
        </div>
      )}
    </Dialog>
  );
}
