import { useCallback, useRef, useState } from 'react';
import { Crop, Dialog, DialogContent, DialogTitle, toast } from '@agent-spaces/ui';
import { trimVideo, normalizeTrimRange } from '../utils/video-trim';

/**
 * 视频裁剪对话框（视频展示节点 toolbar 入口用）。
 *
 * - 视频预览下方是可拖拽的区间选择条：拖左右手柄（或点击条上离哪端近设哪端）选起止，
 *   与下方数字输入双向同步；「取当前」取播放器当前位置。
 * - 模式：精确重编码（默认）/ 快速剪切（流复制，切点对齐关键帧）。
 * - 编辑态持久化：{ start, end, fast } 存节点 data.trimData（经 onUpdate 回写）。
 *
 * props:
 * - open / onClose  对话框开关
 * - videoUrl        当前视频 URL
 * - trimData        { start, end, fast } 节点持久化的裁剪状态
 * - onUpdate        节点 data patch 回调（写 trimData）
 * - onConfirm(url)  裁剪完成，产物 http URL
 */
export default function TrimVideoDialog({ open, videoUrl, trimData, onUpdate, onClose, onConfirm }) {
  const videoRef = useRef(null);
  const barRef = useRef(null);
  const dragWhichRef = useRef(null); // 拖拽中的端点：'start' | 'end' | null
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const range = normalizeTrimRange(trimData?.start, trimData?.end, duration || trimData?.duration);
  const fast = trimData?.fast === true;
  const setRange = useCallback((patch) => {
    onUpdate?.({ trimData: { start: range.start, end: range.end, fast, duration: duration || undefined, ...patch } });
  }, [duration, fast, onUpdate, range.end, range.start]);

  const seekTo = useCallback((t) => {
    const v = videoRef.current;
    if (v && Number.isFinite(t)) v.currentTime = Math.max(0, t);
  }, []);

  // —— 区间条拖拽（pointer capture 绑在条容器上） ——
  const timeFromEvent = useCallback((event) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || !duration) return null;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const applyDrag = useCallback((t) => {
    const which = dragWhichRef.current;
    if (!which) return;
    if (which === 'start') setRange({ start: Math.min(t, range.end - 0.05) });
    else setRange({ end: Math.max(t, range.start + 0.05) });
  }, [range.end, range.start, setRange]);

  const handleBarPointerDown = useCallback((event) => {
    const t = timeFromEvent(event);
    if (t == null) return;
    event.stopPropagation();
    // 点击条：离哪端近就设哪端，随后的 move 持续跟随
    dragWhichRef.current = Math.abs(t - range.start) <= Math.abs(t - range.end) ? 'start' : 'end';
    applyDrag(t);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [applyDrag, range.end, range.start, timeFromEvent]);

  const handleBarPointerMove = useCallback((event) => {
    if (!dragWhichRef.current) return;
    event.stopPropagation();
    const t = timeFromEvent(event);
    if (t != null) applyDrag(t);
  }, [applyDrag, timeFromEvent]);

  const handleBarPointerUp = useCallback((event) => {
    if (!dragWhichRef.current) return;
    event.stopPropagation();
    dragWhichRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleApply = useCallback(async () => {
    if (!videoUrl || busy) return;
    if (!(range.end > range.start)) {
      toast.warning('请先设置有效的起点和终点');
      return;
    }
    setBusy(true);
    try {
      const url = await trimVideo(videoUrl, range.start, range.end, { fast });
      onConfirm?.(url);
      onClose?.();
    } catch (err) {
      toast.error(`视频裁剪失败：${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  }, [busy, fast, onClose, onConfirm, range.end, range.start, videoUrl]);

  const pct = (t) => (duration > 0 ? `${(t / duration) * 100}%` : '0%');
  const inputClass = 'w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary';
  const linkClass = 'shrink-0 text-[11px] text-primary transition hover:underline disabled:opacity-50';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose?.()}>
      <DialogContent className="flex w-[420px] max-w-[420px] flex-col gap-3 p-4 nodrag nopan nowheel">
        <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
          <Crop className="h-4 w-4 text-primary" />
          裁剪视频
        </DialogTitle>

        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="max-h-[36vh] w-full rounded-md bg-black object-contain"
            onLoadedMetadata={(e) => setDuration(e.currentTarget?.duration || 0)}
          />
        )}

        {/* 区间选择条：拖手柄/点击设起止，双击条预览起点 */}
        <div
          ref={barRef}
          className="relative h-6 cursor-pointer touch-none select-none"
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          onPointerCancel={handleBarPointerUp}
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/80"
            style={{ left: pct(range.start), width: `calc(${pct(range.end)} - ${pct(range.start)})` }}
          />
          {(['start', 'end']).map((which) => (
            <div
              key={which}
              role="slider"
              aria-label={which === 'start' ? '裁剪起点' : '裁剪终点'}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={which === 'start' ? range.start : range.end}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-background bg-primary shadow"
              style={{ left: pct(which === 'start' ? range.start : range.end) }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">起点（秒）</span>
              <input
                type="number" min="0" max={duration || undefined} step="0.01"
                value={Number(range.start.toFixed(2))}
                onChange={(e) => setRange({ start: Number(e.target.value) })}
                className={inputClass}
              />
            </label>
            <button type="button" className={linkClass} onClick={() => setRange({ start: videoRef.current?.currentTime || 0 })}>取当前</button>
            <button type="button" className={linkClass} onClick={() => seekTo(range.start)}>预览</button>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">终点（秒）</span>
              <input
                type="number" min="0" max={duration || undefined} step="0.01"
                value={Number(range.end.toFixed(2))}
                onChange={(e) => setRange({ end: Number(e.target.value) })}
                className={inputClass}
              />
            </label>
            <button type="button" className={linkClass} onClick={() => setRange({ end: videoRef.current?.currentTime || 0 })}>取当前</button>
            <button type="button" className={linkClass} onClick={() => seekTo(range.end)}>预览</button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {duration ? `视频总长 ${duration.toFixed(2)}s · ` : ''}
            裁剪区间 {(range.end - range.start).toFixed(2)}s
          </p>
        </div>

        {/* 模式：快速剪切（流复制）/ 精确重编码 */}
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={fast}
              onChange={(e) => setRange({ fast: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary"
            />
            <span>快速剪切（不重编码，切点对齐关键帧）</span>
          </label>
          <span className="text-[10px] text-muted-foreground">
            {fast ? '速度最快，产物起止点可能与所选区间有零点几秒偏差。' : '默认逐帧精确定位（重编码），长视频耗时较长。'}
          </span>
        </div>

        <button
          type="button"
          disabled={!videoUrl || busy || !(range.end > range.start)}
          onClick={handleApply}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? '裁剪中…' : '应用裁剪'}
        </button>
      </DialogContent>
    </Dialog>
  );
}
