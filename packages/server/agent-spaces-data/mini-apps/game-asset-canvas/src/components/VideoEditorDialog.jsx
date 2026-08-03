import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogTitle,
  FileUpload, Film, Trash2, FolderPlus, Loader, Download,
} from '@agent-spaces/ui';
import FrameSequencePlayer from './FrameSequencePlayer';
import { FRAME_EXTRACT_MODE_OPTIONS } from '../utils/constants';
import { composeSpriteSheet } from '../utils/image-ops/spriteSheet';
import { urlToImageData, imageDataToDataUrl, imageDataToUrl } from '../utils/image-ops/io';
import { resolveFrameSelection, updateFrameSelection } from '../utils/frame-selection';

const FFMPEG_PLUGIN_ID = 'workflow.ffmpeg';
const FFMPEG_PROBE = 'ffmpeg_probe';
const FFMPEG_EXTRACT_FRAMES = 'ffmpeg_extract_frames';
const FFMPEG_CUSTOM = 'ffmpeg_custom';
const FFMPEG_FIRST_FRAME = 'ffmpeg_first_frame';

/**
 * 视频编辑器大对话框。
 *
 * 布局：
 * ┌───────────────────────────────────────┐
 * │ 顶部：横向视频缩略图列表（上传/切换/删除）│
 * ├────────────────────────┬──────────────┤
 * │ [视频播放器][帧预览]    │ 右侧 tabs     │
 * │  主播放器区域           │ [编辑][动画组]│
 * ├────────────────────────┤              │
 * │  横向帧图片列表          │              │
 * │  单击起点/组合键终点     │              │
 * └────────────────────────┴──────────────┘
 *
 * 所有改动经 onUpdate 回写节点 data（不在 Dialog 内独存 state 源真值）。
 */
