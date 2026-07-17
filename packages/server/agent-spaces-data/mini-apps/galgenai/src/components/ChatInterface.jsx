// 移植自原 components/ChatInterface.tsx：
// - sendMessageToGemini -> buildAgentPrompt + runAgent（@agent-spaces/builtin/agent_run）
// - playTTS(内置) -> synthesizeSpeech + playAudioUrl（text_to_voice 工作流）
import React, { useEffect, useRef, useState } from 'react';
import { buildAgentPrompt, runAgent } from '../utils/agent';
import { synthesizeSpeech, playAudioUrl } from '../utils/tts';

export default function ChatInterface({ store }) {
  const {
    settings,
    messages,
    addMessage,
    setView,
    availableMotions,
    triggerMotion,
  } = store;

  const currentModel = settings.models.find((m) => m.id === settings.currentModelId);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);

  // 自动滚到底（消息区在父层，这里只做轻提示）
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  useEffect(() => () => {
    try { audioRef.current?.pause?.(); } catch { /* noop */ }
  }, []);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;

    if (!settings.currentAgentId) {
      setError('请先在设置里配置并选择一个 AI 角色');
      setView('settings');
      return;
    }

    setError('');
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    await addMessage(userMsg);
    setInputText('');
    setIsTyping(true);

    try {
      const prompt = buildAgentPrompt({
        // 人设区块已移除：角色风格由 agent 自身的 systemPrompt 决定，
        // 这里只拼装用户称呼、动作规则、历史和本次输入。
        systemInstruction: '',
        userName: settings.userName,
        history: messages,
        userInput: text,
        availableMotions,
      });

      const responseText = await runAgent({
        agentConfigId: settings.currentAgentId,
        prompt,
        permissionMode: 'dontAsk',
      });

      // 解析 [MotionName] 前缀
      let contentToDisplay = responseText;
      const motionMatch = String(responseText).match(/^\[([^\]]+)\]\s*([\s\S]*)/);
      if (motionMatch) {
        const motionName = motionMatch[1];
        contentToDisplay = motionMatch[2];
        if (availableMotions.includes(motionName)) {
          triggerMotion(motionName);
        } else {
          console.warn('[chat] AI 请求了不存在的动作：', motionName);
        }
      }

      const aiMsg = {
        id: `a-${Date.now() + 1}`,
        role: 'model',
        content: contentToDisplay,
        timestamp: Date.now(),
      };
      await addMessage(aiMsg);

      // TTS：失败不阻塞对话
      try {
        setTtsPlaying(true);
        const url = await synthesizeSpeech({
          text: contentToDisplay,
          provider: settings.ttsProvider,
          voiceId: settings.ttsVoiceId,
          workflowId: settings.ttsWorkflowId,
        });
        if (url) {
          try { audioRef.current?.pause?.(); } catch { /* noop */ }
          audioRef.current = playAudioUrl(url);
        }
      } catch (e) {
        console.warn('[chat] TTS 失败：', e);
      } finally {
        setTtsPlaying(false);
      }
    } catch (e) {
      console.error('[chat] 发送失败：', e);
      setError(e?.message || '发送失败');
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const speakerName = lastMessage?.role === 'user' ? settings.userName : currentModel?.name || 'AI Assistant';

  return (
    <div className="relative w-full h-full flex flex-col justify-end pb-4 pointer-events-none">
      {/* 顶部菜单 */}
      <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto z-50">
        <button
          onClick={() => setView('model-library')}
          className="p-3 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 transition"
          title="切换模型"
        >
          🧸
        </button>
        <button onClick={() => setView('chat')} className="p-3 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 transition" title="对话">
          🏠
        </button>
        <button onClick={() => setView('history')} className="p-3 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 transition" title="记忆">
          📜
        </button>
        <button onClick={() => setView('settings')} className="p-3 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 transition" title="设置">
          ⚙️
        </button>
      </div>

      {/* 状态条 */}
      {(error || ttsPlaying) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className={`px-3 py-1 rounded-full text-sm ${error ? 'bg-red-500/80' : 'bg-cyan-600/80'} text-white shadow`}>
            {error || '正在合成语音…'}
          </div>
        </div>
      )}

      {/* 底部对话框 */}
      <div className="w-full max-w-4xl mx-auto px-4 z-40 pointer-events-auto">
        <div className="glass-panel rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-[160px]">
          <div className="bg-cyan-600/80 text-white px-6 py-1 text-sm font-bold w-fit rounded-br-xl shadow-md">
            {speakerName}
          </div>

          <div className="p-6 flex-grow text-lg text-white font-medium leading-relaxed drop-shadow-md max-h-[40vh] overflow-y-auto">
            {isTyping ? (
              <div className="flex gap-2 opacity-50">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
              </div>
            ) : (
              lastMessage?.content || "输入消息开始对话…"
            )}
          </div>

          <div className="bg-black/20 p-2 flex gap-2 border-t border-white/10">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息，回车发送…"
              className="flex-grow min-w-0 bg-white/10 text-white placeholder-white/50 px-4 py-2 rounded-lg outline-none focus:bg-white/20 transition"
            />
            <button
              onClick={handleSend}
              disabled={isTyping || !inputText.trim()}
              className="flex-shrink-0 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold transition shadow-lg"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
