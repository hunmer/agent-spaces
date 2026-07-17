// 移植自原 components/ChatInterface.tsx：
// - sendMessageToGemini -> buildAgentPrompt + runAgent（@agent-spaces/builtin/agent_run）
// - playTTS(内置) -> synthesizeSpeech + playAudioUrl（text_to_voice 工作流）
import React, { useEffect, useRef, useState } from 'react';
import { buildAgentPrompt, runAgent } from '../utils/agent';
import { synthesizeSpeech, playAudioUrl } from '../utils/tts';
import { splitThink, extractMotions } from '../utils/message';

const { Popover, PopoverContent, PopoverTrigger } = window.AgentSpacesUI;

// AI 回复中的 <think> 思考内容，默认折叠
function ThinkBlock({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 rounded-lg border border-white/15 bg-black/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-200 hover:bg-white/5 transition"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span>思考过程</span>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 text-xs text-gray-300 whitespace-pre-wrap border-t border-white/10">
          {text}
        </div>
      )}
    </div>
  );
}

// 自动滚动到消息列表底部
function useScrollToBottom(deps) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export default function ChatInterface({ store }) {
  const {
    settings,
    messages,
    addMessage,
    clearMessages,
    setView,
    availableMotions,
    triggerMotion,
  } = store;

  const currentModel = settings.models.find((m) => m.id === settings.currentModelId);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false); // 清空二次确认
  const [pendingImages, setPendingImages] = useState([]); // 待发送的图片 [{file, previewUrl}]
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  // 消息有变化或正在输入时，自动滚到底
  const messagesRef = useScrollToBottom([messages, isTyping]);

  useEffect(() => () => {
    try { audioRef.current?.pause?.(); } catch { /* noop */ }
    // 释放待发送图片的预览 URL，避免内存泄漏
    setPendingImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  // 点击清空确认弹层外区域时收起
  useEffect(() => {
    if (!confirmClear) return undefined;
    const onDocClick = () => setConfirmClear(false);
    const id = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', onDocClick);
    };
  }, [confirmClear]);

  // 选择图片（多选）
  const handlePickImages = (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const next = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPendingImages((prev) => [...prev, ...next]);
    e.target.value = ''; // 允许重复选同一文件
  };

  const removePendingImage = (idx) => {
    setPendingImages((prev) => {
      URL.revokeObjectURL(prev[idx]?.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && pendingImages.length === 0) || isTyping) return;

    if (!settings.currentAgentId) {
      setError('请先在设置里配置并选择一个 AI 角色');
      setView('settings');
      return;
    }

    setError('');
    setIsTyping(true);
    setInputText('');

    // 上传图片（若有）
    let uploadedImages = [];
    if (pendingImages.length > 0) {
      try {
        setUploading(true);
        const AS = window.AgentSpaces;
        uploadedImages = await Promise.all(
          pendingImages.map(async (img) => {
            const res = await AS.uploadFile(img.file);
            return {
              name: img.file.name,
              path: res?.path || '',
              httpPath: res?.httpPath || res?.url || '',
              previewUrl: img.previewUrl, // 保留预览，用于用户消息气泡
            };
          }),
        );
      } catch (e) {
        setIsTyping(false);
        setUploading(false);
        setError('图片上传失败：' + (e?.message || e));
        return;
      } finally {
        setUploading(false);
      }
    }

    // 用户消息：文本 + 图片预览标记
    const userContent = text || (uploadedImages.length > 0 ? '（仅图片）' : '');
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userContent,
      images: uploadedImages.map((i) => i.previewUrl).filter(Boolean),
      timestamp: Date.now(),
    };
    await addMessage(userMsg);

    // 清空待发送图片（预览 URL 转移到已发送消息里，不释放）
    setPendingImages([]);

    try {
      const prompt = buildAgentPrompt({
        // 人设区块已移除：角色风格由 agent 自身的 systemPrompt 决定，
        // 这里只拼装用户称呼、动作规则、历史和本次输入。
        systemInstruction: '',
        userName: settings.userName,
        history: messages,
        userInput: text,
        availableMotions,
        images: uploadedImages,
      });

      const responseText = await runAgent({
        agentConfigId: settings.currentAgentId,
        prompt,
        permissionMode: 'dontAsk',
      });

      // 提取所有 [动作名] 标签：触发动作（取最后一个作为主动作），并从显示/朗读内容中剔除
      const { motions: matchedMotions, content: motionStripped } =
        extractMotions(responseText, availableMotions);
      let contentToDisplay = motionStripped;
      if (matchedMotions.length > 0) {
        // 取最后一个动作作为主动作（最终姿态）
        triggerMotion(matchedMotions[matchedMotions.length - 1]);
      }

      const aiMsg = {
        id: `a-${Date.now() + 1}`,
        role: 'model',
        content: contentToDisplay,
        timestamp: Date.now(),
      };
      await addMessage(aiMsg);

      // TTS：总开关关闭则跳过；失败不阻塞对话
      if (settings.ttsEnabled === false) {
        return;
      }
      // TTS 只朗读正文，去掉 <think> 段，避免朗读思考内容
      const { content: ttsContent } = splitThink(contentToDisplay);
      try {
        setTtsPlaying(true);
        const url = await synthesizeSpeech({
          text: ttsContent,
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

  const speakerName = currentModel?.name || 'AI Assistant';

  return (
    <div className="relative w-full h-full flex flex-col justify-end pb-4 pointer-events-none">
      {/* 顶部菜单（顶部居中）。用 fixed 全屏层 + flex 居中，规避 translate 类失效。 */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 pointer-events-none"
        style={{ position: 'fixed' }}
      >
        <div className="flex gap-2 pointer-events-auto items-start">
        {/* Motions Popover */}
        {availableMotions.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="p-3 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 transition flex items-center gap-1"
                title="切换动作"
              >
                💃
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              side="bottom"
              className="!w-48 !max-h-72 overflow-y-auto p-1 bg-popover/95 text-popover-foreground backdrop-blur border-border custom-scrollbar"
            >
              {availableMotions.map((m, i) => (
                <button
                  key={`${m.label}-${i}`}
                  onClick={() => triggerMotion(m.label)}
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition truncate"
                  title={m.label}
                >
                  {m.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
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
      </div>

      {/* 状态条（工具栏下方，避免重叠） */}
      {(error || ttsPlaying) && (
        <div
          className="fixed top-0 left-0 right-0 z-40 flex justify-center pt-20 pointer-events-none"
          style={{ position: 'fixed' }}
        >
          <div className={`pointer-events-auto px-3 py-1 rounded-full text-sm ${error ? 'bg-red-500/80' : 'bg-cyan-600/80'} text-white shadow`}>
            {error || '正在合成语音…'}
          </div>
        </div>
      )}

      {/* 底部对话框 */}
      <div className="w-full max-w-4xl mx-auto px-4 z-40 pointer-events-auto">
        <div className="glass-panel rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-[160px]">
          <div className="flex items-center justify-between pr-2">
            <div className="bg-cyan-600/80 text-white px-6 py-1 text-sm font-bold rounded-br-xl shadow-md">
              {speakerName}
            </div>
            {/* 清空当前会话消息 */}
            <div className="relative">
              {messages.length > 0 && (
                <button
                  onClick={() => setConfirmClear((v) => !v)}
                  className="text-xs px-2.5 py-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition"
                  title="清空当前对话"
                >
                  🗑️ 清空
                </button>
              )}
              {confirmClear && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-black/90 border border-white/15 rounded-lg p-2 shadow-xl text-xs">
                  <div className="text-white/80 mb-2 whitespace-nowrap">确认清空当前对话？</div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="px-2 py-1 rounded text-white/70 hover:bg-white/10"
                    >
                      取消
                    </button>
                    <button
                      onClick={async () => {
                        await clearMessages();
                        setConfirmClear(false);
                      }}
                      className="px-2 py-1 rounded bg-red-500/80 hover:bg-red-500 text-white"
                    >
                      清空
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            ref={messagesRef}
            className="p-4 flex-grow text-white leading-relaxed drop-shadow-md max-h-[40vh] overflow-y-auto space-y-3 custom-scrollbar"
          >
            {messages.length === 0 && !isTyping && (
              <div className="text-white/50 text-base px-2">输入消息开始对话…</div>
            )}

            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const { think, content } = isUser ? { think: '', content: msg.content } : splitThink(msg.content);
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-base whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-br-sm shadow-lg shadow-cyan-900/30'
                      : 'bg-white/10 text-white rounded-bl-sm border border-white/10'
                  }`}>
                    {!isUser && (
                      <div className="text-xs font-bold text-cyan-300 mb-1">{speakerName}</div>
                    )}
                    {think && <ThinkBlock text={think} />}
                    {Array.isArray(msg.images) && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {msg.images.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`img-${i}`}
                            className="w-24 h-24 object-cover rounded-md border border-white/20"
                          />
                        ))}
                      </div>
                    )}
                    {content || (!think && (!msg.images || msg.images.length === 0) ? '...' : '')}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white/10 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1 opacity-60">
                    <span className="w-2 h-2 bg-white rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 待发送图片预览条 */}
          {pendingImages.length > 0 && (
            <div className="bg-black/20 px-2 pt-2 flex gap-2 flex-wrap border-t border-white/10">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={img.previewUrl}
                    alt="pending"
                    className="w-16 h-16 object-cover rounded-md border border-white/20"
                  />
                  <button
                    onClick={() => removePendingImage(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow hover:bg-red-400"
                    title="移除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-black/20 p-2 flex gap-2 items-center border-t border-white/10">
            {/* 图片上传 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePickImages}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isTyping || uploading}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-lg text-white transition"
              title="上传图片"
            >
              {uploading ? <span className="text-xs">…</span> : <span className="text-lg">🖼️</span>}
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingImages.length > 0 ? '为图片添加说明（可选），回车发送…' : '输入消息，回车发送…'}
              className="flex-grow min-w-0 bg-white/10 text-white placeholder-white/50 px-4 py-2 rounded-lg outline-none focus:bg-white/20 transition"
            />
            <button
              onClick={handleSend}
              disabled={isTyping || uploading || (!inputText.trim() && pendingImages.length === 0)}
              className="flex-shrink-0 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold transition shadow-lg"
            >
              {uploading ? '上传中' : '➤'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
