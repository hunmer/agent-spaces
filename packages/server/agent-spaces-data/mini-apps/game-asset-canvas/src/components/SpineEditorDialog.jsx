import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@agent-spaces/ui';
import ReskinPanel from './ReskinPanel';

/**
 * 骨骼编辑器对话框：iframe 加载本地 PixiJS+pixi-spine 构建产物
 * （vendor/spine-editor-web/index.html）。
 *
 * 通信协议（与 spine-editor-build/src/main.js 配对）：
 *   iframe→父 `spine:ready`：编辑器就绪 → 注入上传的 .skel/.atlas/.png
 *   iframe→父 `spine:export-screenshot` {dataUrl, name}：截图 → uploadFile → http URL
 *   iframe→父 `spine:export-video` {dataUrl, name}：动作录制（WebM）→ uploadFile → http URL
 *   iframe→父 `spine:export-spine` {files:[{name,dataUrl}]}：原始文件包 → 逐个 uploadFile
 *   iframe→父 `spine:export-pose` {json, name}：姿势 JSON（文本，直接回传不经 uploadFile）
 *   父→iframe `spine:inject-assets` {skelDataUrl, atlasDataUrl, pngDataUrl, name}
 *   父→iframe `spine:request-snapshot`：请求 canvas 截图（换肤用）
 *   iframe→父 `spine:snapshot` {dataUrl}：canvas 截图回传
 *   父→iframe `spine:replace-atlas` {pngDataUrl, name}：热加载新 atlas sheet（换肤预览）
 *   iframe→父 `spine:atlas-replaced` {name} | {error}：热加载结果回执
 *
 * iframe 同源（父 origin + srcFileUrl 路径段），无跨域阻断。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {object|null} props.assets {skel, atlas, png, name}（http URL），null 表示用编辑器内置角色库
 * @param {(urls: string[]) => void} props.onSave 截图/文件导出完成回调
 * @param {(poseJson: string) => void} props.onPoseExport 姿势 JSON 导出回调
 * @param {(url: string) => void} props.onExportVideo 动作录制视频导出回调
 * @param {(assets:{skel,atlas,png,spineJson}) => void} [props.onReskinComplete] 换肤完成回调
 * @param {() => void} props.onClose
 */
