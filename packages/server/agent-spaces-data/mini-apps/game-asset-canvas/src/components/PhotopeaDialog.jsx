import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button } from '@agent-spaces/ui';

/**
 * Photopea 在线 PS 对话框：iframe 嵌入云端 Photopea（https://www.photopea.com）。
 *
 * 通信协议（Photopea 官方 Live Messaging，跨域，targetOrigin 用 '*'）：
 *   - OE → Photopea：
 *       · String = 脚本，会被 Photopea 执行（如 `app.activeDocument.saveToOE("png");`）
 *       · ArrayBuffer = 二进制文件（psd/png/jpg…），Photopea 自动作为新文档打开
 *   - Photopea → OE：
 *       · "done"（String）= 初始化完成 / 上一条消息处理完毕
 *       · ArrayBuffer = saveToOE 的导出结果（PNG/JPG/PSD…）
 *       · 其他 String = app.echoToOE(...) 的回传内容
 *
 * 注：Photopea 是第三方云端服务（非本地 vendor），跨域 postMessage 无法校验 origin，
 * 监听器不做 origin 过滤；只处理 'done' 字符串与 ArrayBuffer 两类已知消息。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.inputImages 输入图 URL 数组（打开后逐张注入为新文档）
 * @param {(urls: string[]) => void} props.onSave 导出完成回调
 * @param {() => void} props.onClose
 */
