import { useCallback, useState } from 'react';
import { FileUpload, Sparkles } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import PhotopeaDialog from '../PhotopeaDialog';
import { NODE_TYPES } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';
import UploadSection from './UploadSection';

/**
 * 在线PS节点（Photopea）：iframe 嵌入云端 Photopea（https://www.photopea.com），
 * 在浏览器内做图层/蒙版/滤镜等完整 PS 编辑。
 *
 * 输入（可选，作为打开时的初始文档注入）：
 * 1. FileUpload 用户上传的图（data.uploadedImages: string[]，持久化）
 * 2. 上游连线推入的图（data.images: string[]，由 computeInputImages 派生）
 *
 * 导出：对话框「从 Photopea 导出」按钮触发 app.activeDocument.saveToOE("png") →
 *      Photopea postMessage 回 ArrayBuffer → Dialog 转 File 经 uploadFile 拿 http URL
 *      → 写 data.output.images，下游可用。
 *
 * 与本地 vendor 节点（pixelEditor/directorDesk）不同：Photopea 是第三方云端服务，
 * 跨域 postMessage 用 '*' targetOrigin（Photopea 官方协议）。
 */
export default function PhotopeaNode({ id, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  const allInputs = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const uploading = data?.uploading;
  const onUpdate = data?.onUpdate;
  const [editorOpen, setEditorOpen] = useState(false);

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
      console.error('Photopea upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
    setEditorOpen(false);
  }, [onUpdate]);

  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `photo-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  return (
    <NodeShell
      id={id}
      nodeType={NODE_TYPES.photopea}
      data={data}
      selected={selected}
      targetHandle
      sourceHandle
      toolbarActions={[
        { label: '在线PS', icon: <Sparkles className="h-3.5 w-3.5" />, title: '打开在线 PS', onClick: () => setEditorOpen(true), disabled: uploading },
      ]}
    >
      <UploadSection>
        <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.psd'] }}
        maxFiles={0}
        sortable
        placeholder="可选：上传图片作为初始文档（PSD/PNG/JPG…）"
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
          itemLabel={(i) => `图 ${i + 1}`}
          onDelete={data?.onDeleteUpstreamImage}
          nonDeletableUrls={data?.protectedUpstreamImageUrls}
        />
      )}

      <div className="text-[11px] text-muted-foreground">
        {allInputs.length
          ? `输入图：${allInputs.length} 张（打开后自动载入）`
          : '无输入图（可直接进 Photopea 新建）'}
      </div>

      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        disabled={uploading}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🖌️ 打开在线 PS
      </button>

      {data?.error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{data.error}</p>
      )}


      <PhotopeaDialog
        open={editorOpen}
        inputImages={allInputs}
        onSave={handleSave}
        onClose={() => setEditorOpen(false)}
      />
    </NodeShell>
  );
}
