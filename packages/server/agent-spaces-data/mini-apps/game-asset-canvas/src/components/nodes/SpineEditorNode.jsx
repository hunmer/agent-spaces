import { useCallback, useState } from 'react';
import { Bone, Button, Download, FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import SpineEditorDialog from '../SpineEditorDialog';
import { NODE_TYPES } from '../../utils/constants';
import UploadSection from './UploadSection';

/**
 * 骨骼编辑器节点：上传 .skel/.atlas/.png 三件套（持久化 http URL），
 * 点击「打开骨骼编辑器」后在 mini-app 对话框内直接加载本地 PixiJS+pixi-spine dist，
 * 资源经 fetch→dataUrl 注入编辑核心。
 *
 * 编辑器内导出（截图 PNG / Spine 文件包）直接回传节点：
 * - 截图/Spine 文件经 uploadFile 转 http URL → data.output.images（下游可连线）
 *
 * 源码由宿主 renderer 即时编译，刷新即生效。
 */
export default function SpineEditorNode({ id, data, selected }) {
  const uploadedAssets = data?.uploadedAssets || null; // { skel, atlas, png, name }
  // 上游注入的 spineAssets（自身未上传时复用，实现 spineDisplay → spineEditor 联动）
  const upstreamAssets = data?.source === 'upstream' ? data?.spineAssets : null;
  const effectiveAssets = uploadedAssets || upstreamAssets;
  const reskinEditorData = data?.reskinEditorData || null;
  const reskinLogs = data?.reskinLogs || null;
  const onUpdate = data?.onUpdate;
  const [editorOpen, setEditorOpen] = useState(false);

  // FileUpload 三件套：识别 .skel / .atlas / .png，分别 uploadFile 持久化
  const handleFilesChange = useCallback(async (files) => {
    console.log('[SpineEditor] handleFilesChange 收到 files:', files?.length, files?.map?.(it => ({ name: it?.file?.name, isFile: it?.file instanceof File, hasUrl: !!(it?.file?.uploadedUrl || it?.file?.url) })));
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const list = files || [];
    if (!list.length) {
      onUpdate?.({ uploadedAssets: null, reskinEditorData: null, reskinLogs: null });
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
          console.log('[SpineEditor] 开始上传:', f.name, f.type, f.size);
          const uploaded = await AS.uploadFile(f);
          console.log('[SpineEditor] 上传返回:', f.name, uploaded);
          url = uploaded?.url || uploaded?.httpPath;
        }
        if (!url) { console.log('[SpineEditor] 跳过（无 url）:', f.name); continue; }
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
      console.log('[SpineEditor] 组装完成:', assets, 'complete=', complete);
      onUpdate?.({
        uploading: false,
        uploadedAssets: assets,
        reskinEditorData: null,
        reskinLogs: null,
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

  // 录制视频回传：合并进 output.videos（不覆盖 images）
  const handleExportVideo = useCallback((url) => {
    if (!url) return;
    const prevOutput = data?.output || {};
    const prevVideos = Array.isArray(prevOutput.videos) ? prevOutput.videos : [];
    onUpdate?.({
      status: 'done',
      output: { ...prevOutput, videos: [...prevVideos, url] },
      error: undefined,
    });
    data?.onExportVideos?.([url]);
  }, [onUpdate, data?.output, data?.onExportVideos]);

  const handleReskinEditorDataChange = useCallback((next) => {
    onUpdate?.({ reskinEditorData: next });
  }, [onUpdate]);

  const handleReskinLogsChange = useCallback((next) => {
    onUpdate?.({ reskinLogs: next });
  }, [onUpdate]);

  // AI 换肤完成回调：把新三件套上传并回填节点产出
  const handleReskinComplete = useCallback(async (reskinAssets) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) return;
    try {
      // 新 atlas PNG 是 dataUrl，需上传转 http URL
      let pngUrl = uploadedAssets?.png;
      if (reskinAssets.png?.startsWith('data:')) {
        const blob = await (await fetch(reskinAssets.png)).blob();
        const file = new File([blob], `${reskinAssets.spineJson?.skeleton?.name || 'spine'}-reskin.png`, { type: 'image/png' });
        const uploaded = await AS.uploadFile(file);
        pngUrl = uploaded?.url || uploaded?.httpPath || pngUrl;
      }
      // 新 atlas 文本 + spine JSON 也上传（供下游使用）
      const baseName = uploadedAssets?.name || 'spine';
      const uploads = await Promise.all([
        uploadText(AS, reskinAssets.atlas, `${baseName}-reskin.atlas`),
        uploadText(AS, JSON.stringify(reskinAssets.spineJson, null, 2), `${baseName}-reskin.json`),
      ]);
      const [atlasUrl, spineJsonUrl] = uploads;
      const persistedAssets = {
        skel: reskinAssets.skel,
        atlas: atlasUrl,
        png: pngUrl,
        spineJson: spineJsonUrl,
      };
      onUpdate?.({
        status: 'done',
        reskinAssets: persistedAssets,
        output: { images: [pngUrl] },
        error: undefined,
      });
      return persistedAssets;
    } catch (err) {
      console.error('[SpineEditor] reskin upload failed:', err);
      return null;
    }
  }, [onUpdate, uploadedAssets]);

  // 产出视频（output.videos）
  const videos = Array.isArray(data?.output?.videos) ? data.output.videos : [];

  // FileUpload value：把已有资源 URL 还原成 FileUpload 格式（自身上传或上游注入）
  const fileUploadValue = (() => {
    if (!effectiveAssets) return [];
    const out = [];
    if (effectiveAssets.skel) out.push(makeFUItem(effectiveAssets.skel, `${effectiveAssets.name || 'spine'}.skel`));
    if (effectiveAssets.atlas) out.push(makeFUItem(effectiveAssets.atlas, `${effectiveAssets.name || 'spine'}.atlas`));
    if (effectiveAssets.png) out.push(makeFUItem(effectiveAssets.png, `${effectiveAssets.name || 'spine'}.png`));
    return out;
  })();

  const canOpen = !!(effectiveAssets?.skel && effectiveAssets?.atlas && effectiveAssets?.png);

  return (
    <NodeShell
      id={id}
      nodeType={NODE_TYPES.spineEditor}
      data={data}
      selected={selected}
      targetHandle
      sourceHandle
      toolbarActions={[
        { label: '骨骼编辑器', icon: <Bone className="h-3.5 w-3.5" />, title: '打开骨骼编辑器', onClick: () => setEditorOpen(true), disabled: data?.uploading },
      ]}
    >
      <UploadSection>
        <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        maxFiles={3}
        placeholder="上传 Spine 三件套（.skel + .atlas + .png，同名）"
        />
      </UploadSection>
      {data?.uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">{data.uploadError}</p>
      )}

      <div className="text-[11px] text-muted-foreground">
        {canOpen
          ? `资源就绪：${effectiveAssets.name || 'spine'}${upstreamAssets ? '（上游）' : '（可打开编辑器）'}`
          : '上传 .skel + .atlas + .png 后可编辑'}
      </div>

      {/* 也可从内置角色库选择（编辑器内提供），故允许无上传时打开 */}
      <Button
        type="button"
        onClick={() => setEditorOpen(true)}
        disabled={data?.uploading}
        size="sm"
        className="w-full"
      >
        <Bone className="h-4 w-4" />
        打开骨骼编辑器
      </Button>

      {videos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            录制视频{videos.length > 1 ? `（${videos.length}）` : ''}
          </span>
          {videos.map((url, i) => (
            <div key={url + i} className="flex flex-col gap-1">
              <video key={url} src={url} controls className="w-full rounded border border-border" />
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-primary underline-offset-2 hover:underline"
              >
                {videos.length > 1 ? `#${i + 1} ` : ''}下载 / 打开视频
              </a>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); data?.onExportVideos?.(videos); }}
            className="w-full"
          >
            <Download className="h-4 w-4" />
            导出视频到画布
          </Button>
        </div>
      )}

      {data?.error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{data.error}</p>
      )}

      <SpineEditorDialog
        open={editorOpen}
        assets={canOpen ? effectiveAssets : null}
        onSave={handleSave}
        onExportVideo={handleExportVideo}
        onReskinComplete={handleReskinComplete}
        initialReskinData={reskinEditorData}
        onReskinDataChange={handleReskinEditorDataChange}
        initialReskinLogs={reskinLogs}
        onReskinLogsChange={handleReskinLogsChange}
        onClose={() => setEditorOpen(false)}
      />
    </NodeShell>
  );
}

/** 把文本内容上传成文件，返回 http URL */
async function uploadText(AS, text, filename) {
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const file = new File([blob], filename, { type: 'application/octet-stream' });
  const uploaded = await AS.uploadFile(file);
  return uploaded?.url || uploaded?.httpPath;
}

function makeFUItem(url, name) {
  return {
    id: `up-${name}-${url.slice(-8)}`,
    file: { name, size: 0, type: 'application/octet-stream', url, httpPath: url },
    preview: url,
  };
}
