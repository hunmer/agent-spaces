import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@agent-spaces/ui';
import { getPainterro } from '../utils/image-ops/cdn';

/**
 * 图片编辑器对话框：用 Painterro 编辑单张图片，编辑器挂载到 Dialog 内的独占容器。
 *
 * 设计要点：
 * 1. **必须传 params.id**：Painterro 会用该元素创建自定义事件分发器；不传时会
 *    回退查找 `#app`，宿主页没有该元素，随后会对 null 调用 dispatchEvent。
 * 2. **容器由 Painterro 独占**：Painterro 会改写目标元素 innerHTML，React 的
 *    loading/error 节点不能放进去，避免 React 更新已被第三方库移除的 DOM。
 * 3. **生命周期**：effect deps 只用 [open, imageUrl]，回调用 ref 持有最新值，
 *    避免 StrictMode/父组件重渲染传新引用触发 cleanup→hide() 导致「打开即关」。
 *    Painterro 构造时会先调用一次 hide()，仅在 show() 成功后才响应 onHide。
 *    mountedRef 门控防 StrictMode 双跑。
 * 4. **saveHandler**：Blob → uploadFile → http URL → onSave 回调。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.imageUrl 待编辑图片 URL
 * @param {'edit'|'colorPicker'} [props.mode] 编辑或吸取颜色
 * @param {(urls: string[]) => void} props.onSave 保存产出回调（urls 为 http URL 数组）
 * @param {string} [props.initialColor] 吸取颜色模式的初始颜色
 * @param {(color: string) => void} [props.onColorPick] 确认颜色回调（#rrggbb）
 * @param {() => void} props.onClose 关闭回调
 */
