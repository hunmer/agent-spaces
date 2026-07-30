// 设置对话框：文生图 / 图生图工作流选择 + 默认模型 + Agent 配置
// 参考 文案转分镜/Dialogs.jsx 的 SettingsDialog + AgentConfigButton 模式
import {
  WORKFLOW_SLOTS, MODEL_OPTIONS,
  AGENT_INIT_NAME, AGENT_INIT_PROMPT,
} from '../utils/settings';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Workflow, Bot, Check, Loader2, RotateCcw,
} = window.AgentSpacesUI;

// 工作流槽位行
function WorkflowSlot({ slot, value, onPick }) {
  const name = value[slot.nameKey] || '';
  const id = value[slot.idKey] || '';
  const usingDefault = id === slot.defaultId;
  return (
    <div className="sg-set-field">
      <Label className="sg-set-label">{slot.label}</Label>
      <button type="button" className="sg-set-slot" onClick={() => onPick(slot.key)} title={id || '未设置'}>
        <Workflow className="sg-icon-sm" />
        <span className="sg-set-slot-name">{name || id || '点击选择工作流'}</span>
        {usingDefault && <span className="sg-set-tag">默认</span>}
      </button>
      <div className="sg-set-desc">{slot.desc}</div>
    </div>
  );
}

export default function SettingsDialog({ open, value, onClose, onSave }) {
  const AS = window.AgentSpaces;
  const [cfg, setCfg] = React.useState(value || {});
  const [error, setError] = React.useState('');
  const [agentBusy, setAgentBusy] = React.useState(false);

  React.useEffect(() => {
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

  // 配置 Agent：调用宿主 openAgentEditor
  const configureAgent = async () => {
    setAgentBusy(true);
    setError('');
    try {
      const saved = await AS.openAgentEditor({
        initialName: AGENT_INIT_NAME,
        initialPrompt: AGENT_INIT_PROMPT,
        agentId: cfg.agentConfigId || undefined,
      });
      if (!saved) { setAgentBusy(false); return; }
      setCfg((prev) => ({
        ...prev,
        agentConfigId: saved.id,
        agentName: saved.name || AGENT_INIT_NAME,
        agentModelProvider: saved.modelProvider || '',
      }));
    } catch (e) {
      setError('打开 Agent 配置失败：' + (e?.message || e));
    } finally {
      setAgentBusy(false);
    }
  };

  const resetSlot = (slot) => {
    setCfg((prev) => ({
      ...prev,
      [slot.idKey]: slot.defaultId,
      [slot.nameKey]: slot.defaultName,
    }));
  };

  const patch = (p) => setCfg((prev) => ({ ...prev, ...p }));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sg-set-dialog">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <div className="sg-set-body">
          {/* 工作流配置 */}
          <div className="sg-set-section-title">工作流</div>
          {WORKFLOW_SLOTS.map((slot) => (
            <div key={slot.key} className="sg-set-slot-wrap">
              <WorkflowSlot slot={slot} value={cfg} onPick={openPicker} />
              {cfg[slot.idKey] && cfg[slot.idKey] !== slot.defaultId && (
                <Button size="sm" variant="ghost" className="sg-set-reset" onClick={() => resetSlot(slot)}>
                  <RotateCcw className="sg-icon-xs" /> 恢复默认
                </Button>
              )}
            </div>
          ))}

          {/* 默认模型 */}
          <div className="sg-set-section-title">默认模型</div>
          <div className="sg-set-field">
            <Label className="sg-set-label">生成贴图使用的模型</Label>
            <Select
              value={MODEL_OPTIONS.some((m) => m.value === cfg.defaultModel) ? cfg.defaultModel : ''}
              onValueChange={(v) => patch({ defaultModel: v })}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="选择模型" /></SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label} · {m.providerLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="sg-set-desc">在左侧控制面板未单独填写模型时使用此默认值。</div>
          </div>

          {/* Agent 配置 */}
          <div className="sg-set-section-title">AI 提示词助手</div>
          <div className="sg-set-field">
            <Label className="sg-set-label">用于 agent_run 的 Agent</Label>
            <div className="sg-set-agent-row">
              <Button variant="outline" onClick={configureAgent} disabled={agentBusy}>
                {agentBusy ? <Loader2 className="sg-icon-sm sg-spin" /> : <Bot className="sg-icon-sm" />}
                {cfg.agentConfigId ? `🤖 ${cfg.agentName || '已配置'}${cfg.agentModelProvider ? ` · ${cfg.agentModelProvider}` : ''}` : '⚙️ 配置 Agent'}
              </Button>
              {cfg.agentConfigId && <Check className="sg-icon-sm sg-set-ok" />}
            </div>
            <div className="sg-set-desc">配置后，右下角「AI 提示词助手」会调用此 Agent 生成贴图提示词。</div>
          </div>

          {error && <div className="sg-set-error">{error}</div>}
        </div>

        <div className="sg-set-foot">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(cfg)}>保存</Button>
        </div>
      </DialogContent>

    </Dialog>
  );
}
