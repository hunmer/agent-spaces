import { useCallback, useState } from 'react';
import { FileUpload, Grid2x2 } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import PixelEditorDialog from '../PixelEditorDialog';
import { NODE_TYPES } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';
import UploadSection from './UploadSection';

/**
 * 像素编辑器节点：接收上游多图或本地上传图片，节点内展示「编辑」按钮，
 * 点击弹出对话框用 iframe 加载本地 Pixelorama web 版（vendor/pixelorama-web），
 * 把上游图片经 __pixelorama.loadImage(base64) 注入 Godot 编辑，
 * 编辑后经 __pixelorama.requestExport() + onExport 回传，写入 data.output.images 供下游使用。
 *
 * 输入来源（多帧，合并去重）：
 * 1. FileUpload 用户上传的图（data.uploadedImages: string[]，持久化）
 * 2. 上游连线推入的图（data.images: string[]，由 computeInputImages 派生）
 *
 * 依赖：vendor/pixelorama-web（Pixelorama web 导出产物，需 COOP/COEP 头才能用 SharedArrayBuffer，
 * 由 Pixelorama 自带 service worker 注入）。
 */
export default function PixelEditorNode({ id, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  // 上游连线图的排序顺序（url 子集，持久化）。data.images 由 computeInputImages 派生会覆盖，
  // 所以顺序单独存在 upstreamOrder，order 里有的按 order 排，没有的（新连入）追加到末尾。
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  // 合并输入：上传图在前 + 上游连线图（已排序）在后，去重保序
  const allFrames = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const uploading = data?.uploading;
  const error = data?.error;
  const onUpdate = data?.onUpdate;
  const createMode = data?.params?.createMode === 'frames' ? 'frames' : 'multi';
  const [editorOpen, setEditorOpen] = useState(false);

  const setCreateMode = useCallback((mode) => {
    onUpdate?.({ params: { ...(data?.params || {}), createMode: mode } });
  }, [data?.params, onUpdate]);

  // FileUpload onChange：多图，对每个新 File 调 uploadFile 拿 http URL 持久化。
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
      console.error('PixelEditor upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
  }, [onUpdate]);

  // FileUpload value：把持久化的 uploadedImages URL 转回 FileUploadFile 格式
  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `pixel-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  return (
    <NodeShell
      id={id}
      nodeType={NODE_TYPES.pixelEditor}
      data={data}
      selected={selected}
      targetHandle
      sourceHandle
      toolbarActions={[
        { label: '像素编辑', icon: <Grid2x2 className="h-3.5 w-3.5" />, title: '打开像素编辑器', onClick: () => setEditorOpen(true), disabled: uploading || allFrames.length < 1 },
      ]}
    >
      {/* 新建类型：多文件 / 动画关键帧 */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="shrink-0">新建类型</span>
        <select
          value={createMode}
          onChange={(e) => setCreateMode(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary nodrag nopan"
        >
          <option value="multi">多个新文件</option>
          <option value="frames">动画关键帧</option>
        </select>
      </div>
      <UploadSection>
        <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={0}
        sortable
        placeholder="点击或拖入多张图片（作为帧，可拖拽排序）"
        />
      </UploadSection>
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {/* 上游连线图（只读，不可删，由连线管理；可拖拽排序）。
          data.images 是 computeInputImages 派生真值，会被覆盖，所以顺序单独存 data.upstreamOrder。 */}
      {upstreamImages.length > 0 && (
        <UpstreamImageList
          nodeId={id}
          urls={upstreamImages}
          sortable
          onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })}
          itemLabel={(i) => `第 ${i + 1} 帧`}
        />
      )}

      {/* 输入来源统计 */}
      <div className="text-[11px] text-muted-foreground">
        {allFrames.length
          ? `输入：${allFrames.length} 张${uploadedImages.length ? `（上传 ${uploadedImages.length}` : '（连线'}${uploadedImages.length && upstreamImages.length ? ` + 连线 ${upstreamImages.length}` : ''}）`
          : '输入：无（上传或连线）'}
      </div>

      {/* 编辑按钮 */}
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        disabled={uploading || allFrames.length < 1}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        👾 编辑像素
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}


      <PixelEditorDialog
        open={editorOpen}
        frames={allFrames}
        createMode={createMode}
        onSave={handleSave}
        onClose={() => setEditorOpen(false)}
      />
    </NodeShell>
  );
}