export default function ImageEditorDialog({
  open,
  imageUrl,
  mode = 'edit',
  onSave,
  initialColor = '#000000',
  onColorPick,
  onClose,
}) {
  const colorPickerMode = mode === 'colorPicker';
  const containerRef = useRef(null);           // Painterro 独占的挂载容器
  const containerIdRef = useRef(`painterro-editor-${Math.random().toString(36).slice(2)}`);
  const painterroRef = useRef(null);           // Painterro 实例
  const colorImageRef = useRef(null);
  const colorCanvasRef = useRef(null);
  const savedRef = useRef(false);              // saveHandler 是否已成功保存
  const mountedRef = useRef(false);            // 本轮是否已成功挂载（防 StrictMode 双跑）
  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);
  onSaveRef.current = onSave;
  onCloseRef.current = onClose;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickedColor, setPickedColor] = useState(initialColor || '');

  // 自定义 id 模式不会创建 body wrapper，Dialog 卸载时 React 会回收容器 DOM。
  const cleanupInstance = useCallback(() => {
    try { painterroRef.current?.hide?.(); } catch {}
    painterroRef.current = null;
  }, []);

  // 打开时初始化 Painterro（仅依赖 open + imageUrl，回调用 ref 避免重跑）
  useEffect(() => {
    if (!open || !imageUrl || colorPickerMode) return;
    if (mountedRef.current) return;             // 防 StrictMode 双跑重复创建
    mountedRef.current = true;

    let cancelled = false;
    let notifyHide = false;
    savedRef.current = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const Painterro = await getPainterro();
        if (cancelled) return;
        const AS = window.AgentSpaces;
        if (!containerRef.current) throw new Error('编辑器挂载容器不可用');
        const instance = Painterro({
          id: containerIdRef.current,
          activeFillColor: '#000000',
          activeFillColorAlpha: 0,
          defaultTool: 'brush',
          hiddenTools: ['redo'],
          saveHandler: async (image, done) => {
            try {
              const hasAlpha = typeof image.hasAlphaChannel === 'function' && image.hasAlphaChannel();
              const type = hasAlpha ? 'image/png' : 'image/jpeg';
              const blob = image.asBlob(type, 0.92);
              if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
              const file = new File([blob], `edit-${Date.now()}${hasAlpha ? '.png' : '.jpg'}`, { type });
              const uploaded = await AS.uploadFile(file);
              const httpUrl = uploaded?.url || uploaded?.httpPath;
              if (!httpUrl) throw new Error('上传未返回 URL');
              savedRef.current = true;
              onSaveRef.current?.([httpUrl]);
              done(true);
            } catch (err) {
              console.error('painterro save failed:', err);
              setError(err?.message || String(err));
              done(false);
            }
          },
          onHide: () => {
            // 构造函数会先 hide() 一次；仅响应 show() 后的用户关闭/保存关闭。
            if (notifyHide) onCloseRef.current?.();
          },
        });
        painterroRef.current = instance;
        instance.show(imageUrl);
        notifyHide = true;
      } catch (err) {
        console.error('painterro load/open failed:', err);
        setError(`编辑器加载失败：${err?.message || String(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      notifyHide = false;
      cleanupInstance();
      mountedRef.current = false;
    };
  }, [open, imageUrl, colorPickerMode, cleanupInstance]);

  useEffect(() => {
    if (!open || !colorPickerMode) return;
    setPickedColor(initialColor || '');
    setError(imageUrl ? '' : '请先上传图片或连接上游图片');
  }, [open, colorPickerMode, initialColor, imageUrl]);

  const drawColorImage = useCallback(() => {
    const image = colorImageRef.current;
    const canvas = colorCanvasRef.current;
    if (!image || !canvas || !image.naturalWidth || !image.naturalHeight) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d', { willReadFrequently: true })?.drawImage(image, 0, 0);
  }, []);

  const handlePickColor = useCallback((event) => {
    const canvas = colorCanvasRef.current;
    const image = colorImageRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !image || !ctx) return;
    try {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * canvas.width / rect.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * canvas.height / rect.height)));
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      const color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      setPickedColor(color);

      const scale = canvas.width / rect.width;
      ctx.beginPath();
      ctx.arc(x, y, 7 * scale, 0, Math.PI * 2);
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 9 * scale, 0, Math.PI * 2);
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    } catch (err) {
      setError(`无法读取图片颜色：${err?.message || String(err)}`);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCloseRef.current?.(); }}>
      <DialogContent
        className="gap-0 p-0 overflow-hidden flex flex-col"
        style={{ width: '92vw', maxWidth: '92vw', maxHeight: '94vh', height: '94vh' }}
      >
        <DialogHeader className="relative z-10 shrink-0 px-4 py-3 border-b border-border bg-background !gap-0">
          <DialogTitle>{colorPickerMode ? '吸取颜色' : '🎨 图片编辑器（Painterro）'}</DialogTitle>
        </DialogHeader>

        {error && (
          <p className="shrink-0 px-4 py-2 text-xs text-red-500 bg-red-500/10 whitespace-pre-wrap">{error}</p>
        )}

        {colorPickerMode ? (
          <>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
              <img
                ref={colorImageRef}
                src={imageUrl}
                alt=""
                crossOrigin="anonymous"
                className="hidden"
                onLoad={drawColorImage}
                onError={() => setError('取色图片加载失败')}
              />
              <canvas
                ref={colorCanvasRef}
                onClick={handlePickColor}
                className="block max-h-full max-w-full cursor-crosshair object-contain shadow-sm"
              />
            </div>
            <DialogFooter className="relative z-10 shrink-0 items-center border-t border-border bg-background px-4 py-3 sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="h-6 w-6 shrink-0 rounded border border-border" style={{ backgroundColor: pickedColor || 'transparent' }} />
                <span className="font-mono text-foreground">{pickedColor || '尚未取色'}</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onCloseRef.current?.()}>取消</Button>
                <Button
                  type="button"
                  disabled={!pickedColor}
                  onClick={() => {
                    onColorPick?.(pickedColor);
                    onCloseRef.current?.();
                  }}
                >
                  确定
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
              <style>{`
                #${containerIdRef.current} .ptro-bar {
                  position: absolute !important;
                  z-index: 20 !important;
                }
              `}</style>
              <div
                id={containerIdRef.current}
                ref={containerRef}
                className="ptro-holder"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: 'auto',
                  height: 'auto',
                  overflow: 'hidden',
                  boxShadow: 'none',
                }}
              />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  加载编辑器…
                </div>
              )}
            </div>
            <div className="relative z-10 shrink-0 border-t border-border bg-background px-4 py-2 text-[11px] text-muted-foreground">
              编辑后点工具栏「保存」回传 · 关闭对话框放弃修改
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
