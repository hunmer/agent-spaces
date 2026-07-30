import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogTitle,
  Upload, Film, Trash2, MoreVertical, FolderPlus, Loader,
} from '@agent-spaces/ui';
import FramePlayer from './nodes/FramePlayer';
import { FRAME_EXTRACT_MODE_OPTIONS } from '../utils/constants';

const FFMPEG_PLUGIN_ID = 'workflow.ffmpeg';
const FFMPEG_PROBE = 'ffmpeg_probe';
const FFMPEG_EXTRACT_FRAMES = 'ffmpeg_extract_frames';
const FFMPEG_CUSTOM = 'ffmpeg_custom';

/**
 * 视频编辑器大对话框。
 *
 * 布局：
 * ┌───────────────────────────────────────┐
 * │ 顶部：横向视频缩略图列表（上传/切换/删除）│
 * ├────────────────────────┬──────────────┤
 * │  视频播放器             │ 右侧 tabs     │
 * │  <video controls>      │ [编辑][动画组]│
 * ├────────────────────────┤              │
 * │  横向帧图片列表          │              │
 * │  每帧右上角 dots dropdown│              │
 * └────────────────────────┴──────────────┘
 *
 * 所有改动经 onUpdate 回写节点 data（不在 Dialog 内独存 state 源真值）。
 */
