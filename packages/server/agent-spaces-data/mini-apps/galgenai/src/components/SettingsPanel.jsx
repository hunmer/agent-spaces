// 移植自原 SettingsPanel.tsx，移除：
// - Browser/MiniMax/CustomGET 三种 TTS 配置 UI（API key/voice 列表/speed 滑块）
// - ttsConfigs 多条目管理
// 新增：
// - TTS provider 单选 + voiceId 输入（对齐 text_to_voice 工作流入参）
// - AI 预设（agent preset）选择，来自 list_agent_presets
import React, { useEffect, useState } from 'react';
import { listAgentPresets } from '../utils/agent';

export default function SettingsPanel({ store }) {
  const { settings, updateSettings, setView, ttsProviders } = store;

  const [presets, setPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);

  // 新增 persona 表单
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPresetsLoading(true);
    listAgentPresets()
      .then((list) => {
        if (!cancelled) {
          setPresets(Array.isArray(list) ? list : []);
          // 如果当前未选，默认选第一个
          if (!settings.agentConfigId && list.length > 0) {
            updateSettings({ agentConfigId: list[0].id });
          }
        }
      })
      .catch((e) => console.warn('[settings] 拉取 agent presets 失败：', e))
      .finally(() => {
        if (!cancelled) setPresetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddPrompt = () => {
    if (!newPromptName.trim() || !newPromptContent.trim()) return;
    const newPrompt = {
      id: `p-${Date.now()}`,
      name: newPromptName.trim(),
      content: newPromptContent.trim(),
    };
    updateSettings({ prompts: [...settings.prompts, newPrompt] });
    setNewPromptName('');
    setNewPromptContent('');
  };

  const updateExistingPrompt = (id, content) => {
    updateSettings({
      prompts: settings.prompts.map((p) => (p.id === id ? { ...p, content } : p)),
    });
  };

  const deletePrompt = (id) => {
    if (settings.prompts.length <= 1) return;
    const next = settings.prompts.filter((p) => p.id !== id);
    const nextCurrent = settings.currentPromptId === id ? next[0]?.id || '' : settings.currentPromptId;
    updateSettings({ prompts: next, currentPromptId: nextCurrent });
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

        {/* AI 预设 */}
        <section className="mb-8">
          <h3 className="text-lg font-bold mb-4">🤖 AI 预设（agent_run）</h3>
          <label className="block">
            <span className="text-sm text-gray-300">选择模型预设</span>
            <select
              value={settings.agentConfigId}
              onChange={(e) => updateSettings({ agentConfigId: e.target.value })}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded px-3 py-2 outline-none focus:border-cyan-400"
              disabled={presetsLoading}
            >
              {presetsLoading && <option value="">加载中…</option>}
              {!presetsLoading && presets.length === 0 && <option value="">（无可用预设）</option>}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.runtimeKind || p.modelProvider || 'preset'})
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-gray-400">
            对话通过 <code>agent_run</code> 节点执行，预设来自 <code>list_agent_presets</code>。
          </p>
        </section>

        {/* 用户资料 */}
        <section className="mb-8">
          <h3 className="text-lg font-bold mb-4">👤 用户资料</h3>
          <div className="grid gap-4">
            <label className="block">
              <span className="text-sm text-gray-300">你的称呼</span>
              <input
                type="text"
                value={settings.userName}
                onChange={(e) => updateSettings({ userName: e.target.value })}
                className="mt-1 w-full bg-white/10 border border-white/20 rounded px-3 py-2 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-300">背景 URL</span>
              <input
                type="text"
                value={settings.backgroundUrl}
                onChange={(e) => updateSettings({ backgroundUrl: e.target.value })}
                className="mt-1 w-full bg-white/10 border border-white/20 rounded px-3 py-2 outline-none focus:border-cyan-400"
              />
            </label>
          </div>
        </section>

        {/* TTS（简化版） */}
        <section className="mb-8">
          <h3 className="text-lg font-bold mb-4">🎙️ 语音合成（text_to_voice 工作流）</h3>
          <div className="grid gap-3">
            <div>
              <span className="text-sm text-gray-300 block mb-1">服务商</span>
              <div className="flex flex-wrap gap-2">
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
            <label className="block">
              <span className="text-sm text-gray-300">
                发音人 ID（fish-audio=referenceId / minimax=voiceId / qianyin=speakerId）
              </span>
              <input
                type="text"
                value={settings.ttsVoiceId}
                onChange={(e) => updateSettings({ ttsVoiceId: e.target.value })}
                placeholder="留空则使用服务商默认音色"
                className="mt-1 w-full bg-white/10 border border-white/20 rounded px-3 py-2 outline-none focus:border-cyan-400"
              />
            </label>
            <p className="text-xs text-gray-400">
              语音由 <code>text_to_voice</code> 工作流生成（id: 820bf3b7-9d50-4f6d-966d-8e442960a233）。
            </p>
          </div>
        </section>

        {/* 人设 / Prompts */}
        <section className="mb-8">
          <h3 className="text-lg font-bold mb-4">📜 人设 / Prompts</h3>
          <div className="space-y-4">
            {settings.prompts.map((prompt) => (
              <div
                key={prompt.id}
                className={`flex flex-col p-4 rounded border ${
                  settings.currentPromptId === prompt.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={settings.currentPromptId === prompt.id}
                      onChange={() => updateSettings({ currentPromptId: prompt.id })}
                      className="accent-cyan-400"
                    />
                    <span className="font-bold">{prompt.name}</span>
                  </div>
                  {settings.prompts.length > 1 && (
                    <button onClick={() => deletePrompt(prompt.id)} className="text-red-400 hover:text-red-300 px-2">
                      🗑️
                    </button>
                  )}
                </div>
                <textarea
                  value={prompt.content}
                  onChange={(e) => updateExistingPrompt(prompt.id, e.target.value)}
                  className="w-full h-24 bg-black/30 border border-white/20 rounded px-3 py-2 text-sm outline-none resize-y"
                />
              </div>
            ))}

            <div className="border-t border-white/10 pt-4 mt-2">
              <h4 className="text-sm font-bold text-gray-400 mb-2">创建新人设</h4>
              <div className="grid gap-2">
                <input
                  type="text"
                  placeholder="人设名称"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded px-3 py-2 text-sm outline-none"
                />
                <textarea
                  placeholder="系统指令…"
                  value={newPromptContent}
                  onChange={(e) => setNewPromptContent(e.target.value)}
                  className="w-full h-20 bg-white/10 border border-white/20 rounded px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={handleAddPrompt}
                  className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-sm font-bold w-fit"
                >
                  添加人设
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
