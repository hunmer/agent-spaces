// AI 对话组件：走 list_agent_presets + agent_run（替代 web 侧 HTTP chat 接口）。
// 沙箱不可用 FloatingChatPanel / AgentDialog，用 window.AgentSpacesUI 基础组件重组浮动面板。
import { useState, useEffect, useRef } from 'react';
import { listPresets, runAgent } from '../utils/ai-chat.js';
import { T } from '../utils/constants.js';

const {
  Button,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} = window.AgentSpacesUI || {};

// cn 内联（沙箱无 @/lib/utils）
const cn = (...a) => a.filter(Boolean).join(' ');

export function DatabaseAiChat({ open, onClose, context }) {
  const [presets, setPresets] = useState([]);
  const [presetId, setPresetId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // 加载预设（list_agent_presets）
  useEffect(() => {
    let cancelled = false;
    listPresets()
      .then((p) => {
        if (cancelled) return;
        setPresets(p);
        setPresetId(p[0]?.id || '');
      })
      .catch(() => {
        if (cancelled) return;
        setPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 自动滚到底
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async () => {
    const question = input.trim();
    if (!question || !presetId || loading) return;
    const userMsg = { role: 'user', text: question };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      // 拼装上下文：当前文档标题 + 内容
      const prompt = context
        ? `文档《${context.title || ''}》内容：\n${context.content || ''}\n\n用户问题：${question}`
        : question;
      const reply = await runAgent({ agentConfigId: presetId, prompt });
      const text = typeof reply === 'string' ? reply : reply?.text || reply?.finalMessage || JSON.stringify(reply);
      setMessages((m) => [...m, { role: 'ai', text }]);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      setMessages((m) => [...m, { role: 'ai', text: `${T.aiChat}出错：${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed bottom-4 right-4 w-96 bg-background border rounded-lg shadow-xl flex flex-col"
      style={{ height: '60vh', zIndex: 50 }}
    >
      {/* 头部：Agent 选择 + 关闭 */}
      <div className="flex items-center justify-between p-2 border-b gap-2">
        <div className="flex-1 min-w-0">
          {Select ? (
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择 Agent" />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <select
              className="w-full px-2 py-1 border rounded text-sm"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              <option value="">选择 Agent</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {Button ? (
          <Button size="sm" variant="ghost" onClick={onClose} title="关闭">✕</Button>
        ) : (
          <button type="button" onClick={onClose} className="px-2 py-1 text-sm">✕</button>
        )}
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-2 space-y-2">
        {messages.length === 0 && !loading ? (
          <div className="text-xs opacity-60 text-center py-4">
            选择 Agent，输入问题开始对话（{context ? `当前文档：${context.title || '未命名'}` : '无打开文档'}）。
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={cn(m.role === 'user' ? 'text-right' : '')}>
            <span
              className={cn(
                'inline-block px-2 py-1 rounded text-sm',
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: '90%' }}
            >
              {m.text}
            </span>
          </div>
        ))}
        {loading ? <div className="text-xs opacity-60">AI 思考中…</div> : null}
      </div>

      {/* 输入区 */}
      <div className="p-2 border-t flex gap-1">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="flex-1"
          rows={2}
          placeholder="问点关于当前文档的…"
        />
        {Button ? (
          <Button onClick={send} disabled={loading || !presetId}>
            发送
          </Button>
        ) : (
          <button type="button" onClick={send} disabled={loading || !presetId} className="px-3 py-1 text-sm border rounded">
            发送
          </button>
        )}
      </div>
    </div>
  );
}
