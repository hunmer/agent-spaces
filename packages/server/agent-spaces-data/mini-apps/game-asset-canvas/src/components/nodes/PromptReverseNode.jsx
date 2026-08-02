import { useCallback } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import { NODE_TYPES } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';
import UploadSection from './UploadSection';

/**
 * 反推提示词节点：上传/连线多张图 → 调视觉 AI（agent_run）→ 输出每张图的提示词文本。
 *
 * 输入来源（两种合并，去重；多图，可拖拽排序）：
 * 1. FileUpload 用户上传（data.uploadedImages: string[]，持久化）
 * 2. 上游连线推入（data.images: string[]，由 computeInputImages 派生）
 *
 * data.params: { processor: 'promptReverse', processorParams: {} }
 * data.uploadedImages: string[]
 * data.upstreamOrder: string[] 上游连线图的排序顺序
 * data.output: { text: string } AI 返回的原始文本（Markdown / 纯文本）
 *
 * 执行流程：data.onPromptReverse(id, inputImages) → Canvas.handlePromptReverse：
 *   调 runAgentVisionText（多图压缩 + agent_run + 图片附件）→ 写 data.output.text + 生成记录
 */
export default function PromptReverseNode({ id, type, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  const inputImages = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const status = data?.status || 'idle';
  const error = data?.error;
  const statusMsg = data?.statusMsg || '';
  const running = status === 'running';
  const cancelled = status === 'cancelled';
  const onUpdate = data?.onUpdate;
  const onPromptReverse = data?.onPromptReverse;
  const onCancelProcess = data?.onCancelProcess;
  const uploading = data?.uploading;

  const handleFilesChange = useCallback(async (files) => {
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
      if (existing) { urls.push(existing); continue; }
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
        console.error('PromptReverse upload failed:', err);
        onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
        return;
      }
    }
    onUpdate?.({ uploadedImages: urls, uploading: false });
  }, [onUpdate]);

  const handleRun = useCallback(() => {
    if (!inputImages.length) return;
    onPromptReverse?.(id, inputImages);
  }, [onPromptReverse, id, inputImages]);

  // FileUpload value
  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `upload-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  const upCount = uploadedImages.length;
  const usCount = upstreamImages.length;

  return (
    <NodeShell id={id} nodeType={type || NODE_TYPES.promptReverse} data={data} selected={selected} targetHandle sourceHandle>
      <p className="text-[10px] leading-snug text-muted-foreground">
        多张图 → AI 反推每张图的文生图提示词（需在「设置 → 反推提示词 AI」配置模型）
      </p>

      <UploadSection>

        <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
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
          nodeId={id}
          urls={upstreamImages}
          resources={data?.imageResources}
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
          <div className="flex-1 truncate rounded-md bg-primary/70 px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-90">
            {statusMsg || '反推中…'}
          </div>
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
          🔍 反推提示词
        </button>
      )}

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {cancelled && (
        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">已取消</p>
      )}
    </NodeShell>
  );
}