export default function SpineEditorDialog({ open, assets, onSave, onPoseExport, onExportVideo, onReskinComplete, onClose }) {
  const iframeRef = useRef(null);
  const readyRef = useRef(false);
  const injectedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const onPoseExportRef = useRef(onPoseExport);
  const onExportVideoRef = useRef(onExportVideo);
  const onReskinCompleteRef = useRef(onReskinComplete);
  onSaveRef.current = onSave;
  onPoseExportRef.current = onPoseExport;
  onExportVideoRef.current = onExportVideo;
  onReskinCompleteRef.current = onReskinComplete;
  const [ready, setReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  // 换肤用的 snapshot 回调暂存（requestSnapshot 发消息后等待 spine:snapshot 回传）
  const snapshotResolverRef = useRef(null);

  // 构造编辑器 index.html 的同源 URL（参考 PixelEditorDialog 的 projectId 解析）
  const editorUrl = (() => {
    const AS = window.AgentSpaces;
    let projectId = 'game-asset-canvas';
    if (AS?.srcFileUrl) {
      const sample = AS.srcFileUrl('x');
      const m = sample.match(/\/api\/mini-apps\/([^/]+)\/src\/file/);
      if (m) projectId = m[1];
    }
    return `${window.location.origin}/api/mini-apps/${projectId}/src/file/vendor/spine-editor-web/index.html`;
  })();

  const postToIframe = useCallback((type, payload = {}) => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (!w) return false;
      w.postMessage({ type, payload }, '*');
      return true;
    } catch (err) {
      console.error('[spine-parent] postToIframe failed:', err);
      return false;
    }
  }, []);

  // 把 http URL 资源转成 base64 dataUrl（经 proxyImageUrl 代理避免跨域）
  const urlToDataUrl = useCallback(async (url) => {
    const AS = window.AgentSpaces;
    const proxied = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
    const resp = await fetch(proxied);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('资源转 base64 失败'));
      reader.readAsDataURL(blob);
    });
  }, []);

  // 就绪后注入资源（仅一次）
  const injectAssets = useCallback(async () => {
    if (!readyRef.current || injectedRef.current) return;
    if (!assets) {
      // 无上传资源：用编辑器内置角色库，不注入
      setStatusMsg('编辑器已就绪，可从左侧角色库选择角色');
      return;
    }
    injectedRef.current = true;
    setStatusMsg(`正在注入 Spine 资源（${assets.name}）…`);
    try {
      const [skelDataUrl, atlasDataUrl, pngDataUrl] = await Promise.all([
        urlToDataUrl(assets.skel),
        urlToDataUrl(assets.atlas),
        urlToDataUrl(assets.png),
      ]);
      const ok = postToIframe('spine:inject-assets', {
        skelDataUrl, atlasDataUrl, pngDataUrl, name: assets.name,
      });
      if (!ok) throw new Error('postMessage 到 iframe 失败');
      setStatusMsg(`已注入 ${assets.name}，可开始编辑骨骼`);
    } catch (err) {
      console.error('[spine-parent] inject assets failed:', err);
      setLoadError(`资源注入失败：${err?.message || String(err)}`);
    }
  }, [assets, urlToDataUrl, postToIframe]);

  // 请求 iframe 当前 canvas 截图（换肤用）：发消息后等待 spine:snapshot 回传
  const requestSnapshot = useCallback(() => {
    return new Promise((resolve) => {
      // 超时兜底（10s）
      const timer = setTimeout(() => {
        snapshotResolverRef.current = null;
        resolve(null);
      }, 10000);
      snapshotResolverRef.current = (dataUrl) => {
        clearTimeout(timer);
        resolve(dataUrl);
      };
      const ok = postToIframe('spine:request-snapshot');
      if (!ok) {
        clearTimeout(timer);
        snapshotResolverRef.current = null;
        resolve(null);
      }
    });
  }, [postToIframe]);

  // 全局 message 监听
  useEffect(() => {
    if (!open) return;
    const onMsg = async (event) => {
      // 编辑器与父同源（src/file 路由），但用 '*' 广播时 origin 仍校验
      // 这里宽松处理：只要 type 命中即处理
      const msg = event.data || {};
      if (typeof msg !== 'object' || !msg.type) return;
      console.log('[spine-parent] recv', msg.type);
      if (msg.type === 'spine:ready') {
        readyRef.current = true;
        setReady(true);
        setStatusMsg(assets ? '编辑器已就绪，准备注入资源…' : '编辑器已就绪');
        injectAssets();
      } else if (msg.type === 'spine:export-screenshot') {
        // {dataUrl, name}
        try {
          const blob = await (await fetch(msg.payload.dataUrl)).blob();
          const AS = window.AgentSpaces;
          if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
          const fileName = msg.payload.name || `spine-${Date.now()}.png`;
          const file = new File([blob], fileName, { type: blob.type || 'image/png' });
          const uploaded = await AS.uploadFile(file);
          const httpUrl = uploaded?.url || uploaded?.httpPath;
          if (httpUrl) {
            setStatusMsg(`截图已回传：${fileName}`);
            onSaveRef.current?.([httpUrl]);
          }
        } catch (err) {
          console.error('[spine-parent] screenshot upload failed:', err);
          setLoadError(err?.message || String(err));
        }
      } else if (msg.type === 'spine:export-video') {
        // {dataUrl, name} —— 动作录制 WebM，逻辑同 screenshot，MIME 用 video/webm
        try {
          const blob = await (await fetch(msg.payload.dataUrl)).blob();
          const AS = window.AgentSpaces;
          if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
          const fileName = msg.payload.name || `spine-${Date.now()}.webm`;
          const file = new File([blob], fileName, { type: blob.type || 'video/webm' });
          const uploaded = await AS.uploadFile(file);
          const httpUrl = uploaded?.url || uploaded?.httpPath;
          if (httpUrl) {
            setStatusMsg(`视频已回传：${fileName}`);
            onExportVideoRef.current?.(httpUrl);
          }
        } catch (err) {
          console.error('[spine-parent] video upload failed:', err);
          setLoadError(err?.message || String(err));
        }
      } else if (msg.type === 'spine:export-spine') {
        // {files:[{name,dataUrl}]}
        const files = msg.payload?.files || [];
        if (!files.length) return;
        try {
          const AS = window.AgentSpaces;
          if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
          const urls = [];
          for (let i = 0; i < files.length; i++) {
            const blob = await (await fetch(files[i].dataUrl)).blob();
            const file = new File([blob], files[i].name, { type: blob.type || 'application/octet-stream' });
            const uploaded = await AS.uploadFile(file);
            const httpUrl = uploaded?.url || uploaded?.httpPath;
            if (httpUrl) urls.push(httpUrl);
            setStatusMsg(`导出文件 ${i + 1}/${files.length}…`);
          }
          if (urls.length) {
            setStatusMsg(`已导出 ${urls.length} 个文件`);
            onSaveRef.current?.(urls);
          }
        } catch (err) {
          console.error('[spine-parent] spine files upload failed:', err);
          setLoadError(err?.message || String(err));
        }
      } else if (msg.type === 'spine:export-pose') {
        // {json, name} —— 纯文本，直接回传
        onPoseExportRef.current?.(msg.payload.json);
        setStatusMsg(`已导出姿势 JSON：${msg.payload.name}`);
      } else if (msg.type === 'spine:snapshot') {
        // {dataUrl} | {error} —— 换肤请求的 canvas 截图回传
        if (snapshotResolverRef.current) {
          snapshotResolverRef.current(msg.payload?.dataUrl || null);
          snapshotResolverRef.current = null;
        }
      } else if (msg.type === 'spine:atlas-replaced') {
        // 热加载结果回执
        if (msg.payload?.error) {
          setStatusMsg(`换肤预览失败：${msg.payload.error}`);
        } else {
          setStatusMsg(`已应用换肤：${msg.payload?.name || ''}`);
        }
      } else if (msg.type === 'spine:atlas-info') {
        // atlas 信息（调试用，暂不处理）
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [open, injectAssets, assets]);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      readyRef.current = false;
      injectedRef.current = false;
      setReady(false);
      setLoadError('');
      setStatusMsg('正在加载骨骼编辑器…');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="gap-0 p-0 overflow-hidden flex flex-col w-[92vw] max-w-[92vw] sm:max-w-none"
        style={{ width: '92vw', maxWidth: '92vw', maxHeight: '94vh', height: '94vh' }}
      >
        <DialogHeader className="px-4 py-3 border-b border-border !gap-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>🦴 骨骼编辑器</DialogTitle>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {ready ? '✓ 已就绪' : '加载中…'}
              </span>
            </div>
          </div>
          {statusMsg && <div className="mt-1 text-[11px] text-muted-foreground">{statusMsg}</div>}
        </DialogHeader>

        {loadError && (
          <p className="px-4 py-2 text-xs text-red-500 bg-red-500/10 whitespace-pre-wrap">
            {loadError}
          </p>
        )}

        {/* 编辑器 iframe 主体 + 换肤侧栏 */}
        <div className="relative flex min-h-0 flex-1">
          <div className="relative flex min-h-0 flex-1 bg-black">
            <iframe
              ref={iframeRef}
              src={editorUrl}
              title="骨骼编辑器"
              allow="autoplay; fullscreen"
              className="h-full w-full border-0"
            />
          </div>
          {/* AI 换肤侧栏 */}
          <div className="flex w-64 flex-shrink-0 flex-col border-l border-border bg-background">
            <ReskinPanel
              assets={assets}
              postToIframe={postToIframe}
              requestSnapshot={requestSnapshot}
              onReskinComplete={(reskinAssets) => onReskinCompleteRef.current?.(reskinAssets)}
            />
          </div>
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          左键拖圆点移动骨骼 · 右键拖旋转 · 滚轮缩放 · 空格+拖拽平移 · Ctrl+Z/Y 撤销重做 · 导出后自动回传节点
        </div>
      </DialogContent>
    </Dialog>
  );
}
