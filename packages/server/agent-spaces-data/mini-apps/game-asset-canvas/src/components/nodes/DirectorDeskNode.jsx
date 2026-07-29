import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import DirectorDeskDialog from '../DirectorDeskDialog';
import { NODE_TYPES } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';

/**
 * 3D导演台节点：iframe 加载本地 storyai-3d-director-desk 构建产物（vendor/director-desk-web），
 * 在浏览器内做 3D 分镜/摆位/截图。
 *
 * 输入（可选，作为全景图背景导入导演台）：
 * 1. FileUpload 用户上传的图（data.uploadedImages: string[]，持久化）
 * 2. 上游连线推入的图（data.images: string[]，由 computeInputImages 派生）
 *
 * 导出：导演台「截图」按钮触发 postMessage（storyai:director-desk-captures-sent）→
 *      Dialog 把 dataUrl 经 uploadFile 转 http URL → 写 data.output.images，下游可用。
 */
export default function DirectorDeskNode({ id, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  const allInputs = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const uploading = data?.uploading;
  const onUpdate = data?.onUpdate;
  const [deskOpen, setDeskOpen] = useState(false);

  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const list = files || [];
    if (!list.length) {
      onUpdate?.({ uploadedImages: [] });
      return;
    }
    const collected = [];
    const pending = [];
    for (const it of list) {
      const f = it?.file;
      if (!f) continue;
      const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
      if (existing) { collected.push(existing); continue; }
      if (f instanceof File) pending.push(f);
    }
    onUpdate?.({ uploading: true, uploadError: undefined });
    try {
      for (const f of pending) {
        const uploaded = await AS.uploadFile(f);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) collected.push(httpUrl);
      }
      onUpdate?.({ uploadedImages: collected, uploading: false, error: undefined });
    } catch (err) {
      console.error('DirectorDesk upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
    setDeskOpen(false);
  }, [onUpdate]);

  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `panorama-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.directorDesk} data={data} selected={selected} targetHandle sourceHandle>
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
        maxFiles={0}
        sortable
        placeholder="可选：上传全景图作为场景背景"
      />
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {upstreamImages.length > 0 && (
        <UpstreamImageList
          urls={upstreamImages}
          sortable
          onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })}
          itemLabel={(i) => `全景 ${i + 1}`}
          onDelete={data?.onDeleteUpstreamImage}
          nonDeletableUrls={data?.protectedUpstreamImageUrls}
        />
      )}

      <div className="text-[11px] text-muted-foreground">
        {allInputs.length
          ? `全景图输入：${allInputs.length} 张`
          : '无全景图输入（可直接进导演台摆位）'}
      </div>

      <button
        type="button"
        onClick={() => setDeskOpen(true)}
        disabled={uploading}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🎥 打开 3D 导演台
      </button>

      {data?.error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{data.error}</p>
      )}


      <DirectorDeskDialog
        open={deskOpen}
        panoramaUrls={allInputs}
        onSave={handleSave}
        onClose={() => setDeskOpen(false)}
      />
    </NodeShell>
  );
}