export default function PhotopeaDialog({ open, inputImages, onSave, onClose }) {
  const iframeRef = useRef(null);
  const readyRef = useRef(false);            // Photopea 是否已就绪（收到首个 "done"）
  const injectedRef = useRef(false);         // 本轮输入图是否已注入
  const injectedCountRef = useRef(0);        // 已注入张数（用于状态展示）
  const pendingExportRef = useRef(false);    // 是否正在等待导出回传
  const exportedRef = useRef([]);            // 本轮导出 url 累积
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const inputImagesRef = useRef(inputImages);
  inputImagesRef.current = inputImages;

  const [ready, setReady] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [exportError, setExportError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const inputs = inputImages || [];

  // Photopea URL：默认配置，禁用 intro 弹窗、隐藏 Save to PSD/Publish（我们用自己的导出）
  // environment 通过 URL hash 传 JSON（Photopea 官方约定）。
  const photopeaUrl = (() => {
    const env = {
      intro: false,
      localsave: false,
      customIO: { open: 'app.echoToOE("photopea:open");' },
    };
    return `https://www.photopea.com#${encodeURIComponent(JSON.stringify(env))}`;
  })();

  const postString = useCallback((script) => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (!w) return false;
      w.postMessage(script, '*');
      return true;
    } catch (err) {
      console.error('[photopea-parent] postString failed:', err);
      return false;
    }
  }, []);

  const postBuffer = useCallback((buf) => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (!w) return false;
      w.postMessage(buf, '*');
      return true;
    } catch (err) {
      console.error('[photopea-parent] postBuffer failed:', err);
      return false;
    }
  }, []);

  // 图片 URL → ArrayBuffer（经 proxyImageUrl 避免跨域 fetch 失败）
  const imageUrlToArrayBuffer = useCallback(async (url) => {
    const AS = window.AgentSpaces;
    const proxied = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
    const resp = await fetch(proxied);
    return await resp.arrayBuffer();
  }, []);

  // 就绪后注入所有输入图（逐张发 ArrayBuffer，每张 Photopea 自动开为新文档）
  const injectImages = useCallback(async () => {
    if (!readyRef.current || injectedRef.current) return;
    const imgs = inputImagesRef.current || [];
    if (!imgs.length) {
      injectedRef.current = true;
      setStatusMsg('Photopea 已就绪，可新建文档编辑');
      return;
    }
    injectedRef.current = true;
    setInjecting(true);
    setStatusMsg(`正在注入 1/${imgs.length} 张图…`);
    try {
      for (let i = 0; i < imgs.length; i++) {
        const buf = await imageUrlToArrayBuffer(imgs[i]);
        const ok = postBuffer(buf);
        if (!ok) throw new Error('postMessage 到 iframe 失败');
        injectedCountRef.current = i + 1;
        setStatusMsg(`已注入 ${i + 1}/${imgs.length} 张图`);
        // 给 Photopea 一点喘息时间处理上一张（避免大图排队）
        if (i < imgs.length - 1) await new Promise((r) => setTimeout(r, 300));
      }
      setStatusMsg(`已注入 ${imgs.length} 张图，可开始编辑`);
    } catch (err) {
      console.error('[photopea-parent] inject failed:', err);
      setLoadError(`图片注入失败：${err?.message || String(err)}`);
    } finally {
      setInjecting(false);
    }
  }, [imageUrlToArrayBuffer, postBuffer]);

  // 全局 message 监听
  useEffect(() => {
    if (!open) return;
    const onMsg = async (event) => {
      const data = event.data;
      // 1) String "done"：初始化完成 / 上一条消息处理完
      if (typeof data === 'string') {
        if (data === 'done') {
          if (!readyRef.current) {
            readyRef.current = true;
            setReady(true);
            setStatusMsg(inputs.length ? 'Photopea 已就绪，准备注入图…' : 'Photopea 已就绪');
            injectImages();
          }
          // 导出完成后 Photopea 也会发 "done"，此时 exporting 已被 ArrayBuffer 分支清掉
          return;
        }
        // 其他字符串（如自定义 echo）忽略，或用于调试
        return;
      }
      // 2) ArrayBuffer：导出结果（saveToOE 产出）
      if (data instanceof ArrayBuffer) {
        if (!pendingExportRef.current) return;
        try {
          const AS = window.AgentSpaces;
          if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
          // 用前几字节判格式（PNG/JPEG/PSD/WebP）；默认 png
          const ext = sniffImageExt(data);
          const blob = new Blob([data], { type: `image/${ext === 'jpeg' ? 'jpeg' : ext === 'webp' ? 'webp' : ext === 'psd' ? 'vnd.adobe.photoshop' : 'png'}` });
          const file = new File([blob], `photopea-${Date.now()}.${ext}`, { type: blob.type });
          const uploaded = await AS.uploadFile(file);
          const httpUrl = uploaded?.url || uploaded?.httpPath;
          if (httpUrl) {
            exportedRef.current.push(httpUrl);
            setStatusMsg(`已导出 ${exportedRef.current.length} 张`);
          }
        } catch (err) {
          console.error('[photopea-parent] export upload failed:', err);
          setExportError(err?.message || String(err));
        } finally {
          pendingExportRef.current = false;
          setExporting(false);
          // 一次导出完成后把累积结果回传
          if (exportedRef.current.length) {
            const urls = exportedRef.current.slice();
            exportedRef.current = [];
            onSaveRef.current?.(urls);
          }
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [open, injectImages, inputs.length]);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      readyRef.current = false;
      injectedRef.current = false;
      injectedCountRef.current = 0;
      pendingExportRef.current = false;
      exportedRef.current = [];
      setReady(false);
      setInjecting(false);
      setExporting(false);
      setLoadError('');
      setExportError('');
      setStatusMsg('正在加载 Photopea…');
    }
  }, [open]);

  // 触发导出（导出当前活动文档为 PNG）
  const handleExport = useCallback(() => {
    if (!readyRef.current) {
      setExportError('Photopea 尚未就绪');
      return;
    }
    pendingExportRef.current = true;
    exportedRef.current = [];
    setExporting(true);
    setExportError('');
    setStatusMsg('等待 Photopea 导出…');
    const ok = postString('app.activeDocument.saveToOE("png");');
    if (!ok) {
      pendingExportRef.current = false;
      setExporting(false);
      setExportError('postMessage 到 iframe 失败');
    }
  }, [postString]);

  // 手动重新注入输入图
  const handleReinject = useCallback(() => {
    injectedRef.current = false;
    injectedCountRef.current = 0;
    injectImages();
  }, [injectImages]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="gap-0 p-0 overflow-hidden flex flex-col w-[92vw] max-w-[92vw] sm:max-w-none"
        style={{ width: '92vw', maxWidth: '92vw', maxHeight: '94vh', height: '94vh' }}
      >
        <DialogHeader className="px-4 py-3 border-b border-border !gap-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>🖌️ 在线 PS（Photopea）</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button size="sm" variant="outline" disabled={!ready || injecting || exporting} onClick={handleReinject}>
                {injecting ? '注入中…' : '重新载入输入图'}
              </Button>
              <Button size="sm" disabled={!ready || exporting} onClick={handleExport}>
                {exporting ? '导出中…' : '从 Photopea 导出 PNG'}
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

        {/* Photopea iframe 主体（跨域，allow 弹窗 / 全屏） */}
        <div className="relative flex min-h-0 flex-1 bg-black">
          <iframe
            ref={iframeRef}
            src={photopeaUrl}
            title="Photopea"
            allow="autoplay; fullscreen; clipboard-read; clipboard-write"
            className="h-full w-full border-0"
          />
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          打开后输入图自动载入为新文档 · 编辑后点「从 Photopea 导出 PNG」回传为节点产出 · 可连线下游
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 用前几字节嗅探图片格式（Photopea saveToOE 可能返回 png/psd/jpeg/webp）
function sniffImageExt(buf) {
  const u8 = new Uint8Array(buf.slice(0, 12));
  // PSD: "8BPS"
  if (u8[0] === 0x38 && u8[1] === 0x42 && u8[2] === 0x50 && u8[3] === 0x53) return 'psd';
  // PNG: 89 50 4E 47
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'png';
  // JPEG: FF D8 FF
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpeg';
  // WebP: "RIFF"...."WEBP"
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46
    && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'webp';
  // GIF: "GIF8"
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return 'gif';
  return 'png';
}
