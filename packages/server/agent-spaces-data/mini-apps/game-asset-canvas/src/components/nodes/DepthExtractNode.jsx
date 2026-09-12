import UploadSection from './UploadSection';
import { useCallback } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import ParamField from './ParamField';
import { DEPTH_PARAMS, NODE_TYPES } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';

// 视频扩展名（上传项的 file.type 缺失时兜底判别）
const VIDEO_EXT = /\.(mp4|m4v|mov|avi|mkv|webm|flv)$/i;

function isVideoItem(f) {
  if (!f) return false;
  if (typeof f.type === 'string' && f.type.startsWith('video/')) return true;
  const name = f.name || f.url || f.httpPath || '';
  return VIDEO_EXT.test(name);
}

/**
 * 提取深度图节点：上传/连线多张图或多段视频 → 调 workflow.depth-anything 插件，
 * 图片批量提取单目深度图，视频逐帧转深度视频（执行时按媒体类型分流）。
 *
 * data.params: { grayscale, predOnly, maxFrames, resolution }（maxFrames/resolution 仅视频生效）
 * data.uploadedImages / data.uploadedVideos: string[] 用户上传的 http URL（按类型分存）
 * data.output: { images: string[], videos: string[] } 深度图 / 深度视频产出
 *
 * 执行流程：data.onDepth(id, params, inputImages, inputVideos) → Canvas.handleDepth：
 *   图片 runDepth → depth_batch_predict；视频 runDepthVideo → depth_video_predict（串行）
 *
 * 输入来源（与 CutoutNode/ImageProcessNode 同款，两种合并去重）：
 * 1. FileUpload 用户上传（data.uploadedImages / data.uploadedVideos，持久化）
 * 2. 上游连线推入（data.images / data.videos，由 computeInputImages / computeInputVideos 派生）
 */
