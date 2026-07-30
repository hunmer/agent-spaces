import { useCallback, useEffect, useState } from 'react';
import { Upload, Film } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import VideoEditorDialog from '../VideoEditorDialog';

const FFMPEG_PLUGIN_ID = 'workflow.ffmpeg';
const FFMPEG_FIRST_FRAME = 'ffmpeg_first_frame';

/**
 * 视频编辑器节点。
 *
 * 接收上游或上传（多个）视频文件 → ffmpeg 按帧率截取 → 帧拖拽到动画组
 * （起止帧循环播放）→ 编辑面板调整尺寸/查看信息。
 *
 * 节点本体只展示摘要 + 「打开编辑器」按钮，复杂交互在大对话框 VideoEditorDialog。
 *
 * data.videos: string[]      视频 http URL（上传 + 上游派生，由 computeInputVideos 写入）
 * data.frames: string[]      截取的帧 http URL
 * data.framesDir: string     帧文件在 data 目录的相对路径
 * data.animGroups: Array<{id,name,startFrame,endFrame,fps,frames:string[]}>
 * data.videoInfo: object     ffprobe 解析信息
 * data.params: {mode,count,fps,maxWidth}
 */
export default function VideoEditorNode({ id, data, selected }) {
  const videos = Array.isArray(data?.videos) ? data.videos.filter(Boolean) : [];
  const frames = Array.isArray(data?.frames) ? data.frames.filter(Boolean) : [];
  const animGroups = Array.isArray(data?.animGroups) ? data.animGroups : [];
  const onUpdate = data?.onUpdate;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [thumbs, setThumbs] = useState({}); // { [videoUrl]: dataUrl }

  // 获取视频首帧作为缩略图（节点本体展示用，复用 ffmpeg_first_frame）
  useEffect(() => {
    let cancelled = false;
    const missing = videos.filter((url) => !thumbs[url]);
    if (!missing.length) return;
    const AS = window.AgentSpaces;
    if (!AS?.callPluginTool) return;
    missing.forEach(async (url) => {
      try {
        const ret = await AS.callPluginTool(FFMPEG_PLUGIN_ID, FFMPEG_FIRST_FRAME, { inputPath: url });
        if (!cancelled && ret?.success && ret?.data?.dataUrl) {
          setThumbs((prev) => ({ ...prev, [url]: ret.data.dataUrl }));
        }
      } catch { /* 静默失败，保留占位 */ }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.join('|')]);

  const handleOpen = useCallback(() => setDialogOpen(true), []);

  // 对话框内改动统一经 onUpdate 回写节点 data（遵守约束：业务数据存 data.xxx）
  const handleDialogUpdate = useCallback((patch) => {
    onUpdate?.(patch);
  }, [onUpdate]);

  // 简单上传：上传后写 data.videos（对话框内有更完整的上传交互）
  const handleQuickUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) return;
    onUpdate?.({ uploading: true });
    try {
      const urls = [];
      for (const f of files) {
        const up = await AS.uploadFile(f);
        const httpUrl = up?.url || up?.httpPath;
        if (httpUrl) urls.push(httpUrl);
      }
      onUpdate?.({ videos: [...videos, ...urls], source: 'upload', uploading: false });
    } catch (err) {
      onUpdate?.({ uploading: false, error: `上传失败：${err?.message || err}` });
    }
  }, [onUpdate, videos]);

  return (
    <NodeShell id={id} nodeType="videoEditor" data={data} selected={selected} targetHandle sourceHandle>
      {videos.length === 0 ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border py-8 text-xs text-muted-foreground transition hover:border-primary hover:text-primary">
          <Upload className="h-6 w-6" />
          <span>上传 / 连线接收视频</span>
          <input type="file" accept="video/*" multiple className="hidden" onChange={handleQuickUpload} />
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {videos.slice(0, 3).map((url, i) => (
              <div key={url + i} className="h-12 w-20 overflow-hidden rounded border border-border bg-muted">
                {thumbs[url] ? (
                  <img src={thumbs[url]} alt={`视频 ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Film className="h-4 w-4 opacity-40" />
                  </div>
                )}
              </div>
            ))}
            {videos.length > 3 && (
              <div className="flex h-12 w-12 items-center justify-center rounded border border-border text-xs text-muted-foreground">
                +{videos.length - 3}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {videos.length} 个视频 · {frames.length} 帧 · {animGroups.length} 动画组
          </div>
          <button
            type="button"
            onClick={handleOpen}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <Film className="h-4 w-4" />
            打开编辑器
          </button>
        </div>
      )}

      {data?.uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.error && <p className="text-[10px] text-red-500">{data.error}</p>}

      <VideoEditorDialog
        open={dialogOpen}
        data={data}
        onUpdate={handleDialogUpdate}
        onClose={() => setDialogOpen(false)}
      />
    </NodeShell>
  );
}
