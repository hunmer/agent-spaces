// 设置面板：
// - 用户资料（称呼、背景）
// - AI 角色：多个 agent 配置，通过宿主 openAgentEditor 创建/编辑，radio 切换当前角色
// - 语音合成：provider + voiceId + 工作流（经宿主选择器选择）
//
// 参考 stickerGenerator/src/components/SettingsDialog.jsx 的 openAgentEditor +
// 宿主工作流选择模式。人设（prompts）区块已按需求移除。
import React, { useState } from 'react';
import { AGENT_INIT_NAME, AGENT_INIT_PROMPT } from '../utils/constants';

const {
  Label, Button, Input, Switch,
  Workflow, Bot, Check, Plus, Pencil, Trash2, Loader2, RotateCcw,
} = window.AgentSpacesUI;
const AS = window.AgentSpaces;

export default function SettingsPanel({ store }) {
  const { settings, updateSettings, setView, ttsProviders } = store;
  const [error, setError] = useState('');
  const [agentBusy, setAgentBusy] = useState(false); // openAgentEditor 进行中

  const agents = settings.agents || [];

  // ===== Agent：新建或编辑，统一走宿主 openAgentEditor =====
  const configureAgent = async (existing) => {
    setAgentBusy(true);
    setError('');
    try {
      const saved = await AS.openAgentEditor({
        initialName: AGENT_INIT_NAME,
        initialPrompt: AGENT_INIT_PROMPT,
        agentId: existing?.id || undefined,
      });
      if (!saved) return; // 用户取消
      const item = {
        id: saved.id,
        name: saved.name || AGENT_INIT_NAME,
        modelProvider: saved.modelProvider || '',
      };
      // upsert：同 id 覆盖，否则追加
      const next = agents.some((a) => a.id === item.id)
        ? agents.map((a) => (a.id === item.id ? item : a))
        : [...agents, item];
      updateSettings({ agents: next, currentAgentId: item.id });
    } catch (e) {
      setError('打开 AI 角色配置失败：' + (e?.message || e));
    } finally {
      setAgentBusy(false);
    }
  };

  const selectAgent = (id) => updateSettings({ currentAgentId: id });

  const removeAgent = (id) => {
    const next = agents.filter((a) => a.id !== id);
    updateSettings({
      agents: next,
      currentAgentId: settings.currentAgentId === id ? (next[0]?.id || '') : settings.currentAgentId,
    });
  };

  // ===== TTS 工作流选择 =====
  const openWorkflowPicker = async () => {
    try {
      const workflow = await AS.openWorkflowListDialog();
      if (!workflow) return;
      updateSettings({
        ttsWorkflowId: workflow.id || workflow.workflow_id,
        ttsWorkflowName: workflow.name || workflow.title || '未命名工作流',
      });
    } catch (e) {
      setError('加载工作流列表失败：' + (e?.message || e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 text-white custom-scrollbar">
        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <h2 className="text-2xl font-bold text-cyan-400">系统设置</h2>
          <button onClick={() => setView('chat')} className="text-gray-400 hover:text-white text-2xl">
            ✕
          </button>
        </div>

        {/* 用户资料 */}
        <section className="mb-8">
          <h3 className="text-lg font-bold mb-4">👤 用户资料</h3>
          <div className="grid gap-4">
            <Label>
              <span className="text-sm text-gray-300">你的称呼</span>
              <Input
                value={settings.userName}
                onChange={(e) => updateSettings({ userName: e.target.value })}
                className="mt-1 bg-white/10 border-white/20 text-white"
              />
            </Label>
            <Label>
              <span className="text-sm text-gray-300">背景 URL</span>
              <Input
                value={settings.backgroundUrl}
                onChange={(e) => updateSettings({ backgroundUrl: e.target.value })}
                className="mt-1 bg-white/10 border-white/20 text-white"
              />
            </Label>
          </div>
        </section>

        {/* AI 角色（多 agent，openAgentEditor 管理） */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">🤖 AI 角色</h3>
            <button
              type="button"
              onClick={() => configureAgent(null)}
              disabled={agentBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow"
            >
              {agentBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              新建角色
            </button>
          </div>

          {agents.length === 0 && (
            <div className="text-sm text-gray-400 bg-white/5 border border-white/10 rounded p-4">
              还没有 AI 角色。点击右上「新建角色」配置一个（模型、API Key、系统提示词），对话将通过{' '}
              <code>agent_run</code> 调用该角色。
            </div>
          )}

          <div className="space-y-2">
            {agents.map((a) => {
              const active = settings.currentAgentId === a.id;
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 p-3 rounded border ${
                    active ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <input
                    type="radio"
                    checked={active}
                    onChange={() => selectAgent(a.id)}
                    className="accent-cyan-400"
                  />
                  <Bot className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{a.name}</div>
                    {a.modelProvider && (
                      <div className="text-xs text-gray-400 truncate">{a.modelProvider}</div>
                    )}
                  </div>
                  {active && <Check className="w-4 h-4 text-cyan-300" />}
                  <button
                    onClick={() => configureAgent(a)}
                    disabled={agentBusy}
                    className="text-gray-400 hover:text-cyan-300 px-1"
                    title="编辑"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeAgent(a.id)}
                    className="text-gray-400 hover:text-red-400 px-1"
                    title="移除（仅从本应用解绑，不删除 agent）"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            「新建/编辑」会唤起宿主 Agent 配置弹窗；「移除」只解绑，不删除已保存的 agent。
          </p>
        </section>

        {/* 语音合成（provider + voiceId + 工作流） */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">🎙️ 语音合成</h3>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-sm text-gray-300">
                {settings.ttsEnabled === false ? '已关闭' : '已开启'}
              </span>
              <Switch
                checked={settings.ttsEnabled !== false}
                onCheckedChange={(v) => updateSettings({ ttsEnabled: v })}
              />
            </label>
          </div>
          <div className="grid gap-4">
            <div>
              <Label className="text-sm text-gray-300">服务商</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {ttsProviders.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => updateSettings({ ttsProvider: p.id })}
                    className={`px-3 py-1.5 rounded-md text-sm border transition ${
                      settings.ttsProvider === p.id
                        ? 'border-cyan-500 bg-cyan-500/10 text-white'
                        : 'border-white/20 text-gray-300 hover:border-cyan-400/50'
                    }`}
                  >
                    {p.icon} {p.name}
                  </button>
                ))}
              </div>
            </div>

            <Label>
              <span className="text-sm text-gray-300">
                发音人 ID（fish-audio=referenceId / minimax=voiceId / qianyin=speakerId）
              </span>
              <Input
                value={settings.ttsVoiceId}
                onChange={(e) => updateSettings({ ttsVoiceId: e.target.value })}
                placeholder="留空则使用服务商默认音色"
                className="mt-1 bg-white/10 border-white/20 text-white"
              />
            </Label>

            {/* TTS 工作流入口 */}
            <div>
              <Label className="text-sm text-gray-300">语音工作流</Label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={openWorkflowPicker}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-white/20 bg-white/5 hover:border-cyan-400/50 transition text-left"
                  title={settings.ttsWorkflowId || '未设置'}
                >
                  <Workflow className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                  <span className="flex-1 truncate">
                    {settings.ttsWorkflowName || settings.ttsWorkflowId || '点击选择工作流'}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateSettings({
                      ttsWorkflowId: '',
                      ttsWorkflowName: '',
                    })
                  }
                  title="清空"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                语音由此工作流（<code>execute_workflow_sync</code>）生成，入参 prompt/model/voiceId。
              </div>
            </div>
          </div>
        </section>

        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>

    </div>
  );
}
