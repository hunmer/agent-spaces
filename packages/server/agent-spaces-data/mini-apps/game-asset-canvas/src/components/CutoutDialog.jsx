import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Label, Loader,
} from '@agent-spaces/ui';
import { Scissors } from '@agent-spaces/ui';
import {
  CUTOUT_MODES, CUTOUT_PARAMS, DEFAULT_CUTOUT_MODE, defaultCutoutParams,
} from '../utils/constants';
import ParamField from './nodes/ParamField';

/**
 * 抠图对话框（轻量版）：模式 select + 参数表 + 执行。
 *
 * 执行逻辑由外部注入（onRun），避免与节点状态机/取消机制耦合。onRun 接收单图调用，
 * 内部按需并发/串行；本组件按输入顺序对齐产出（失败项 null）。
 *
 * @param {boolean} props.open
 * @param {string[]} props.inputImages 输入图 URL
 * @param {string} [props.initialMode] 初始模式
 * @param {(mode:string, modeParams:object, urls:string[]) => Promise<string[]>} props.onRun
 *   执行回调，返回产出图 URL 数组（顺序与 urls 对齐，失败可为 null/缺失）。
 *   注：调用方按单图调用以便对齐，组件会逐张调用。
 * @param {() => void} props.onClose
 */
export default function CutoutDialog({
  open, inputImages = [], initialMode, onRun, onClose,
}) {
  const [mode, setMode] = useState(initialMode || DEFAULT_CUTOUT_MODE);
  const [modeParams, setModeParams] = useState(() => defaultCutoutParams(initialMode || DEFAULT_CUTOUT_MODE));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // 并发抠图数量（仅多图时可调，单图固定 1）。本地算法单图很快无影响；云端/rembg 限流避免压后端。
  const okCount = inputImages.filter(Boolean).length;
  const [concurrency, setConcurrency] = useState(okCount > 1 ? Math.min(4, okCount) : 1);
  // 输入图数量变化时，把并发数夹到合法区间
  useEffect(() => {
    if (okCount <= 1) return;
    setConcurrency((c) => Math.max(1, Math.min(c, okCount)));
  }, [okCount]);

  const paramDefs = useMemo(() => CUTOUT_PARAMS[mode] || [], [mode]);
  const modeMeta = CUTOUT_MODES.find((m) => m.value === mode) || CUTOUT_MODES[0];

  const handleModeChange = useCallback((m) => {
    setMode(m);
    setModeParams(defaultCutoutParams(m));
    setError('');
  }, []);

  const setParam = useCallback((key, value) => {
    setModeParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleRun = useCallback(async () => {
    if (typeof onRun !== 'function') { setError('未注入执行回调'); return; }
    const urls = (inputImages || []).filter(Boolean);
    if (!urls.length) { setError('没有输入图'); return; }
    setRunning(true);
    setError('');
    setProgress({ done: 0, total: urls.length });
    try {
      // 并发限流：按 concurrency 同时跑，保证产出顺序与输入对齐；单张失败置 null 不阻塞。
      const out = new Array(urls.length).fill(null);
      let done = 0;
      let idx = 0;
      const limit = Math.max(1, Math.min(concurrency, urls.length));
      const worker = async () => {
        while (true) {
          const i = idx++;
          if (i >= urls.length) return;
          try {
            const v = await onRun(mode, modeParams || {}, [urls[i]]);
            out[i] = Array.isArray(v) ? (v[0] || null) : (v || null);
          } catch (err) {
            out[i] = null;
            console.warn('[cutout-dialog] item failed:', i, err);
          }
          done += 1;
          setProgress({ done, total: urls.length });
        }
      };
      await Promise.all(Array.from({ length: limit }, worker));
      const okCount = out.filter(Boolean).length;
      if (!okCount) throw new Error('全部抠图失败');
      onClose?.({ ok: true, urls: out });
    } catch (err) {
      console.error('[cutout-dialog] run failed:', err);
      setError(err?.message || String(err));
    } finally {
      setRunning(false);
    }
  }, [inputImages, mode, modeParams, concurrency, onRun, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !running) onClose?.(); }}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-4 py-2 !gap-0">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            <DialogTitle className="text-sm">抠图</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              {okCount > 0 ? `${okCount} 张` : '无输入图'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-4">
          <Label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">抠图模式</span>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value)}
              disabled={running}
              className="rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
            >
              {CUTOUT_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </Label>

          {modeMeta?.desc && (
            <p className="text-[10px] leading-snug text-muted-foreground">{modeMeta.desc}</p>
          )}

          {paramDefs.map((p) => (
            <ParamField
              key={p.key}
              param={p}
              value={modeParams[p.key] ?? p.default}
              allParams={modeParams}
              onChange={(v) => setParam(p.key, v)}
            />
          ))}

          {/* 并行抠图数量（仅多图时显示）：本地算法单图很快；云端/rembg 限流避免压后端 */}
          {okCount > 1 && (
            <Label className="flex flex-col gap-1 text-xs">
              <span className="flex items-center justify-between text-muted-foreground">
                <span>并行抠图数量</span>
                <span className="text-foreground">{concurrency} / {okCount}</span>
              </span>
              <input
                type="range"
                min={1}
                max={okCount}
                step={1}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                disabled={running}
                className="w-full"
              />
              <span className="text-[10px] text-muted-foreground">
                同时处理 {concurrency} 张，{Math.ceil(okCount / concurrency)} 批完成
              </span>
            </Label>
          )}

          {error && (
            <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
          )}
          {running && (
            <p className="flex items-center gap-2 text-xs text-primary">
              <Loader className="h-3.5 w-3.5" />
              抠图中 {progress.done}/{progress.total}…
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onClose?.()} disabled={running}>
            取消
          </Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={handleRun} disabled={running || !okCount}>
            <Scissors className="h-3.5 w-3.5" />
            {running ? '处理中…' : `执行抠图${okCount ? `（${okCount}）` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
