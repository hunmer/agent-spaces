import { useCallback, useRef, useState, useEffect } from 'react';
import { NodeResizer } from '@xyflow/react';
import { Camera, ChevronLeft, ChevronRight, Crop, Upload, toast } from '@agent-spaces/ui';
import useViewportActivation from '../../hooks/useViewportActivation';
import NodeHandles from './NodeHandles';
import NodeHoverMenu from './NodeHoverMenu';
import TrimVideoDialog from '../TrimVideoDialog';
import { normalizeImageUrl } from '../../utils/workflow';

const FFMPEG_PLUGIN_ID = 'workflow.ffmpeg';
const FFMPEG_CUSTOM = 'ffmpeg_custom';

/**
 * 视频展示节点：纯展示视频，无外壳边框/标题栏（结构对标 ImageDisplayNode）。
 *
 * - 顶部一条窄的自定义拖拽 handle（.image-drag-handle，复用同款 dragHandle 规则）
 * - 视频主体（inset-0 铺满），<video controls> 播放，双击全屏
 * - 选中时底部 overlay：来源标签 + 多视频切换箭头
 * - 左上角常驻上传按钮（同图片节点），底部 overlay 不再放上传入口
 * - hover 右下角菜单：截取视频帧（当前/首/尾帧，hover 展开子菜单，ffmpeg 单帧 PNG → 图片节点插入画布）、导出视频到画布
 *
 * data.videos: string[]  当前展示的视频（http URL）；多个时底部箭头切换
 * data.source: 'upload' | 'upstream' | ...  来源标记
 * data.tags: string[]  来源标签
 */
