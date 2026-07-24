import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button } from '@agent-spaces/ui';

/**
 * 像素编辑器对话框：iframe 加载本地 Pixelorama web 版（vendor/pixelorama-web）。
 *
 * 通信：iframe 被 service worker 注入 COOP=same-origin 头后，父页面无法直接访问
 * contentWindow（SecurityError）。全程用 postMessage（不受 COOP 阻断）：
 *   - 父→Godot：iframe.contentWindow.postMessage({type:'pxr-load',data,name})，上游图 base64
 *     Godot 端 _define_js 注册的 message 监听器塞入队列，_process 轮询消费逐张导入
 *   - Godot→父：window.parent.postMessage({type:'pxr-ready'|'pxr-export'|'pxr-export-done'})
 *     父 window.addEventListener('message') 收
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.frames 输入图 URL 数组
 * @param {(urls: string[]) => void} props.onSave 导出完成回调
 * @param {() => void} props.onClose
 */
export default function PixelEditorDialog({ open, frames, createMode = 'multi', onSave, onClose }) {
  const iframeRef = useRef(null);
  const exportedRef = useRef([]);          // 已导出 url 累积
  const injectedRef = useRef(false);       // 本轮是否已注入上游图
  const readyRef = useRef(false);          // Godot 是否已就绪（message 回调写入）
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const createModeRef = useRef(createMode);
  createModeRef.current = createMode;
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [injecting, setInjecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const inputFrames = frames || [];

  // 构造 Pixelorama index.html 的 path 段 URL（免 token，auth.ts:36 放行 src/file/）
  // 用父页面 origin 拼，保证 dev(3000)/dist(3100) 都与父同源，避免 COOP/跨域阻断通信。
  // projectId 从 srcFileUrl 解析（srcFileUrl 的 origin 可能是 dist，需替换成父 origin）。
  // 固定带 ?nosplash=1：嵌入场景始终跳过启动欢迎页和会话恢复弹窗。
  const pixeloramaUrl = (() => {
    const AS = window.AgentSpaces;
    let projectId = 'game-asset-canvas';
    if (AS?.srcFileUrl) {
      const sample = AS.srcFileUrl('x');
      const m = sample.match(/\/api\/mini-apps\/([^/]+)\/src\/file/);
      if (m) projectId = m[1];
    }
    return `${window.location.origin}/api/mini-apps/${projectId}/src/file/vendor/pixelorama-web/index.html?nosplash=1`;
  })();

  // postMessage 到 iframe（COOP 下 contentWindow.postMessage 仍可用，访问属性才被拦）
  const postToIframe = useCallback((payload) => {
    try {
      const w = iframeRef.current?.contentWindow;
      console.log('[pxr-parent] postToIframe', payload.type, 'hasContentWindow=', !!w, 'dataLen=', payload.data?.length || 0);
      if (!w) return false;
      w.postMessage(payload, '*');
      return true;
    } catch (err) {
      console.error('[pxr-parent] postToIframe failed:', err);
      return false;
    }
  }, []);

  // 把一张图 URL 转成 base64 data URL（经 proxyImageUrl 代理避免跨域污染 canvas）
  const imageUrlToDataUrl = useCallback(async (url) => {
    const AS = window.AgentSpaces;
    const proxied = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
    const resp = await fetch(proxied);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('图片转 base64 失败'));
      reader.readAsDataURL(blob);
    });
  }, []);

  // 注入所有上游图到 Pixelorama（需 ready）
  const injectFrames = useCallback(async () => {
    if (!readyRef.current || !inputFrames.length || injectedRef.current) return;
    const mode = createModeRef.current;
    setInjecting(true);
    setStatusMsg(`正在注入 ${inputFrames.length} 张图（${mode === 'frames' ? '关键帧' : '多文件'}）…`);
    try {
      for (let i = 0; i < inputFrames.length; i++) {
        const dataUrl = await imageUrlToDataUrl(inputFrames[i]);
        const ok = postToIframe({ type: 'pxr-load', data: dataUrl, name: `frame-${i + 1}.png`, mode, index: i });
        if (!ok) throw new Error('postMessage 到 iframe 失败');
        // 关键帧模式：首帧建 project 需要时间，后续帧依赖 project 存在，逐帧间隔
        if (mode === 'frames' && i === 0) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      injectedRef.current = true;
      setStatusMsg(`已注入 ${inputFrames.length} 张图，可开始编辑`);
    } catch (err) {
      console.error('inject frames failed:', err);
      setLoadError(`注入图片失败：${err?.message || String(err)}`);
    } finally {
      setInjecting(false);
    }
  }, [inputFrames, imageUrlToDataUrl, postToIframe]);

  // 全局 message 监听（收 Godot 的 ready / export / export-done）
  useEffect(() => {
    if (!open) return;
    const onMsg = async (event) => {
      const msg = event.data || {};
      if (typeof msg !== 'object' || !msg.type) return;
      console.log('[pxr-parent] recv msg', msg.type, 'from', event.origin);
      if (msg.type === 'pxr-ready') {
        readyRef.current = true;
        setReady(true);
        setLoadError('');
        // 就绪后自动注入一次
        injectFrames();
      } else if (msg.type === 'pxr-export') {
        // {type, data: dataUrl, name}
        try {
          const blob = await (await fetch(msg.data)).blob();
          const AS = window.AgentSpaces;
          if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
          const file = new File([blob], msg.name || `pixel-${Date.now()}.png`, { type: 'image/png' });
          const uploaded = await AS.uploadFile(file);
          const httpUrl = uploaded?.url || uploaded?.httpPath;
          if (httpUrl) {
            exportedRef.current.push(httpUrl);
            setStatusMsg(`导出中 ${exportedRef.current.length}…`);
          }
        } catch (err) {
          console.error('pxr-export upload failed:', err);
          setExportError(err?.message || String(err));
        }
      } else if (msg.type === 'pxr-export-done') {
        setExporting(false);
        if (msg.ok) {
          const urls = exportedRef.current.slice();
          setStatusMsg(`导出完成，共 ${urls.length} 帧`);
          if (urls.length) onSaveRef.current?.(urls);
          else setExportError('Pixelorama 没有可导出的帧');
        } else {
          setExportError(`Godot 导出失败：${msg.reason || '未知'}`);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [open, injectFrames]);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      exportedRef.current = [];
      injectedRef.current = false;
      readyRef.current = false;
      setReady(false);
      setLoadError('');
      setExportError('');
      setStatusMsg('正在加载 Pixelorama（首次约 10s）…');
    }
  }, [open]);

  // 触发导出
  const handleExport = useCallback(() => {
    if (!readyRef.current) {
      setExportError('Pixelorama 尚未就绪');
      return;
    }
    exportedRef.current = [];
    setExporting(true);
    setExportError('');
    setStatusMsg('等待 Godot 导出…');
    const ok = postToIframe({ type: 'pxr-export' });
    if (!ok) {
      setExporting(false);
      setExportError('postMessage 到 iframe 失败');
    }
  }, [postToIframe]);

  // 手动重新注入
  const handleReinject = useCallback(() => {
    injectedRef.current = false;
    injectFrames();
  }, [injectFrames]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="gap-0 p-0 overflow-hidden flex flex-col w-[92vw] max-w-[92vw] sm:max-w-none"
        style={{ width: '92vw', maxWidth: '92vw', maxHeight: '94vh', height: '94vh' }}
      >
        <DialogHeader className="px-4 py-3 border-b border-border !gap-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>👾 像素编辑器（Pixelorama）</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button size="sm" variant="outline" disabled={!ready || injecting || exporting} onClick={handleReinject}>
                {injecting ? '注入中…' : '重新注入上游图'}
              </Button>
              <Button size="sm" disabled={!ready || exporting} onClick={handleExport}>
                {exporting ? '导出中…' : '从 Pixelorama 导出'}
              </Button>
            </div>
          </div>
          {statusMsg && <div className="mt-1 text-[11px] text-muted-foreground">{statusMsg}</div>}
        </DialogHeader>

        {loadError && (
          <p className="px-4 py-2 text-xs text-red-500 bg-red-500/10 whitespace-pre-wrap">
            加载失败：{loadError}
          </p>
        )}
        {exportError && (
          <p className="px-4 py-2 text-xs text-red-500 bg-red-500/10">导出失败：{exportError}</p>
        )}

        {/* Pixelorama iframe 主体 */}
        <div className="relative flex min-h-0 flex-1 bg-black">
          <iframe
            ref={iframeRef}
            src={pixeloramaUrl}
            title="Pixelorama"
            allow="autoplay; fullscreen"
            className="h-full w-full border-0"
          />
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          打开后上游图自动注入为新 tab · 编辑后点「从 Pixelorama 导出」回传所有帧 · 首次加载 wasm 较慢（~10s）
        </div>
      </DialogContent>
    </Dialog>
  );
}
