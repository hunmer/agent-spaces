import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@agent-spaces/ui';

/**
 * 3D导演台对话框：iframe 加载本地 storyai-3d-director-desk 构建产物
 * （vendor/director-desk-web/index.html）。
 *
 * 通信协议（storyai-3d-director-desk/src/editor/io/hostBridge.ts 已实现）：
 *   - iframe→父 `storyai:director-desk-ready`：导演台就绪
 *   - iframe→父 `storyai:director-desk-close`：用户点导演台右上角 X（嵌入时由父端关 dialog）
 *   - iframe→父 `storyai:director-desk-captures-sent`：
 *       payload = { captures: [{ dataUrl, fileName }] }
 *       每张 dataUrl 经宿主 uploadFile 转 http URL，全部回传后一次性 onSave(urls)
 *   - 父→iframe `storyai:director-desk-panorama`：
 *       payload = { imageUrl, fileName } 把上游连线/上传的全景图作为背景导入
 *
 * iframe 同源（父页面 origin + srcFileUrl 路径段），无 COOP/COEP/跨域阻断。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.panoramaUrls 可选全景图 URL（上游连线或本地上传），就绪后逐张注入
 * @param {(urls: string[]) => void} props.onSave 截图导出完成回调
 * @param {() => void} props.onClose
 */
export default function DirectorDeskDialog({ open, panoramaUrls, onSave, onClose }) {
  const iframeRef = useRef(null);
  const readyRef = useRef(false);          // 导演台是否已就绪
  const injectedRef = useRef(false);       // 本轮全景图是否已注入
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const panoramas = Array.isArray(panoramaUrls) ? panoramaUrls : [];

  // 构造导演台 index.html 的同源 URL（参考 PixelEditorDialog 的 projectId 解析）
  const deskUrl = (() => {
    const AS = window.AgentSpaces;
    let projectId = 'game-asset-canvas';
    if (AS?.srcFileUrl) {
      const sample = AS.srcFileUrl('x');
      const m = sample.match(/\/api\/mini-apps\/([^/]+)\/src\/file/);
      if (m) projectId = m[1];
    }
    return `${window.location.origin}/api/mini-apps/${projectId}/src/file/vendor/director-desk-web/index.html`;
  })();

  // postMessage 到 iframe（同源，可直访 contentWindow；try/catch 兜底）
  const postToIframe = useCallback((type, payload = {}) => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (!w) return false;
      w.postMessage({ type, payload }, window.location.origin);
      return true;
    } catch (err) {
      console.error('[director-desk-parent] postToIframe failed:', err);
      return false;
    }
  }, []);

  // 把一张图 URL 转成 dataUrl 注入全景图（fetch 同源 / proxyImageUrl）
  const imageUrlToDataUrl = useCallback(async (url) => {
    const AS = window.AgentSpaces;
    const proxied = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
    const resp = await fetch(proxied);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('全景图转 base64 失败'));
      reader.readAsDataURL(blob);
    });
  }, []);

  // 就绪后注入全景图（仅一次）
  const injectPanoramas = useCallback(async () => {
    if (!readyRef.current || injectedRef.current || !panoramas.length) return;
    injectedRef.current = true;
    setStatusMsg(`正在注入 ${panoramas.length} 张全景图…`);
    try {
      for (let i = 0; i < panoramas.length; i++) {
        const dataUrl = await imageUrlToDataUrl(panoramas[i]);
        const ok = postToIframe('storyai:director-desk-panorama', {
          imageUrl: dataUrl,
          fileName: `panorama-${i + 1}.png`,
        });
        if (!ok) throw new Error('postMessage 到 iframe 失败');
      }
      setStatusMsg(panoramas.length === 1 ? '已注入全景图，可开始导演' : `已注入 ${panoramas.length} 张全景图`);
    } catch (err) {
      console.error('[director-desk-parent] inject panoramas failed:', err);
      setLoadError(`全景图注入失败：${err?.message || String(err)}`);
    }
  }, [panoramas, imageUrlToDataUrl, postToIframe]);

  // 全局 message 监听
  useEffect(() => {
    if (!open) return;
    const onMsg = async (event) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data || {};
      if (typeof msg !== 'object' || !msg.type) return;
      console.log('[director-desk-parent] recv', msg.type);
      if (msg.type === 'storyai:director-desk-ready') {
        readyRef.current = true;
        setReady(true);
        setStatusMsg(panoramas.length ? '导演台已就绪，准备注入全景图…' : '导演台已就绪，可开始导演');
        injectPanoramas();
      } else if (msg.type === 'storyai:director-desk-captures-sent') {
        // 导出截图列表：每张 dataUrl → uploadFile → 收集 httpUrl → onSave
        const captures = msg.payload?.captures || [];
        if (!captures.length) {
          setStatusMsg('导演台没有发送截图');
          return;
        }
        try {
          const AS = window.AgentSpaces;
          if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
          const urls = [];
          for (let i = 0; i < captures.length; i++) {
            const dataUrl = captures[i].dataUrl;
            const fileName = captures[i].fileName || `director-desk-${i + 1}.png`;
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], fileName, { type: blob.type || 'image/png' });
            const uploaded = await AS.uploadFile(file);
            const httpUrl = uploaded?.url || uploaded?.httpPath;
            if (httpUrl) urls.push(httpUrl);
            setStatusMsg(`导出中 ${i + 1}/${captures.length}…`);
          }
          if (urls.length) {
            setStatusMsg(`已获取 ${urls.length} 张截图`);
            onSaveRef.current?.(urls);
          } else {
            setStatusMsg('截图上传失败');
          }
        } catch (err) {
          console.error('[director-desk-parent] captures upload failed:', err);
          setLoadError(err?.message || String(err));
        }
      } else if (msg.type === 'storyai:director-desk-close') {
        // 用户点了 iframe 内的关闭按钮 → 关 dialog
        onClose?.();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [open, injectPanoramas, onClose]);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      readyRef.current = false;
      injectedRef.current = false;
      setReady(false);
      setLoadError('');
      setStatusMsg('正在加载 3D 导演台…');
    }
  }, [open]);

  // 提示用户在导演台里点截图按钮（导出由导演台主动 postMessage，父端无需按钮）
  const handleHintExport = useCallback(() => {
    setStatusMsg('请在左侧「截图」面板点击「当前/四方位/十二方位视角截图」按钮');
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="gap-0 p-0 overflow-hidden flex flex-col w-[92vw] max-w-[92vw] sm:max-w-none"
        style={{ width: '92vw', maxWidth: '92vw', maxHeight: '94vh', height: '94vh' }}
      >
        <DialogHeader className="px-4 py-3 border-b border-border !gap-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>🎥 3D导演台</DialogTitle>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={!ready}
                onClick={handleHintExport}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50"
              >
                如何导出？
              </button>
            </div>
          </div>
          {statusMsg && <div className="mt-1 text-[11px] text-muted-foreground">{statusMsg}</div>}
        </DialogHeader>

        {loadError && (
          <p className="px-4 py-2 text-xs text-red-500 bg-red-500/10 whitespace-pre-wrap">
            {loadError}
          </p>
        )}

        {/* 导演台 iframe 主体 */}
        <div className="relative flex min-h-0 flex-1 bg-black">
          <iframe
            ref={iframeRef}
            src={deskUrl}
            title="3D导演台"
            allow="autoplay; fullscreen"
            className="h-full w-full border-0"
          />
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          在左侧「截图」面板点视角截图按钮 → 截图自动回传为节点产出 · 可连线下游
        </div>
      </DialogContent>
    </Dialog>
  );
}