export default function VideoEditorDialog({ open, data, onUpdate, onClose }) {
  const videos = Array.isArray(data?.videos) ? data.videos.filter(Boolean) : [];
  const frames = Array.isArray(data?.frames) ? data.frames.filter(Boolean) : [];
  const animGroups = Array.isArray(data?.animGroups) ? data.animGroups : [];
  const videoInfo = data?.videoInfo || null;
  const params = data?.params || { mode: 'count', count: 8, fps: 1, interval: 2, secondsInterval: 1, maxWidth: 320 };
  const framePreviewFps = Math.max(1, Number(data?.framePreviewFps) || 10);
  const frameSelection = resolveFrameSelection(frames.length, data?.frameSelection);
  const { startFrame: selectedStartFrame, endFrame: selectedEndFrame } = frameSelection;

  const [activeTab, setActiveTab] = useState('edit');
  const [previewTab, setPreviewTab] = useState('video');
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [thumbs, setThumbs] = useState({}); // { [videoUrl]: dataUrl } 缩略图缓存

  const currentVideo = videos[Math.min(activeVideoIdx, videos.length - 1)] || videos[0] || '';

  // 获取单个视频的首帧作为缩略图（ffmpeg_first_frame → base64 dataUrl）
  const fetchingRef = useRef(new Set()); // 正在请求的 url，防重复
  const fetchThumb = useCallback(async (url) => {
    if (fetchingRef.current.has(url)) return;
    fetchingRef.current.add(url);
    try {
      const ret = await window.AgentSpaces.callPluginTool(FFMPEG_PLUGIN_ID, FFMPEG_FIRST_FRAME, { inputPath: url });
      if (ret?.success && ret?.data?.dataUrl) {
        setThumbs((prev) => ({ ...prev, [url]: ret.data.dataUrl }));
      }
    } catch (err) {
      console.warn('获取缩略图失败:', url, err?.message || err);
    } finally {
      fetchingRef.current.delete(url);
    }
  }, []);

  // videos 变化时，为缺失缩略图的视频异步获取（已有/请求中跳过）
  const videosKey = videos.join('|');
  useEffect(() => {
    for (const url of videos) {
      if (!thumbs[url]) fetchThumb(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videosKey]);

  useEffect(() => {
    if (activeVideoIdx > videos.length - 1) setActiveVideoIdx(Math.max(0, videos.length - 1));
  }, [videos.length, activeVideoIdx]);

  // 切换视频时清空上一个视频的帧列表 / 动画组 / 探测信息（帧与视频绑定，不跨视频残留）
  useEffect(() => {
    setPreviewTab('video');
    onUpdate?.({ frames: [], framesDir: '', frameSelection: null, animGroups: [], videoInfo: null, error: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideo]);

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  // 上传视频（FileUpload onChange：接收已上传或待上传的文件列表，追加去重）
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      onUpdate?.({ error: '宿主 uploadFile 不可用' });
      return;
    }
    const urls = [];
    const pending = [];
    for (const item of files || []) {
      const f = item?.file;
      if (!f) continue;
      // 已上传过的（带 url/httpPath）直接复用
      const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
      if (existing) { urls.push(existing); continue; }
      if (f instanceof File) pending.push(f);
    }
    if (pending.length) {
      setBusy(true); setBusyMsg('上传视频中…');
      try {
        for (const f of pending) {
          const up = await AS.uploadFile(f);
          const httpUrl = up?.url || up?.httpPath;
          if (httpUrl) urls.push(httpUrl);
        }
      } catch (err) {
        onUpdate?.({ error: `上传失败：${err?.message || err}` });
        return;
      } finally {
        setBusy(false); setBusyMsg('');
      }
    }
    if (urls.length) {
      const merged = Array.from(new Set([...videos, ...urls]));
      onUpdate?.({ videos: merged });
    }
  }, [videos, onUpdate]);

  // 探测视频信息
  const handleProbe = useCallback(async () => {
    if (!currentVideo) return;
    setBusy(true); setBusyMsg('解析视频信息…');
    try {
      const ret = await window.AgentSpaces.callPluginTool(FFMPEG_PLUGIN_ID, FFMPEG_PROBE, {
        inputPath: currentVideo,
      });
      if (ret?.success && ret?.data) {
        onUpdate?.({ videoInfo: ret.data });
      } else {
        onUpdate?.({ error: ret?.message || '解析失败' });
      }
    } catch (err) {
      onUpdate?.({ error: `解析失败：${err?.message || err}` });
    } finally {
      setBusy(false); setBusyMsg('');
    }
  }, [currentVideo, onUpdate]);

  // 截取帧
  const handleExtractFrames = useCallback(async () => {
    if (!currentVideo) return;
    setBusy(true); setBusyMsg('截取帧中…（可能需要几十秒）');
    try {
      const ret = await window.AgentSpaces.callPluginTool(FFMPEG_PLUGIN_ID, FFMPEG_EXTRACT_FRAMES, {
        inputPath: currentVideo,
        mode: params.mode || 'count',
        count: Number(params.count) || 8,
        fps: Number(params.fps) || 1,
        interval: Math.max(1, Math.floor(Number(params.interval) || 1)),
        secondsInterval: Math.max(0.01, Number(params.secondsInterval) || 1),
        maxWidth: params.maxWidth ? Number(params.maxWidth) : undefined,
      });
      if (ret?.success && Array.isArray(ret?.data?.frames)) {
        const nextFrames = ret.data.frames;
        onUpdate?.({
          frames: nextFrames,
          framesDir: ret.data.dir || '',
          frameSelection: { startFrame: 0, endFrame: Math.max(0, nextFrames.length - 1) },
        });
        setPreviewTab('frames');
      } else {
        onUpdate?.({ error: ret?.message || '截帧失败' });
      }
    } catch (err) {
      onUpdate?.({ error: `截帧失败：${err?.message || err}` });
    } finally {
      setBusy(false); setBusyMsg('');
    }
  }, [currentVideo, params, onUpdate]);

  // 调整尺寸（自定义 ffmpeg 命令）
  const [resizeW, setResizeW] = useState('');
  const [resizeH, setResizeH] = useState('');
  const handleResize = useCallback(async () => {
    if (!currentVideo) return;
    const w = resizeW ? Number(resizeW) : -1;
    const h = resizeH ? Number(resizeH) : -1;
    if (w === -1 && h === -1) return;
    setBusy(true); setBusyMsg('调整尺寸中…');
    try {
      const vf = `scale=${w}:${h}`;
      const ret = await window.AgentSpaces.callPluginTool(FFMPEG_PLUGIN_ID, FFMPEG_CUSTOM, {
        inputPath: currentVideo,
        args: `-vf ${vf} -c:a copy`,
        outputExt: 'mp4',
      });
      if (ret?.success && ret?.data?.httpPath) {
        // 产出视频追加到列表并切换
        const merged = Array.from(new Set([...videos, ret.data.httpPath]));
        onUpdate?.({ videos: merged, output: { video: ret.data.httpPath } });
        setActiveVideoIdx(merged.length - 1);
      } else {
        onUpdate?.({ error: ret?.message || '调整失败' });
      }
    } catch (err) {
      onUpdate?.({ error: `调整失败：${err?.message || err}` });
    } finally {
      setBusy(false); setBusyMsg('');
    }
  }, [currentVideo, resizeW, resizeH, videos, onUpdate]);

  // —— 动画组操作 ——
  const addGroup = useCallback(() => {
    if (!frames.length || selectedEndFrame < selectedStartFrame) {
      onUpdate?.({ error: '请先在帧列表中选择有效的起点和终点' });
      return;
    }
    const group = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `动画组 ${animGroups.length + 1}`,
      frames: [],
      startFrame: selectedStartFrame,
      endFrame: selectedEndFrame,
      fps: framePreviewFps,
    };
    onUpdate?.({ animGroups: [...animGroups, group], error: undefined });
  }, [animGroups, framePreviewFps, frames.length, onUpdate, selectedEndFrame, selectedStartFrame]);

  const updateGroup = useCallback((id, patch) => {
    onUpdate?.({
      animGroups: animGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });
  }, [animGroups, onUpdate]);

  const deleteGroup = useCallback((id) => {
    onUpdate?.({ animGroups: animGroups.filter((g) => g.id !== id) });
  }, [animGroups, onUpdate]);

  const selectFrameBoundary = useCallback((event, frameIdx) => {
    const setEnd = event.ctrlKey || event.metaKey;
    const nextSelection = updateFrameSelection(frameSelection, frameIdx, setEnd);
    onUpdate?.({ frameSelection: nextSelection, error: undefined });
    setPreviewTab('frames');
  }, [frameSelection, onUpdate]);

  // —— 精灵图合成（sheet）——
  // 行/列布局：持久化到 data.sheetLayout，作为输出精灵图的全局网格设置
  const sheetLayout = data?.sheetLayout || { rows: 1, cols: 4 };
  const setSheetLayout = useCallback((patch) => {
    onUpdate?.({ sheetLayout: { ...sheetLayout, ...patch } });
  }, [sheetLayout, onUpdate]);

  // 取某动画组实际参与的帧（startFrame..endFrame 闭区间，按序截取）
  const groupFrames = useCallback((g) => {
    if (!frames.length) return [];
    const s = Math.max(0, Math.min(g.startFrame ?? 0, frames.length - 1));
    const e = Math.max(0, Math.min(g.endFrame ?? 0, frames.length - 1));
    if (e < s) return [];
    return frames.slice(s, e + 1);
  }, [frames]);

  // 合成精灵图预览（DataURL，不上传）：用于动画组下方实时展示
  // 输入帧 URL → ImageData → composeSpriteSheet → dataUrl
  const [sheetBusyId, setSheetBusyId] = useState(null);
  const composeSheetDataUrl = useCallback(async (g) => {
    const fs = groupFrames(g);
    if (fs.length < 1) return null;
    setSheetBusyId(g.id);
    try {
      const imgs = await Promise.all(fs.map((u) => urlToImageData(u)));
      const cols = Math.max(1, Math.floor(sheetLayout.cols || 4));
      const sheet = composeSpriteSheet(imgs, { columns: cols });
      return imageDataToDataUrl(sheet);
    } catch (err) {
      console.warn('精灵图预览合成失败:', err?.message || err);
      return null;
    } finally {
      setSheetBusyId(null);
    }
  }, [groupFrames, sheetLayout.cols]);

  // 输出到画布：把每个有效动画组合成精灵图并上传，收集 URL 写入 data.output.images（节点统一输出约定）
  const handleExportSheets = useCallback(async () => {
    const valid = animGroups.filter((g) => groupFrames(g).length > 0);
    if (!valid.length) {
      onUpdate?.({ error: '没有可导出的动画组（需先设置起止帧）' });
      return;
    }
    setBusy(true); setBusyMsg('合成精灵图并输出…');
    try {
      const urls = [];
      for (const g of valid) {
        const fs = groupFrames(g);
        const imgs = await Promise.all(fs.map((u) => urlToImageData(u)));
        const cols = Math.max(1, Math.floor(sheetLayout.cols || 4));
        const sheet = composeSpriteSheet(imgs, { columns: cols });
        const url = await imageDataToUrl(sheet);
        urls.push(url);
      }
      // output.images 是节点输出的统一约定（下游图片节点据此消费）
      onUpdate?.({ output: { images: urls }, status: 'done', error: undefined });
    } catch (err) {
      onUpdate?.({ error: `输出失败：${err?.message || err}` });
    } finally {
      setBusy(false); setBusyMsg('');
    }
  }, [animGroups, groupFrames, sheetLayout.cols, onUpdate]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] flex max-h-[92vh] flex-col gap-0 p-0 nodrag nopan nowheel">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Film className="h-4 w-4 text-primary" />
            视频编辑器
          </DialogTitle>
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <Loader className="h-3 w-3 animate-spin" />
              {busyMsg || '处理中…'}
            </span>
          )}
        </div>

        {/* 缩略图列表样式（视频列表已移入左侧栏，不再占整行顶栏） */}
        <style>{`
          .video-thumb-upload { width: 96px; flex: 0 0 96px; }
          .video-thumb-upload > div:first-child {
            width: 96px; height: 56px; min-height: 56px; padding: 4px; gap: 2px; border-radius: 6px;
          }
          .video-thumb-upload > div:first-child > svg { width: 16px; height: 16px; }
          .video-thumb-upload > div:first-child > div > p:first-child { font-size: 10px; line-height: 12px; }
          .video-thumb-upload > div:first-child > div > p:not(:first-child) { display: none; }
          .video-thumb-delete {
            position: absolute; top: 2px; right: 2px; z-index: 20;
            display: flex; width: 20px; height: 20px; align-items: center; justify-content: center;
            padding: 0; border: 0; border-radius: 4px; cursor: pointer;
            color: #fff; background: rgba(0, 0, 0, 0.78); opacity: 1; visibility: visible;
          }
          .video-thumb-delete:hover { background: rgb(220, 38, 38); }
          .video-thumb-delete > svg { width: 12px; height: 12px; }
        `}</style>

        {/* 主体：左侧栏（视频列表 + 播放器 + 帧列表）/ 右侧 tabs */}
        <div className="flex min-h-0 flex-1">
          {/* 左侧栏：纵向视频缩略图列表（属于左侧栏，不占整行/不在右侧面板上方） */}
          <aside className="flex w-[132px] shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/20 p-2">
            {/* 上传入口 */}
            <FileUpload
              value={[]}
              onChange={handleFilesChange}
              accept={{ 'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv'] }}
              maxFiles={0}
              placeholder="+ 视频"
              className="video-thumb-upload mb-2"
            />
            {videos.length === 0 ? (
              <span className="text-[10px] leading-tight text-muted-foreground">上传或从上游连线接收</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {videos.map((url, i) => {
                  // 上游接收的视频（source=upstream）不允许删除；其余（用户上传/历史）均可删
                  const canDelete = data?.source !== 'upstream';
                  return (
                    <div
                      key={url + i}
                      className={`relative h-14 w-full cursor-pointer overflow-hidden rounded border-2 transition ${i === activeVideoIdx ? 'border-primary' : 'border-transparent hover:border-border'}`}
                      onClick={() => setActiveVideoIdx(i)}
                    >
                      {thumbs[url] ? (
                        <img src={thumbs[url]} alt={`视频 ${i + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                          <Film className="h-4 w-4 opacity-40" />
                        </div>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white">
                        #{i + 1}
                      </span>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdate?.({ videos: videos.filter((_, j) => j !== i) });
                          }}
                          className="video-thumb-delete"
                          aria-label={`移除视频 ${i + 1}`}
                          title="移除"
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          {/* 中部：双播放器 + 帧列表 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex border-b border-border bg-muted/20 px-3 pt-2">
              {[
                ['video', '视频播放器'],
                ['frames', '帧预览'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreviewTab(key)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${previewTab === key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center bg-black/90 p-3" style={{ minHeight: 300 }}>
              {previewTab === 'video' ? (
                currentVideo ? (
                  <video key={currentVideo} src={currentVideo} controls className="max-h-[320px] max-w-full" />
                ) : (
                  <span className="text-xs text-white/50">选择左侧视频或上传</span>
                )
              ) : (
                <FrameSequencePlayer
                  frames={frames}
                  startFrame={selectedStartFrame}
                  endFrame={selectedEndFrame}
                  fps={framePreviewFps}
                  onFpsChange={(value) => onUpdate?.({ framePreviewFps: value })}
                  className="w-full max-w-3xl"
                />
              )}
            </div>

            {/* 横向帧图片列表 */}
            <div className="flex min-h-0 flex-1 flex-col border-t border-border">
              <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  帧列表 {frames.length > 0 && `（${frames.length}）`}
                </span>
                <span className="text-[10px] text-muted-foreground">单击设置起点，Ctrl/Command + 单击设置终点</span>
              </div>
              <div className="flex flex-1 gap-1.5 overflow-x-auto overflow-y-hidden p-2">
                {frames.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                    暂无帧，到「编辑」tab 点「截取帧」
                  </div>
                ) : frames.map((url, i) => {
                  const isStart = i === selectedStartFrame;
                  const isEnd = i === selectedEndFrame;
                  const inRange = selectedEndFrame >= selectedStartFrame && i >= selectedStartFrame && i <= selectedEndFrame;
                  return (
                    <button
                      type="button"
                      key={url + i}
                      onClick={(event) => selectFrameBoundary(event, i)}
                      className={`relative h-20 w-28 shrink-0 overflow-hidden rounded border-2 transition ${isStart ? 'border-emerald-500' : isEnd ? 'border-red-500' : inRange ? 'border-primary/60' : 'border-transparent hover:border-border'}`}
                      title={isStart ? `起点：${i}` : isEnd ? `终点：${i}` : `帧 ${i}`}
                    >
                      <img src={url} alt={`frame ${i}`} className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[9px] text-white">{i}</span>
                      {isStart && <span className="absolute left-0 top-0 bg-emerald-600 px-1 text-[9px] text-white">起</span>}
                      {isEnd && <span className="absolute right-0 top-0 bg-red-600 px-1 text-[9px] text-white">终</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右侧 tabs */}
          <div className="flex w-[360px] shrink-0 flex-col border-l border-border">
            <div className="flex border-b border-border">
              {[['edit', '编辑'], ['anim', '动画组']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition ${activeTab === key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {activeTab === 'edit' ? (
                <EditTab
                  params={params}
                  set={set}
                  videoInfo={videoInfo}
                  onProbe={handleProbe}
                  onExtract={handleExtractFrames}
                  resizeW={resizeW} setResizeW={setResizeW}
                  resizeH={resizeH} setResizeH={setResizeH}
                  onResize={handleResize}
                  hasVideo={!!currentVideo}
                />
              ) : (
                <AnimTab
                  groups={animGroups}
                  frames={frames}
                  selectedStartFrame={selectedStartFrame}
                  selectedEndFrame={selectedEndFrame}
                  sheetLayout={sheetLayout}
                  onSetSheetLayout={setSheetLayout}
                  onComposeSheetDataUrl={composeSheetDataUrl}
                  sheetBusyId={sheetBusyId}
                  onExportSheets={handleExportSheets}
                  exporting={busy}
                  onAddGroup={addGroup}
                  onUpdateGroup={updateGroup}
                  onDeleteGroup={deleteGroup}
                />
              )}
            </div>
          </div>
        </div>

        {data?.error && (
          <div className="border-t border-border bg-red-500/10 px-4 py-1.5 text-xs text-red-500">
            {data.error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 编辑 tab：截帧参数 + 视频信息 + 尺寸调整 */
function EditTab({ params, set, videoInfo, onProbe, onExtract, resizeW, setResizeW, resizeH, setResizeH, onResize, hasVideo }) {
  return (
    <div className="flex flex-col gap-4">
      {/* 截取帧 */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold text-foreground">按帧截取</h4>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">模式</span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            value={params.mode || 'count'}
            onChange={(e) => set({ mode: e.target.value })}
          >
            {FRAME_EXTRACT_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {params.mode === 'fps' ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">每秒抽取帧数 (fps)</span>
            <input type="number" min="0.1" step="0.5" value={params.fps ?? 1}
              onChange={(e) => set({ fps: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
          </label>
        ) : params.mode === 'interval' ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">帧间隔</span>
            <input type="number" min="1" step="1" value={params.interval ?? 2}
              onChange={(e) => set({ interval: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
            <span className="text-[10px] text-muted-foreground">每隔此帧数抽取一张；设为 1 时导出全部帧。</span>
          </label>
        ) : params.mode === 'seconds' ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">时间间隔（秒）</span>
            <input type="number" min="0.01" step="0.1" value={params.secondsInterval ?? 1}
              onChange={(e) => set({ secondsInterval: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
            <span className="text-[10px] text-muted-foreground">每隔此秒数抽取一张；支持 0.5 等小数。</span>
          </label>
        ) : params.mode === 'count' || !params.mode ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">帧数</span>
            <input type="number" min="1" value={params.count ?? 8}
              onChange={(e) => set({ count: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
          </label>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            导出视频中的全部原始帧，不进行帧率采样。
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">最大宽度（留空=原尺寸）</span>
          <input type="number" min="1" value={params.maxWidth ?? ''}
            onChange={(e) => set({ maxWidth: e.target.value })}
            placeholder="如 320"
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
        </label>
        <button
          type="button"
          disabled={!hasVideo}
          onClick={onExtract}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          截取帧
        </button>
      </section>

      {/* 尺寸调整 */}
      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h4 className="text-xs font-semibold text-foreground">调整尺寸</h4>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">宽</span>
            <input type="number" min="1" value={resizeW} onChange={(e) => setResizeW(e.target.value)} placeholder="留空=自适应"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
          </label>
          <span className="pb-1.5 text-xs text-muted-foreground">×</span>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">高</span>
            <input type="number" min="1" value={resizeH} onChange={(e) => setResizeH(e.target.value)} placeholder="留空=自适应"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
          </label>
        </div>
        <button
          type="button"
          disabled={!hasVideo || (!resizeW && !resizeH)}
          onClick={onResize}
          className="w-full rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:border-primary hover:text-primary disabled:opacity-50"
        >
          应用尺寸调整
        </button>
      </section>

      {/* 视频信息 */}
      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">视频信息</h4>
          <button type="button" disabled={!hasVideo} onClick={onProbe}
            className="text-[11px] text-primary transition hover:underline disabled:opacity-50">
            {videoInfo ? '刷新' : '解析'}
          </button>
        </div>
        {videoInfo ? (
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            <InfoRow label="时长" value={videoInfo.duration ? `${videoInfo.duration.toFixed(2)}s` : '-'} />
            {videoInfo.video && <>
              <InfoRow label="分辨率" value={`${videoInfo.video.width}×${videoInfo.video.height}`} />
              <InfoRow label="编码" value={videoInfo.video.codecName || '-'} />
              <InfoRow label="帧率" value={videoInfo.video.frameRate ? `${videoInfo.video.frameRate} fps` : '-'} />
            </>}
            {videoInfo.audio && <>
              <InfoRow label="音频" value={videoInfo.audio.codecName || '-'} />
              <InfoRow label="采样率" value={videoInfo.audio.sampleRate ? `${videoInfo.audio.sampleRate} Hz` : '-'} />
            </>}
            {videoInfo.format && <InfoRow label="容器" value={videoInfo.format.name || '-'} />}
          </dl>
        ) : (
          <p className="text-[11px] text-muted-foreground">点「解析」获取视频元数据</p>
        )}
      </section>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * 动画组 tab：
 * - 顶部：行/列设置（精灵图输出网格布局）+ 新建动画组
 * - 每个动画组：名称/起止帧/fps + 循环播放器 + 实时精灵图预览（按 cols 合成）
 * - 列表最下方：【输出到画布】按钮，把每个动画组的精灵图输出到节点 data.output.images
 *
 * 新建动画组读取帧列表当前选中的起止帧。
 */
function AnimTab({
  groups, frames,
  selectedStartFrame, selectedEndFrame,
  sheetLayout, onSetSheetLayout,
  onComposeSheetDataUrl, sheetBusyId,
  onExportSheets, exporting,
  onAddGroup, onUpdateGroup, onDeleteGroup,
}) {
  const exportableCount = groups.filter((g) => {
    const s = Math.max(0, g.startFrame ?? 0);
    const e = Math.max(0, g.endFrame ?? 0);
    return e >= s && frames.length > 0;
  }).length;

  return (
    <div className="flex flex-col gap-3">
      {/* 顶部：行/列设置 + 新建动画组 */}
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
        <h4 className="text-[11px] font-semibold text-foreground">精灵图布局</h4>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">行（rows）</span>
            <input type="number" min="1" value={sheetLayout.rows ?? 1}
              onChange={(e) => onSetSheetLayout({ rows: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded border border-border px-1.5 py-1 text-xs outline-none focus:border-primary" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">列（cols）</span>
            <input type="number" min="1" value={sheetLayout.cols ?? 4}
              onChange={(e) => onSetSheetLayout({ cols: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded border border-border px-1.5 py-1 text-xs outline-none focus:border-primary" />
          </label>
        </div>
        <p className="text-[10px] leading-tight text-muted-foreground">
          列数决定精灵图横向排布；调整任意参数（含 fps）会在动画下方刷新预览。
        </p>
      </div>

      <button
        type="button"
        onClick={onAddGroup}
        disabled={!frames.length || selectedEndFrame < selectedStartFrame}
        className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        新建动画组{frames.length ? `（${selectedStartFrame}-${selectedEndFrame}）` : ''}
      </button>

      {groups.length === 0 && (
        <p className="text-center text-[11px] text-muted-foreground">无动画组，点上方创建</p>
      )}

      {groups.map((g) => {
        const invalid = g.endFrame < g.startFrame;
        return (
          <div
            key={g.id}
            className="flex flex-col gap-2 rounded-md border border-border p-2"
          >
            <div className="flex items-center gap-1.5">
              <input
                value={g.name}
                onChange={(e) => onUpdateGroup(g.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium outline-none focus:border-border"
              />
              <button type="button" onClick={() => onDeleteGroup(g.id)}
                className="text-muted-foreground transition hover:text-red-500" title="删除">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* 起止帧 + fps */}
            <div className="grid grid-cols-3 gap-1.5">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">起始帧</span>
                <input type="number" min="0" value={g.startFrame}
                  onChange={(e) => onUpdateGroup(g.id, { startFrame: Number(e.target.value) })}
                  className={`w-full rounded border px-1.5 py-1 text-xs outline-none ${invalid ? 'border-red-500' : 'border-border focus:border-primary'}`} />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">结束帧</span>
                <input type="number" min="0" value={g.endFrame}
                  onChange={(e) => onUpdateGroup(g.id, { endFrame: Number(e.target.value) })}
                  className={`w-full rounded border px-1.5 py-1 text-xs outline-none ${invalid ? 'border-red-500' : 'border-border focus:border-primary'}`} />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">fps</span>
                <input type="number" min="1" value={g.fps ?? 10}
                  onChange={(e) => onUpdateGroup(g.id, { fps: Number(e.target.value) })}
                  className="w-full rounded border border-border px-1.5 py-1 text-xs outline-none focus:border-primary" />
              </label>
            </div>

            {/* 播放器 */}
            <FrameSequencePlayer
              frames={frames}
              startFrame={g.startFrame}
              endFrame={g.endFrame}
              fps={g.fps ?? 10}
            />

            {/* 实时精灵图预览（按 cols 合成；fps/起止帧/列变化时刷新） */}
            <GroupSheetPreview
              group={g}
              cols={sheetLayout.cols ?? 4}
              busy={sheetBusyId === g.id}
              onCompose={onComposeSheetDataUrl}
            />
          </div>
        );
      })}

      {/* 列表最下方：输出到画布 */}
      <button
        type="button"
        onClick={onExportSheets}
        disabled={exporting || exportableCount === 0}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        输出到画布{exportableCount > 0 ? `（${exportableCount} 张）` : ''}
      </button>
    </div>
  );
}

/**
 * 单个动画组的精灵图预览。
 * 依赖 group（起止帧/fps）、cols 变化时异步重算 dataUrl 并展示。
 */
function GroupSheetPreview({ group, cols, busy, onCompose }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [err, setErr] = useState('');

  // 依赖：起止帧、fps、列数、合成函数 —— 任一变化（含切 fps）触发重算
  const depKey = `${group.startFrame}-${group.endFrame}-${group.fps}-${cols}`;
  useEffect(() => {
    let cancelled = false;
    const s = Math.max(0, group.startFrame ?? 0);
    const e = Math.max(0, group.endFrame ?? 0);
    if (e < s) { setDataUrl(null); setErr('起止帧无效'); return; }
    setErr('');
    onCompose?.(group).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, onCompose]);

  if (err) return <p className="text-center text-[10px] text-red-500">{err}</p>;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">精灵图预览</span>
      <div className="flex items-center justify-center rounded border border-border bg-[conic-gradient(#8882_25%,_transparent_0_50%,_#8882_0_75%,_transparent_0)] bg-[length:12px_12px] p-1">
        {busy ? (
          <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : dataUrl ? (
          <img src={dataUrl} alt="精灵图预览" className="max-h-28 max-w-full object-contain" />
        ) : (
          <span className="text-[10px] text-muted-foreground">设置起止帧后显示</span>
        )}
      </div>
    </div>
  );
}