export default function VideoEditorDialog({ open, data, onUpdate, onClose }) {
  const videos = Array.isArray(data?.videos) ? data.videos.filter(Boolean) : [];
  const frames = Array.isArray(data?.frames) ? data.frames.filter(Boolean) : [];
  const animGroups = Array.isArray(data?.animGroups) ? data.animGroups : [];
  const videoInfo = data?.videoInfo || null;
  const params = data?.params || { mode: 'count', count: 8, fps: 1, maxWidth: 320 };

  const [activeTab, setActiveTab] = useState('edit');
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [dropTargetGroup, setDropTargetGroup] = useState(null);
  const [dragFrame, setDragFrame] = useState(null);
  const [dotsFrameIdx, setDotsFrameIdx] = useState(null);
  const fileRef = useRef(null);
  const dotsRef = useRef(null);

  const currentVideo = videos[Math.min(activeVideoIdx, videos.length - 1)] || videos[0] || '';

  useEffect(() => {
    if (activeVideoIdx > videos.length - 1) setActiveVideoIdx(Math.max(0, videos.length - 1));
  }, [videos.length, activeVideoIdx]);

  // 点击外部关闭 dots dropdown
  useEffect(() => {
    if (dotsFrameIdx === null) return;
    const handler = (e) => {
      if (dotsRef.current && !dotsRef.current.contains(e.target)) setDotsFrameIdx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dotsFrameIdx]);

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  // 上传视频（追加，去重）
  const handleUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) return;
    setBusy(true); setBusyMsg('上传视频中…');
    try {
      const urls = [];
      for (const f of files) {
        const up = await AS.uploadFile(f);
        const httpUrl = up?.url || up?.httpPath;
        if (httpUrl) urls.push(httpUrl);
      }
      const merged = Array.from(new Set([...videos, ...urls]));
      onUpdate?.({ videos: merged });
    } catch (err) {
      onUpdate?.({ error: `上传失败：${err?.message || err}` });
    } finally {
      setBusy(false); setBusyMsg('');
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
        maxWidth: params.maxWidth ? Number(params.maxWidth) : undefined,
      });
      if (ret?.success && Array.isArray(ret?.data?.frames)) {
        onUpdate?.({ frames: ret.data.frames, framesDir: ret.data.dir || '' });
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
    const group = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `动画组 ${animGroups.length + 1}`,
      frames: [],
      startFrame: 0,
      endFrame: 0,
      fps: 10,
    };
    onUpdate?.({ animGroups: [...animGroups, group] });
  }, [animGroups, onUpdate]);

  const updateGroup = useCallback((id, patch) => {
    onUpdate?.({
      animGroups: animGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });
  }, [animGroups, onUpdate]);

  const deleteGroup = useCallback((id) => {
    onUpdate?.({ animGroups: animGroups.filter((g) => g.id !== id) });
  }, [animGroups, onUpdate]);

  // 帧拖入动画组
  const handleGroupDrop = useCallback((groupId, e) => {
    e.preventDefault();
    setDropTargetGroup(null);
    const url = e.dataTransfer.getData('text/x-frame-url');
    if (!url) return;
    const group = animGroups.find((g) => g.id === groupId);
    if (!group) return;
    if (group.frames.includes(url)) return;
    const newFrames = [...group.frames, url];
    const idx = frames.indexOf(url);
    const next = {
      frames: newFrames,
      startFrame: group.frames.length === 0 ? Math.max(0, idx) : group.startFrame,
      endFrame: Math.max(0, idx),
    };
    updateGroup(groupId, next);
  }, [animGroups, frames, updateGroup]);

  // dots dropdown：设起止帧到分组
  const setFrameBoundary = useCallback((frameIdx, groupId, which) => {
    updateGroup(groupId, which === 'start' ? { startFrame: frameIdx } : { endFrame: frameIdx });
    setDotsFrameIdx(null);
  }, [updateGroup]);

  const onDragStartFrame = useCallback((e, url) => {
    e.dataTransfer.setData('text/x-frame-url', url);
    e.dataTransfer.effectAllowed = 'copy';
    setDragFrame(url);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] flex max-h-[92vh] flex-col gap-0 p-0 nodrag nopan nowheel">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Film className="h-4 w-4 text-primary" />
            视频编辑器
          </DialogTitle>
          <div className="flex items-center gap-2">
            {busy && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <Loader className="h-3 w-3 animate-spin" />
                {busyMsg || '处理中…'}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition hover:border-primary hover:text-primary"
            >
              <Upload className="h-3.5 w-3.5" /> 添加视频
            </button>
            <input ref={fileRef} type="file" accept="video/*" multiple className="hidden" onChange={handleUpload} />
          </div>
        </div>

        {/* 顶部：横向视频缩略图列表 */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/20 px-3 py-2">
          {videos.length === 0 ? (
            <span className="text-xs text-muted-foreground">暂无视频，点击右上「添加视频」或从上游连线接收</span>
          ) : videos.map((url, i) => (
            <div
              key={url + i}
              className={`group relative shrink-0 cursor-pointer overflow-hidden rounded border-2 transition ${i === activeVideoIdx ? 'border-primary' : 'border-transparent hover:border-border'}`}
              onClick={() => setActiveVideoIdx(i)}
            >
              <video src={url} className="h-14 w-24 object-cover" muted preload="metadata" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white">
                #{i + 1}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onUpdate?.({ videos: videos.filter((_, j) => j !== i) }); }}
                className="absolute right-0.5 top-0.5 hidden rounded bg-black/60 p-0.5 text-white group-hover:block"
                title="移除"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* 主体：左侧播放器+帧列表 / 右侧 tabs */}
        <div className="flex min-h-0 flex-1">
          {/* 左侧 */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* 视频播放器 */}
            <div className="flex items-center justify-center bg-black/90 p-3" style={{ minHeight: 240 }}>
              {currentVideo ? (
                <video key={currentVideo} src={currentVideo} controls className="max-h-[320px] max-w-full" />
              ) : (
                <span className="text-xs text-white/50">选择上方视频或上传</span>
              )}
            </div>

            {/* 横向帧图片列表 */}
            <div className="flex min-h-0 flex-1 flex-col border-t border-border">
              <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  帧列表 {frames.length > 0 && `（${frames.length}）`}
                </span>
                <span className="text-[10px] text-muted-foreground">拖拽帧到右侧动画组</span>
              </div>
              <div className="flex flex-1 gap-1.5 overflow-x-auto overflow-y-hidden p-2">
                {frames.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                    暂无帧，到「编辑」tab 点「截取帧」
                  </div>
                ) : frames.map((url, i) => (
                  <div
                    key={url + i}
                    className="group relative shrink-0 cursor-grab"
                    draggable
                    onDragStart={(e) => onDragStartFrame(e, url)}
                    onDragEnd={() => setDragFrame(null)}
                  >
                    <img src={url} alt={`frame ${i}`} className="h-20 w-28 rounded border border-border object-cover" />
                    <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[9px] text-white">{i}</span>
                    {/* 右上角 dots dropdown */}
                    <div className="absolute right-0.5 top-0.5" ref={dotsFrameIdx === i ? dotsRef : null}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDotsFrameIdx(dotsFrameIdx === i ? null : i); }}
                        className="rounded bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                        title="更多"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>
                      {dotsFrameIdx === i && (
                        <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-lg">
                          <DotsSubmenu
                            label="设置为起点"
                            groups={animGroups}
                            onSelect={(gid) => setFrameBoundary(i, gid, 'start')}
                          />
                          <DotsSubmenu
                            label="设置为终点"
                            groups={animGroups}
                            onSelect={(gid) => setFrameBoundary(i, gid, 'end')}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
                  dropTargetGroup={dropTargetGroup}
                  onDropTarget={setDropTargetGroup}
                  onAddGroup={addGroup}
                  onUpdateGroup={updateGroup}
                  onDeleteGroup={deleteGroup}
                  onGroupDrop={handleGroupDrop}
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

/** dots dropdown 子菜单：列出分组供选择 */
function DotsSubmenu({ label, groups, onSelect }) {
  return (
    <div className="group/sub relative">
      <button type="button" className="flex w-full items-center justify-between px-3 py-1 text-xs text-foreground transition hover:bg-accent">
        {label}
        <span className="text-muted-foreground">›</span>
      </button>
      {groups.length === 0 ? (
        <span className="block px-3 py-0.5 text-[10px] text-muted-foreground">无分组，先到动画组 tab 创建</span>
      ) : (
        <div className="invisible absolute left-full top-0 z-30 min-w-[140px] rounded-md border border-border bg-popover py-1 opacity-0 shadow-lg transition group-hover/sub:visible group-hover/sub:opacity-100">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className="block w-full px-3 py-1 text-left text-xs text-foreground transition hover:bg-accent hover:text-primary"
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
    </div>
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
            <span className="text-[11px] text-muted-foreground">帧率 (fps)</span>
            <input type="number" min="0.1" step="0.5" value={params.fps ?? 1}
              onChange={(e) => set({ fps: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">帧数</span>
            <input type="number" min="1" value={params.count ?? 8}
              onChange={(e) => set({ count: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
          </label>
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

/** 动画组 tab：分组列表 + 拖拽接收 + 循环播放器 */
function AnimTab({ groups, frames, dropTargetGroup, onDropTarget, onAddGroup, onUpdateGroup, onDeleteGroup, onGroupDrop }) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onAddGroup}
        className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        <FolderPlus className="h-3.5 w-3.5" /> 新建动画组
      </button>

      {groups.length === 0 && (
        <p className="text-center text-[11px] text-muted-foreground">无动画组，点上方创建</p>
      )}

      {groups.map((g) => {
        const invalid = g.endFrame < g.startFrame;
        return (
          <div
            key={g.id}
            onDragOver={(e) => { e.preventDefault(); onDropTarget(g.id); }}
            onDragLeave={() => onDropTarget(null)}
            onDrop={(e) => onGroupDrop(g.id, e)}
            className={`flex flex-col gap-2 rounded-md border p-2 transition ${dropTargetGroup === g.id ? 'border-primary bg-primary/5' : 'border-border'}`}
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
            <FramePlayer
              frames={frames}
              startFrame={g.startFrame}
              endFrame={g.endFrame}
              fps={g.fps ?? 10}
            />

            {/* 已加入的帧缩略 */}
            {g.frames && g.frames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {g.frames.map((url, i) => (
                  <div key={url + i} className="relative">
                    <img src={url} alt="" className="h-8 w-10 rounded border border-border object-cover" />
                    <button type="button"
                      onClick={() => onUpdateGroup(g.id, { frames: g.frames.filter((u) => u !== url) })}
                      className="absolute -right-1 -top-1 hidden rounded-full bg-red-500 p-0.5 text-white group-hover:block">
                      <Trash2 className="h-2 w-2" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(!g.frames || g.frames.length === 0) && (
              <p className="text-center text-[10px] text-muted-foreground">从下方帧列表拖入帧，或用 ⋮ 设起止帧</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