export default function DepthExtractNode({ id, type, data, selected }) {
  const params = data?.params || {};
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const uploadedVideos = Array.isArray(data?.uploadedVideos) ? data.uploadedVideos : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  // 上游视频（computeInputVideos 派生，覆盖式注入）
  const upstreamVideos = Array.isArray(data?.videos) ? data.videos.filter(Boolean) : [];
  const inputImages = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const inputVideos = dedupeUrls([...uploadedVideos, ...upstreamVideos]);
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const cancelled = status === 'cancelled';
  const onUpdate = data?.onUpdate;
  const onDepth = data?.onDepth;
  const onCancelProcess = data?.onCancelProcess;
  const uploading = data?.uploading;

  const setParam = useCallback(
    (key, value) => {
      onUpdate?.({ params: { ...params, [key]: value } });
    },
    [onUpdate, params],
  );

  const handleFilesChange = useCallback(
    async (files) => {
      const AS = window.AgentSpaces;
      if (!AS?.uploadFile) {
        console.warn('AgentSpaces.uploadFile 不可用');
        return;
      }
      const imageUrls = [];
      const videoUrls = [];
      const pending = [];
      for (const item of files || []) {
        const f = item?.file;
        if (!f) continue;
        const target = isVideoItem(f) ? videoUrls : imageUrls;
        const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
        if (existing) {
          target.push(existing);
          continue;
        }
        if (f instanceof File) pending.push({ file: f, target });
      }
      if (pending.length) {
        onUpdate?.({ uploading: true, uploadError: undefined });
        try {
          for (const { file: f, target } of pending) {
            const uploaded = await AS.uploadFile(f);
            const httpUrl = uploaded?.url || uploaded?.httpPath;
            if (httpUrl) target.push(httpUrl);
          }
        } catch (err) {
          console.error('Depth upload failed:', err);
          onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
          return;
        }
      }
      onUpdate?.({ uploadedImages: imageUrls, uploadedVideos: videoUrls, uploading: false });
    },
    [onUpdate],
  );

  const handleRun = useCallback(() => {
    if (!inputImages.length && !inputVideos.length) return;
    onDepth?.(id, params, inputImages, inputVideos);
  }, [onDepth, id, params, inputImages, inputVideos]);

  // FileUpload 值：图片 + 视频混合列表（file.type 标注视频，卡片占位展示）
  const fileUploadValue = [
    ...uploadedImages.map((url, i) => ({
      id: `up-img-${i}-${url.slice(-12)}`,
      file: { name: `upload-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
      preview: url,
    })),
    ...uploadedVideos.map((url, i) => ({
      id: `up-vid-${i}-${url.slice(-12)}`,
      file: { name: `upload-video-${i + 1}.mp4`, size: 0, type: 'video/mp4', url, httpPath: url },
    })),
  ];

  // 产出：图片走 NodeShell 的 output.images，视频单独渲染（对称 VideoGeneratorNode）
  const outputVideos = Array.isArray(data?.output?.videos) ? data.output.videos.filter(Boolean) : [];

  const upCount = uploadedImages.length;
  const usCount = upstreamImages.length;
  const inputSummary = [
    inputImages.length ? `${inputImages.length} 图` : '',
    inputVideos.length ? `${inputVideos.length} 视频` : '',
  ].filter(Boolean).join(' + ');

  return (
    <NodeShell id={id} nodeType={type || NODE_TYPES.depthExtract} data={data} selected={selected} targetHandle sourceHandle onRun={handleRun}>
      <p className="text-[10px] leading-snug text-muted-foreground">
        调用 Depth Anything 插件：图片批量提取深度图，视频逐帧转深度视频（无音轨）
      </p>

      {/* 参数表单（配色 / 输出模式 / 视频参数） */}
      {DEPTH_PARAMS.map((param) => (
        <ParamField
          key={param.key}
          param={param}
          value={params[param.key] ?? param.default}
          onChange={(v) => setParam(param.key, v)}
          allParams={params}
        />
      ))}

      {/* 输入：FileUpload 图片 + 视频混合上传 */}
      <UploadSection>
        <FileUpload
          value={fileUploadValue}
          onChange={handleFilesChange}
          accept={{
            'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
            'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
          }}
          maxFiles={0}
          sortable
          placeholder="点击或拖入图片或视频（可拖拽排序）"
        />
      </UploadSection>
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {upstreamImages.length > 0 && (
        <UpstreamImageList
          nodeId={id}
          urls={upstreamImages}
          resources={data?.imageResources}
          sortable
          onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })}
          onDelete={data?.onDeleteUpstreamImage}
          nonDeletableUrls={data?.protectedUpstreamImageUrls}
        />
      )}

      {upstreamVideos.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">连线视频（{upstreamVideos.length}）</span>
          {upstreamVideos.map((url, i) => (
            <video
              key={`us-vid-${i}-${url}`}
              src={url}
              controls
              preload="metadata"
              className="h-20 w-full rounded border border-border bg-muted object-contain"
            />
          ))}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        {inputSummary
          ? `输入 ${inputSummary}${upCount || usCount ? `（上传 ${upCount + uploadedVideos.length} + 连线 ${usCount + upstreamVideos.length}）` : ''}`
          : '输入：无（上传或连线图片/视频）'}
      </div>

      {running ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="flex-1 cursor-not-allowed rounded-md bg-primary/70 px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-80"
          >
            {data?.statusMsg || '处理中…'}
          </button>
          <button
            type="button"
            onClick={() => onCancelProcess?.(id)}
            title="取消生成"
            className="shrink-0 rounded-md border border-destructive bg-background px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
          >
            取消生成
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRun}
          disabled={uploading || (!inputImages.length && !inputVideos.length)}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⚡ 提取深度
        </button>
      )}

      {cancelled && (
        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">已取消</p>
      )}
      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {outputVideos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            深度视频（{outputVideos.length}）
          </span>
          {outputVideos.map((url, i) => (
            <video
              key={`out-vid-${i}-${url}`}
              src={url}
              controls
              preload="metadata"
              className="w-full rounded border border-border"
            />
          ))}
        </div>
      )}
    </NodeShell>
  );
}
