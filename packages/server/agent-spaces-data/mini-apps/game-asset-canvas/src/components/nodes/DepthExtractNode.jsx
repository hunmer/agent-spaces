import UploadSection from './UploadSection';
import { useCallback } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import ParamField from './ParamField';
import { DEPTH_PARAMS, NODE_TYPES } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';

/**
 * 提取深度图节点：上传/连线多张图 → 调 workflow.depth-anything 插件批量提取单目深度图。
 *
 * data.params: { grayscale: 'true'|'false', predOnly: 'true'|'false' }
 * data.uploadedImages: string[] 用户上传的图 http URL
 * data.output: { images: string[] } 深度图产出
 *
 * 执行流程：data.onDepth(id, params, inputImages) → Canvas.handleDepth：
 *   runDepth → callPluginTool('workflow.depth-anything', 'depth_batch_predict', ...)
 *   → 回填 data.output.images
 *
 * 输入来源（与 CutoutNode/ImageProcessNode 同款，两种合并去重）：
 * 1. FileUpload 用户上传（data.uploadedImages，持久化）
 * 2. 上游连线推入（data.images，由 computeInputImages 派生）
 */
export default function DepthExtractNode({ id, type, data, selected }) {
  const params = data?.params || {};
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  const inputImages = dedupeUrls([...uploadedImages, ...upstreamImages]);
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
      const urls = [];
      const pending = [];
      for (const item of files || []) {
        const f = item?.file;
        if (!f) continue;
        const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
        if (existing) {
          urls.push(existing);
          continue;
        }
        if (f instanceof File) pending.push(f);
      }
      if (pending.length) {
        onUpdate?.({ uploading: true, uploadError: undefined });
        try {
          for (const f of pending) {
            const uploaded = await AS.uploadFile(f);
            const httpUrl = uploaded?.url || uploaded?.httpPath;
            if (httpUrl) urls.push(httpUrl);
          }
        } catch (err) {
          console.error('Depth upload failed:', err);
          onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
          return;
        }
      }
      onUpdate?.({ uploadedImages: urls, uploading: false });
    },
    [onUpdate],
  );

  const handleRun = useCallback(() => {
    if (!inputImages.length) return;
    onDepth?.(id, params, inputImages);
  }, [onDepth, id, params, inputImages]);

  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `upload-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  const upCount = uploadedImages.length;
  const usCount = upstreamImages.length;

  return (
    <NodeShell id={id} nodeType={type || NODE_TYPES.depthExtract} data={data} selected={selected} targetHandle sourceHandle>
      <p className="text-[10px] leading-snug text-muted-foreground">
        调用 Depth Anything 插件批量提取单目深度图（GPU 并行）
      </p>

      {/* 参数表单（配色 / 输出模式） */}
      {DEPTH_PARAMS.map((param) => (
        <ParamField
          key={param.key}
          param={param}
          value={params[param.key] ?? param.default}
          onChange={(v) => setParam(param.key, v)}
        />
      ))}

      {/* 输入图：FileUpload 多图 */}
      <UploadSection>
        <FileUpload
          value={fileUploadValue}
          onChange={handleFilesChange}
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
          maxFiles={0}
          sortable
          placeholder="点击或拖入多张图（可拖拽排序）"
        />
      </UploadSection>
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {upstreamImages.length > 0 && (
        <UpstreamImageList
          urls={upstreamImages}
          sortable
          onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })}
          onDelete={data?.onDeleteUpstreamImage}
          nonDeletableUrls={data?.protectedUpstreamImageUrls}
        />
      )}

      <div className="text-[11px] text-muted-foreground">
        {inputImages.length > 0
          ? `输入 ${inputImages.length} 张${upCount ? `（上传 ${upCount}` : ''}${upCount && usCount ? ' + ' : ''}${usCount ? `连线 ${usCount}` : ''}${upCount || usCount ? '）' : ''}`
          : '输入：无（上传或连线）'}
      </div>

      {running ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="flex-1 cursor-not-allowed rounded-md bg-primary/70 px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-80"
          >
            处理中…
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
          disabled={uploading || !inputImages.length}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⚡ 提取深度图
        </button>
      )}

      {cancelled && (
        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">已取消</p>
      )}
      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}
    </NodeShell>
  );
}
