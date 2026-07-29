import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import SpineEditorDialog from '../SpineEditorDialog';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 骨骼编辑器节点：上传 .skel/.atlas/.png 三件套（持久化 http URL），
 * 点击「打开骨骼编辑器」弹窗用 iframe 加载 vendor/spine-editor-web（PixiJS+pixi-spine），
 * 资源经 fetch→dataUrl→postMessage 注入编辑器。
 *
 * 编辑器内导出（姿势 JSON / 截图 PNG / Spine 文件包）经 postMessage 回传：
 * - 截图/Spine 文件经 uploadFile 转 http URL → data.output.images（下游可连线）
 * - 姿势 JSON 存 data.exportedPose（文本，供查看/下游引用）
 *
 * 与 directorDesk/pixelEditor 同款 iframe+postMessage 模式，刷新即生效。
 */
export default function SpineEditorNode({ id, data, selected }) {
  const uploadedAssets = data?.uploadedAssets || null; // { skel, atlas, png, name }
  const onUpdate = data?.onUpdate;
  const [editorOpen, setEditorOpen] = useState(false);

  // FileUpload 三件套：识别 .skel / .atlas / .png，分别 uploadFile 持久化
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const list = files || [];
    if (!list.length) {
      onUpdate?.({ uploadedAssets: null });
      return;
    }
    onUpdate?.({ uploading: true, uploadError: undefined });
    try {
      const assets = { skel: '', atlas: '', png: '', name: '' };
      let baseName = '';
      for (const it of list) {
        const f = it?.file;
        if (!f) continue;
        // 优先复用已有 URL（拖入历史图等）
        const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
        let url = existing;
        if (!url && f instanceof File) {
          const uploaded = await AS.uploadFile(f);
          url = uploaded?.url || uploaded?.httpPath;
        }
        if (!url) continue;
        const lower = (f.name || '').toLowerCase();
        if (lower.endsWith('.skel') || lower.endsWith('.json')) { assets.skel = url; }
        else if (lower.endsWith('.atlas')) { assets.atlas = url; }
        else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) { assets.png = url; }
        // 取第一个文件名（去扩展名）作为 name
        if (!baseName) baseName = (f.name || 'spine').replace(/\.[^.]+$/, '');
      }
      assets.name = baseName;
      // 校验三件套齐全（至少 .skel + .atlas + .png）
      const complete = assets.skel && assets.atlas && assets.png;
      onUpdate?.({
        uploading: false,
        uploadedAssets: assets,
        uploadError: complete ? undefined : '缺少资源：需同时上传 .skel + .atlas + .png',
        error: undefined,
      });
    } catch (err) {
      console.error('SpineEditor upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
    setEditorOpen(false);
  }, [onUpdate]);

  // 导出姿势 JSON 回调（文本，不经 uploadFile）
  const handlePoseExport = useCallback((poseJson) => {
    onUpdate?.({ exportedPose: poseJson });
  }, [onUpdate]);

  // FileUpload value：把已有资源 URL 还原成 FileUpload 格式（仅展示用）
  const fileUploadValue = (() => {
    if (!uploadedAssets) return [];
    const out = [];
    if (uploadedAssets.skel) out.push(makeFUItem(uploadedAssets.skel, `${uploadedAssets.name}.skel`));
    if (uploadedAssets.atlas) out.push(makeFUItem(uploadedAssets.atlas, `${uploadedAssets.name}.atlas`));
    if (uploadedAssets.png) out.push(makeFUItem(uploadedAssets.png, `${uploadedAssets.name}.png`));
    return out;
  })();

  const canOpen = !!(uploadedAssets?.skel && uploadedAssets?.atlas && uploadedAssets?.png);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.spineEditor} data={data} selected={selected} targetHandle sourceHandle>
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        maxFiles={3}
        placeholder="上传 Spine 三件套（.skel + .atlas + .png，同名）"
      />
      {data?.uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">{data.uploadError}</p>
      )}

      <div className="text-[11px] text-muted-foreground">
        {canOpen
          ? `资源就绪：${uploadedAssets.name}（可打开编辑器）`
          : '上传 .skel + .atlas + .png 后可编辑'}
      </div>

      {/* 也可从内置角色库选择（编辑器内提供），故允许无上传时打开 */}
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        disabled={data?.uploading}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🦴 打开骨骼编辑器
      </button>

      {data?.exportedPose && (
        <details className="rounded-md border border-border p-1.5 text-[10px]">
          <summary className="cursor-pointer text-muted-foreground">已导出姿势 JSON</summary>
          <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{data.exportedPose}</pre>
        </details>
      )}

      {data?.error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{data.error}</p>
      )}

      <SpineEditorDialog
        open={editorOpen}
        assets={canOpen ? uploadedAssets : null}
        onSave={handleSave}
        onPoseExport={handlePoseExport}
        onClose={() => setEditorOpen(false)}
      />
    </NodeShell>
  );
}

function makeFUItem(url, name) {
  return {
    id: `up-${name}-${url.slice(-8)}`,
    file: { name, size: 0, type: 'application/octet-stream', url, httpPath: url },
    preview: url,
  };
}
