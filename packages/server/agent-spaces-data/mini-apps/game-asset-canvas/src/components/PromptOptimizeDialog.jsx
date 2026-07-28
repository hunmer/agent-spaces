import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Textarea, DiffViewer, Wand2, Loader2,
} from '@agent-spaces/ui';
import { runPromptOptimizeAgent } from '../utils/workflow';

/**
 * 提示词优化对话框。
 *
 * 流程：展示当前提示词 → 输入优化方向 → 调 agent → diff 展示新旧差异 → 确认应用 / 放弃。
 * agent 输出格式（见 PROMPT_OPTIMIZE_SYSTEM_PROMPT）：第一行=优化后提示词，空行，后续=改了什么说明。
 * 本组件取第一段非空行作为「新提示词」回填，整段 diff 用于直观对比。
 *
 * @param {{
 *   open: boolean,
 *   prompt: string,                 // 当前提示词（原始）
 *   agentConfig?: { id, userPrompt }, // 来自 settings；无 id 时禁用提交并提示去设置
 *   onClose: () => void,
 *   onApply: (newPrompt: string) => void,
 * }} props
 */
export default function PromptOptimizeDialog({ open, prompt = '', agentConfig, onClose, onApply }) {
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');      // AI 整段返回（提示词 + 说明）
  const [newPrompt, setNewPrompt] = useState(''); // 提取出的新提示词（首段非空行）
  const abortRef = useRef(null);

  // 打开/关闭时重置状态
  useEffect(() => {
    if (open) {
      setDirection('');
      setLoading(false);
      setError('');
      setResult('');
      setNewPrompt('');
    } else {
      // 关闭时中断进行中的请求
      try { abortRef.current?.abort(); } catch {}
      abortRef.current = null;
    }
  }, [open]);

  const configured = !!agentConfig?.id;

  // 从 AI 整段返回里提取「优化后提示词」：第一段非空行（到第一个空行止）
  const extractNewPrompt = useCallback((full) => {
    if (!full) return '';
    const lines = full.split('\n');
    const buf = [];
    for (const line of lines) {
      if (line.trim() === '') {
        if (buf.length) break; // 遇到首个空行且已收集到内容，结束
        continue;              // 跳过开头空行
      }
      buf.push(line);
    }
    return buf.join('\n').trim();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!configured) {
      setError('未配置提示词优化 AI 模型，请先到「设置 → 提示词优化 AI」配置');
      return;
    }
    if (!prompt.trim()) {
      setError('当前提示词为空，无法优化');
      return;
    }
    setLoading(true);
    setError('');
    setResult('');
    setNewPrompt('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const full = await runPromptOptimizeAgent(agentConfig, prompt, direction, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const extracted = extractNewPrompt(full);
      if (!extracted) {
        setError('AI 未返回有效提示词，原始返回：' + full.slice(0, 200));
        return;
      }
      setResult(full);
      setNewPrompt(extracted);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [configured, prompt, direction, agentConfig, extractNewPrompt]);

  const handleApply = useCallback(() => {
    if (!newPrompt) return;
    onApply?.(newPrompt);
    onClose?.();
  }, [newPrompt, onApply, onClose]);

  const handleCancel = useCallback(() => {
    try { abortRef.current?.abort(); } catch {}
    onClose?.();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: 'min(720px, 92vw)', maxWidth: '92vw', maxHeight: '88vh' }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <DialogHeader className="flex-row items-center gap-2 px-6 pt-6">
          <Wand2 className="h-4 w-4 text-primary" />
          <DialogTitle className="text-base">优化提示词</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-3">
          {/* 当前提示词（只读） */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">当前提示词</span>
            <pre className="nodrag nopan nowheel max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 text-xs leading-relaxed">
{prompt || '(空)'}
            </pre>
          </div>

          {/* 优化方向 */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">优化方向</span>
            <Textarea
              className="nodrag nopan nowheel text-sm"
              rows={3}
              placeholder="如：更写实一点；增加电影感光影；改成赛博朋克风；补充材质细节"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>
          )}

          {/* diff 结果 */}
          {result && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">优化对比（左=原 / 右=新）</span>
              <div className="nodrag nopan nowheel overflow-hidden rounded-md">
                <DiffViewer
                  layout="split"
                  hideOld
                  wrap
                  oldCode={prompt}
                  newCode={newPrompt}
                  newTitle="优化后"
                  className="text-xs"
                />
              </div>
              {newPrompt && result.slice(extractNewPrompt(result).length).trim() && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium">AI 说明：</span>
                  {result.slice(extractNewPrompt(result).length).trim()}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3 mb-3">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={loading}>
            取消
          </Button>
          {result ? (
            <Button size="sm" onClick={handleApply} disabled={!newPrompt}>
              应用优化结果
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={loading || !configured || !prompt.trim()}>
              {loading ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />优化中…</> : '✨ 开始优化'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