export default function VideoDisplayNode({ id, data, selected }) {
  const videos = Array.isArray(data?.videos) ? data.videos.filter(Boolean) : [];
  const onUpdate = data?.onUpdate;
  const fileRef = useRef(null);
  const rootRef = useRef(null);
  const viewportActivated = useViewportActivation(rootRef);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nodeHovered, setNodeHovered] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const source = data?.source;
  const tags = Array.isArray(data?.tags) ? data.tags.filter(Boolean) : [];
  // 多视频当前索引；集合变化时夹回有效范围
  const [vidIndex, setVidIndex] = useState(0);
  useEffect(() => {
    if (vidIndex > videos.length - 1) setVidIndex(Math.max(0, videos.length - 1));
  }, [videos.length, vidIndex]);

  const selectionCount = data?.selectionCount ?? 1;
  const isMulti = videos.length > 1;
  const current = videos[Math.min(vidIndex, videos.length - 1)] || videos[0];

  const onExportVideos = data?.onExportVideos;
  const onExportImages = data?.onExportImages;
  // 截帧入口只需有视频；导出入口还需回调存在
  const showToolbar = videos.length > 0;

  // 截取视频帧：ffmpeg_custom 输出单帧 PNG（-ss output seeking 精确定位），
  // 产物落 mini-app data 目录返回 httpPath，再以图片展示节点插入画布。
  // -ss 超过实际时长时 ffmpeg 以退出码 0 结束且不落盘（插件端 readFile 报 ENOENT），
  // 浏览器 currentTime 保留 3 位小数可能落在最后一帧之后，统一 clamp 进时长（留 0.1s 余量）。
  const handleCaptureFrame = useCallback(async (mode) => {
    const videoEl = rootRef.current?.querySelector('video');
    if (!current || capturing) return;
    setCapturing(true);
    try {
      const duration = Number(videoEl?.duration);
      const maxT = Number.isFinite(duration) && duration > 0.15 ? duration - 0.1 : null;
      const clamp = (t) => {
        const v = Number.isFinite(t) ? Math.max(0, t) : 0;
        return maxT != null ? Math.min(v, maxT) : v;
      };
      let args = '-frames:v 1';
      if (mode === 'current') {
        args = `-ss ${clamp(videoEl?.currentTime || 0).toFixed(3)} -frames:v 1`;
      } else if (mode === 'last') {
        args = `-ss ${clamp(duration).toFixed(3)} -frames:v 1`;
      }
      const ret = await window.AgentSpaces.callPluginTool(FFMPEG_PLUGIN_ID, FFMPEG_CUSTOM, {
        inputPath: current,
        args,
        outputExt: 'png',
      });
      if (!ret?.success || !ret?.data?.httpPath) throw new Error(ret?.message || '截帧失败');
      onExportImages?.([normalizeImageUrl(ret.data.httpPath)]);
      toast.success('已截取视频帧，图片节点已插入画布');
    } catch (err) {
      toast.error(`截帧失败：${err?.message || err}`);
    } finally {
      setCapturing(false);
    }
  }, [capturing, current, onExportImages]);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await AS.uploadFile(file);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('上传未返回 URL');
      onUpdate?.({ videos: [httpUrl], source: 'upload' });
    } catch (err) {
      console.error('uploadFile failed:', err);
      onUpdate?.({ error: `上传失败：${err?.message || String(err)}` });
    } finally {
      setUploading(false);
    }
  }, [onUpdate]);

  // 双击全屏播放
  const toggleFullscreen = useCallback((e) => {
    const v = e.currentTarget;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      v.requestFullscreen?.();
    }
  }, []);

  const sourceLabel = data?.source === 'upstream' ? '来自连线'
    : source === 'history' ? '来自记录'
    : source === 'storyboard' ? '来自分镜'
    : '已上传';

  return (
    <div
      ref={rootRef}
      className="group relative h-full w-full overflow-visible"
      onMouseEnter={() => setNodeHovered(true)}
      onMouseLeave={() => setNodeHovered(false)}
    >
      <NodeHoverMenu
          actions={showToolbar ? [
            {
              key: 'capture-frame',
              label: '截取视频帧',
              icon: <Camera className="h-3.5 w-3.5" />,
              children: [
                { key: 'capture-current', label: '截取当前帧', disabled: capturing, onClick: () => handleCaptureFrame('current') },
                { key: 'capture-first', label: '截取首帧', disabled: capturing, onClick: () => handleCaptureFrame('first') },
                { key: 'capture-last', label: '截取尾帧', disabled: capturing, onClick: () => handleCaptureFrame('last') },
              ],
            },
            onExportVideos ? {
              key: 'export-video',
              label: '导出视频',
              icon: <Upload className="h-3.5 w-3.5" />,
              onClick: () => onExportVideos(videos),
            } : null,
            {
              key: 'trim-video',
              label: '裁剪视频',
              icon: <Crop className="h-3.5 w-3.5" />,
              onClick: () => setTrimOpen(true),
              disabled: !onExportVideos,
            },
          ] : []}
          visible={(nodeHovered || menuOpen) && selectionCount <= 1}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onRun={data?.onRunNode}
          onDelete={data?.onDeleteNode}
          running={data?.status === 'running'}
      />

      <NodeResizer
        isVisible={!!selected}
        minWidth={200}
        minHeight={140}
        color="#6366f1"
        handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
        lineClassName="!border-primary/40"
      />

      <NodeHandles target source />

      <div className="absolute inset-0 overflow-hidden">
        {/* 左上角常驻上传按钮（同图片节点右上角同款样式） */}
        <div className="absolute -left-10 top-1.5 z-30 nodrag nopan">
          <button
            type="button"
            title="上传视频"
            aria-label="上传视频"
            onClick={(event) => { event.stopPropagation(); fileRef.current?.click(); }}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-muted-foreground shadow ring-1 ring-border backdrop-blur-sm hover:text-primary"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 顶部自定义拖拽 handle */}
        <div
          className="image-drag-handle absolute left-0 right-0 top-0 z-10 h-5 cursor-move opacity-0 transition group-hover:opacity-100"
          title="拖拽移动"
        >
          <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-foreground/30" />
        </div>

        {/* 视频主体区域：inset-0 铺满节点，无边框无内边距；Handle 在节点外侧（负偏移），铺满不遮挡。 */}
        <div className="image-drag-handle nopan absolute inset-0 flex items-center justify-center">
          {uploading ? (
            <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-primary">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              上传中…
            </div>
          ) : videos.length > 0 ? (
            current && viewportActivated && (
              <video
                key={current}
                src={current}
                controls
                onDoubleClick={toggleFullscreen}
                title="双击全屏"
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="image-drag-handle flex h-full w-full cursor-move flex-col items-center justify-center gap-2 border-2 border-dashed border-border text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Upload className="h-6 w-6" />
              <span className="pointer-events-none select-none">点击上传视频</span>
            </button>
          )}
        </div>

        {/* 选中时底部 overlay */}
        {selected && (videos.length > 0 || tags.length > 0) && !uploading && (
          <div className="nodrag nopan absolute bottom-1.5 left-1.5 right-1.5 z-10 flex items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 text-xs shadow ring-1 ring-border backdrop-blur-sm">
            {isMulti && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setVidIndex((i) => (i - 1 + videos.length) % videos.length); }}
                  className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  title="上一个"
                ><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Math.min(vidIndex, videos.length - 1) + 1}/{videos.length}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setVidIndex((i) => (i + 1) % videos.length); }}
                  className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  title="下一个"
                ><ChevronRight className="h-3.5 w-3.5" /></button>
              </>
            )}
            <span className="truncate text-muted-foreground">{sourceLabel}</span>
            {tags.map((t) => (
              <span
                key={t}
                className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >{t}</span>
            ))}
          </div>
        )}

        {data?.error && (
          <p className="absolute bottom-1.5 left-1.5 right-1.5 z-10 rounded bg-red-500/90 px-2 py-1 text-xs text-white">{data.error}</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* 视频裁剪：编辑态存 data.trimData，产出经 onExportVideos 以新视频节点插入画布 */}
      <TrimVideoDialog
        open={trimOpen}
        videoUrl={current}
        trimData={data?.trimData}
        onUpdate={onUpdate}
        onClose={() => setTrimOpen(false)}
        onConfirm={(url) => {
          onExportVideos?.([url]);
          toast.success('裁剪完成，视频节点已插入画布');
        }}
      />
    </div>
  );
}
