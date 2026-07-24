import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Input, Button } from '@agent-spaces/ui';
import { getSceneTimeline } from '../utils/image-ops/cdn';
import { encodeFramesToGif } from '../utils/image-ops/gif';
import { urlToImageData } from '../utils/image-ops/io';

/**
 * 动画帧编辑器对话框。
 *
 * 用 Scene.js + @scenejs/timeline（esm.sh CDN，宿主 loadCdnModule 加载）展示序列帧时间线：
 * - 每个序列帧 = 一个 SceneItem，用 opacity 关键帧表达「t 时刻该帧可见」
 * - 时间线拖动整段色块（keyframe-group）→ scenejs 原生 item.setDelay()，重排出现时机
 * - 预览区监听 scene 的 animate 事件，按当前 time 选出应显示的帧渲染
 * - 预览区当前帧可鼠标拖拽，调整该帧的 offsetX/offsetY（存帧元数据，导出时生效）
 *
 * 导出 GIF：按 delay 排序后的帧逐张合成到统一画布尺寸的 canvas → encodeFramesToGif（gifenc）
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.frames 输入帧 URL 数组
 * @param {(urls: string[]) => void} props.onSave 导出完成回调（传 GIF URL）
 * @param {() => void} props.onClose
 */
export default function FrameEditorDialog({ open, frames, onSave, onClose }) {
  const sceneRef = useRef(null);            // Scene 实例
  const timelineRef = useRef(null);         // Timeline 实例
  const tlContainerRef = useRef(null);      // Timeline 挂载容器
  const framesMetaRef = useRef([]);         // 帧元数据真值：[{ url, delay, duration, offsetX, offsetY }]
  const dragRef = useRef(null);             // 预览区拖拽状态：{ url, startX, startY, origX, origY }
  const [ready, setReady] = useState(false);
  const [loadingLib, setLoadingLib] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  // 触发预览/元数据重渲染
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  // 当前播放时间（由 scene animate 回调驱动）
  const [currentTime, setCurrentTime] = useState(0);
  // 帧间隔(ms) 与画布尺寸（导出 GIF 用）
  const [frameInterval, setFrameInterval] = useState(100);
  const [canvasW, setCanvasW] = useState(0);
  const [canvasH, setCanvasH] = useState(0);

  const inputFrames = frames || [];

  // 计算首帧自然尺寸作为默认画布尺寸（仅一次，打开对话框时）
  useEffect(() => {
    if (!open || !inputFrames.length) return;
    if (canvasW && canvasH) return;
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    const AS = window.AgentSpaces;
    const src = AS?.proxyImageUrl ? AS.proxyImageUrl(inputFrames[0]) : inputFrames[0];
    probe.onload = () => {
      setCanvasW(probe.naturalWidth || 256);
      setCanvasH(probe.naturalHeight || 256);
    };
    probe.onerror = () => { setCanvasW(256); setCanvasH(256); };
    probe.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inputFrames[0]]);

  // 初始化/重建 Scene + Timeline（输入帧变化时）
  useEffect(() => {
    if (!open || !inputFrames.length || !canvasW || !canvasH) return;
    let cancelled = false;

    // 清理上一轮
    const cleanupPrev = () => {
      try { sceneRef.current?.off?.('animate'); } catch {}
      try { sceneRef.current?.finish?.(); } catch {}
      sceneRef.current = null;
      timelineRef.current = null;
      if (tlContainerRef.current) tlContainerRef.current.innerHTML = '';
    };
    cleanupPrev();
    setReady(false);
    setLoadError('');
    setLoadingLib(true);

    (async () => {
      try {
        const { Scene, Timeline } = await getSceneTimeline();
        if (cancelled) return;
        const durationSec = Math.max(0.05, frameInterval / 1000);
        // 帧元数据初始化（每帧 duration、delay=i*duration、偏移 0）
        const meta = inputFrames.map((url, i) => ({
          url,
          duration: durationSec,
          delay: i * durationSec,
          offsetX: 0,
          offsetY: 0,
        }));
        framesMetaRef.current = meta;

        // 构造 Scene：每个帧一个 item，0 时刻 opacity:0，该帧可见时刻 opacity:1
        const sceneOpts = {};
        const scene = new Scene({}, { selector: false, ...sceneOpts });
        inputFrames.forEach((_, i) => {
          const itemKey = `frame${i}`;
          const d = meta[i].duration;
          // 该帧在 [delay, delay+duration] 区间 opacity:1，其余 0
          scene.newItem(itemKey, { selector: false });
          scene.setItem(itemKey, 0, { opacity: 0 });
          scene.setItem(itemKey, d, { opacity: 1 });
          // delay 由 SceneItem 自身 setDelay 控制（时间线拖动会改它）
          const item = scene.getItem(itemKey);
          item.setDelay(meta[i].delay);
        });
        // 监听播放时间，驱动预览
        scene.on('animate', (e) => {
          setCurrentTime(e.time || 0);
        });

        sceneRef.current = scene;
        if (tlContainerRef.current) {
          const timeline = new Timeline(scene, tlContainerRef.current, {
            keyboard: true,
            onSelect: () => { /* 用户拖动后 scene item 的 delay 已更新 */ },
          });
          timelineRef.current = timeline;
        }
        setReady(true);
      } catch (err) {
        console.error('scenejs timeline load failed:', err);
        if (!cancelled) setLoadError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoadingLib(false);
      }
    })();

    return () => {
      cancelled = true;
      cleanupPrev();
    };
    // 依赖：打开 + 帧 URL 列表 + 画布尺寸。帧间隔变化不重建 Scene（只影响导出）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(inputFrames), canvasW, canvasH]);

  // 同步 frameInterval 到已存在的帧元数据 duration（不重建 Scene，避免丢失拖拽）
  const applyFrameInterval = useCallback((ms) => {
    setFrameInterval(ms);
    const sec = Math.max(0.05, ms / 1000);
    const meta = framesMetaRef.current;
    if (meta.length && Math.abs(meta[0].duration - sec) > 1e-4) {
      meta.forEach((m, i) => { m.duration = sec; m.delay = i * sec; });
    }
  }, []);

  // 读取当前各帧的 delay（从 scene item 反读，反映用户时间线拖动后的真实顺序）
  const readOrderedMeta = useCallback(() => {
    const scene = sceneRef.current;
    const meta = framesMetaRef.current;
    if (!scene || !meta.length) return meta.map((m, i) => ({ ...m }));
    const items = meta.map((m, i) => {
      const item = scene.getItem(`frame${i}`);
      const delay = typeof item?.getDelay === 'function' ? (item.getDelay() || 0) : m.delay;
      return { ...m, delay };
    });
    return items.sort((a, b) => a.delay - b.delay);
  }, []);

  // 当前时间应显示的帧（delay <= time 的最后一帧；无则不显示）
  const currentFrame = useMemo(() => {
    if (!inputFrames.length) return null;
    const ordered = readOrderedMeta();
    let pick = null;
    for (const m of ordered) {
      if (m.delay <= currentTime + 1e-4) pick = m;
      else break;
    }
    return pick;
  }, [inputFrames.length, readOrderedMeta, currentTime]);

  // 预览区当前帧拖拽：调整该帧 offsetX/offsetY
  const onPreviewMouseDown = useCallback((e) => {
    if (!currentFrame) return;
    e.preventDefault();
    dragRef.current = {
      url: currentFrame.url,
      startX: e.clientX,
      startY: e.clientY,
      origX: currentFrame.offsetX,
      origY: currentFrame.offsetY,
    };
  }, [currentFrame]);

  useEffect(() => {
    if (!dragRef.current) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const meta = framesMetaRef.current;
      const target = meta.find((m) => m.url === d.url);
      if (target) {
        target.offsetX = Math.round(d.origX + dx);
        target.offsetY = Math.round(d.origY + dy);
        bump();
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [bump]);

  // 导出 GIF
  const handleExport = useCallback(async () => {
    if (!framesMetaRef.current.length || !canvasW || !canvasH) return;
    setExporting(true);
    setExportError('');
    try {
      const ordered = readOrderedMeta();
      const AS = window.AgentSpaces;
      const proxy = AS?.proxyImageUrl ? AS.proxyImageUrl.bind(AS) : null;
      // 逐帧 url → ImageData
      const loaded = await Promise.all(ordered.map(async (m) => {
        const url = proxy ? proxy(m.url) : m.url;
        return { ...m, imageData: await urlToImageData(url) };
      }));
      // 合成到统一画布尺寸：每帧 ImageData 先放回临时 canvas（drawImage 不接受 ImageData），
      // 再按 (offsetX, offsetY) drawImage 到统一画布，得到尺寸一致的 ImageData[] 供 GIF 编码。
      const cw = Math.max(1, canvasW);
      const ch = Math.max(1, canvasH);
      const composed = loaded.map((m) => {
        const src = document.createElement('canvas');
        src.width = m.imageData.width;
        src.height = m.imageData.height;
        src.getContext('2d').putImageData(m.imageData, 0, 0);
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(src, m.offsetX, m.offsetY);
        return ctx.getImageData(0, 0, cw, ch);
      });
      const blob = await encodeFramesToGif(composed, Math.max(20, Math.round(frameInterval)));
      const file = new File([blob], `frames-${Date.now()}.gif`, { type: 'image/gif' });
      if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
      const uploaded = await AS.uploadFile(file);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('上传未返回 URL');
      onSave?.([httpUrl]);
      onClose?.();
    } catch (err) {
      console.error('export gif failed:', err);
      setExportError(err?.message || String(err));
    } finally {
      setExporting(false);
    }
  }, [canvasW, canvasH, frameInterval, readOrderedMeta, onSave, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="!w-[90vw] !max-w-[90vw] max-h-[92vh] gap-0 p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>🎞️ 动画帧编辑器</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                帧间隔
                <Input
                  type="number"
                  min={20}
                  max={2000}
                  value={frameInterval}
                  onChange={(e) => applyFrameInterval(Number(e.target.value) || 100)}
                  className="!h-7 w-20"
                />
                <span className="text-muted-foreground">ms</span>
              </label>
              <label className="flex items-center gap-1">
                画布
                <Input
                  type="number"
                  min={1}
                  value={canvasW}
                  onChange={(e) => setCanvasW(Number(e.target.value) || 0)}
                  className="!h-7 w-20"
                />
                <span className="text-muted-foreground">×</span>
                <Input
                  type="number"
                  min={1}
                  value={canvasH}
                  onChange={(e) => setCanvasH(Number(e.target.value) || 0)}
                  className="!h-7 w-20"
                />
              </label>
              <Button size="sm" disabled={!ready || exporting} onClick={handleExport}>
                {exporting ? '导出中…' : '导出 GIF'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
            </div>
          </div>
        </DialogHeader>

        {loadError && (
          <p className="px-4 py-2 text-xs text-red-500 bg-red-500/10">
            编辑器加载失败：{loadError}（请检查网络能否访问 esm.sh）
          </p>
        )}
        {exportError && (
          <p className="px-4 py-2 text-xs text-red-500 bg-red-500/10">导出失败：{exportError}</p>
        )}

        {/* 预览区 + 时间线 */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 预览区：深色背景，相对定位，当前帧可拖拽调偏移 */}
          <div className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden bg-neutral-900">
            {loadingLib && <span className="text-sm text-muted-foreground">加载编辑器…</span>}
            {!loadingLib && !inputFrames.length && (
              <span className="text-sm text-muted-foreground">无输入帧</span>
            )}
            {currentFrame && (
              <div
                onMouseDown={onPreviewMouseDown}
                className="absolute cursor-move select-none"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${currentFrame.offsetX}px, ${currentFrame.offsetY}px)`,
                }}
                title="拖动调整该帧位置"
              >
                <img
                  src={currentFrame.url}
                  alt=""
                  draggable={false}
                  className="max-h-[60vh] max-w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            )}
            {/* 当前帧信息 */}
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-1 text-[11px] text-white">
              {currentFrame
                ? `帧 #${inputFrames.indexOf(currentFrame.url) + 1} · 时间 ${currentTime.toFixed(2)}s · 偏移 (${currentFrame.offsetX}, ${currentFrame.offsetY})`
                : `时间 ${currentTime.toFixed(2)}s`}
            </div>
          </div>

          {/* scenejs-timeline 挂载容器：拖色块改 delay，Space 播放/暂停 */}
          <div
            ref={tlContainerRef}
            className="nodrag nopan nowheel h-[260px] shrink-0 border-t border-border bg-black"
          />
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          时间线：拖动色块调整帧出现时机 · 预览区：拖动图片调整 x/y 偏移 · 键盘 Space 播放/暂停 · 导出按「帧间隔」生成 GIF
        </div>
      </DialogContent>
    </Dialog>
  );
}
