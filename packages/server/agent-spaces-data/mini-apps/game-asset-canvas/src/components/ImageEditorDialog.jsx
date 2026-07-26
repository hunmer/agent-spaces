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
  const savedRef = useRef(false);              // saveHandler 是否已成功保存
  const mountedRef = useRef(false);            // 本轮是否已成功挂载（防 StrictMode 双跑）
  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);
  onSaveRef.current = onSave;
  onCloseRef.current = onClose;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickedColor, setPickedColor] = useState(initialColor || '');
  const [zoomPercent, setZoomPercent] = useState(100);

  // 自定义 id 模式不会创建 body wrapper，Dialog 卸载时 React 会回收容器 DOM。
  const cleanupInstance = useCallback(() => {
    try { painterroRef.current?.hide?.(); } catch {}
    painterroRef.current = null;
  }, []);

  // 打开时初始化 Painterro（仅依赖 open + imageUrl，回调用 ref 避免重跑）
  useEffect(() => {
    if (!open || !imageUrl) return;
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
          hiddenTools: colorPickerMode
            ? ['crop', 'pixelize', 'line', 'arrow', 'rect', 'ellipse', 'text', 'eraser', 'fill', 'rotate', 'resize', 'open', 'save', 'close', 'undo', 'redo', 'settings', 'zoomin', 'zoomout']
            : ['redo'],
          onImageLoaded: () => {
            if (!colorPickerMode) return;
            const current = painterroRef.current;
            setZoomPercent(Math.round((current?.zoomFactor || 1) * 100));
          },
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
        if (colorPickerMode && instance.colorPicker && instance.toolContainer) {
          const picker = instance.colorPicker;
          const pickingArea = instance.toolContainer;
          const pickerDocument = instance.doc || document;
          const zoomer = instance.zoomHelper?.zomer;
          const isPickingTarget = (target) => target === pickingArea || target === zoomer;
          const syncPickingState = (event) => {
            picker.choosing = isPickingTarget(event.target);
          };
          const disablePicking = () => {
            picker.choosing = false;
            picker.choosingActive = false;
            instance.zoomHelper?.hideZoomHelper?.();
          };

          const handlePickedColor = (colorState) => {
            if (colorState?.palleteColor) {
              setPickedColor(colorState.palleteColor);
              setError('');
            }
          };
          instance.closeActiveTool(true);
          picker.target = 'line';
          picker.callback = handlePickedColor;
          picker.addCallback = undefined;
          picker.choosing = true;
          pickerDocument.addEventListener('mousedown', syncPickingState, true);
          pickerDocument.addEventListener('mousemove', syncPickingState, true);
          pickerDocument.addEventListener('touchstart', syncPickingState, true);
          instance.__colorPickerCleanup = () => {
            disablePicking();
            pickerDocument.removeEventListener('mousedown', syncPickingState, true);
            pickerDocument.removeEventListener('mousemove', syncPickingState, true);
            pickerDocument.removeEventListener('touchstart', syncPickingState, true);
          };
        }
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
      painterroRef.current?.__colorPickerCleanup?.();
      cleanupInstance();
      mountedRef.current = false;
    };
  }, [open, imageUrl, colorPickerMode, cleanupInstance]);

  useEffect(() => {
    if (!open || !colorPickerMode) return;
    setPickedColor(initialColor || '');
    setZoomPercent(100);
    setError(imageUrl ? '' : '请先上传图片或连接上游图片');
  }, [open, colorPickerMode, initialColor, imageUrl]);

  const changeZoom = useCallback((delta) => {
    const instance = painterroRef.current;
    if (!instance?.size || typeof instance.setZoom !== 'function') return;
    const current = Math.round((instance.zoomFactor || 1) * 100);
    const next = Math.max(25, Math.min(400, current + delta));
    instance.setZoom(next);
    setZoomPercent(Math.round((instance.zoomFactor || next / 100) * 100));
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

        <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
          <style>{`
            #${containerIdRef.current} .ptro-bar {
              ${colorPickerMode ? 'display: none !important;' : 'position: absolute !important; z-index: 20 !important;'}
            }
            #${containerIdRef.current} .ptro-wrapper {
              ${colorPickerMode ? 'top: 0 !important; bottom: 0 !important;' : ''}
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

        {colorPickerMode ? (
          <DialogFooter className="relative z-10 shrink-0 items-center border-t border-border bg-background px-4 py-3 sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="h-6 w-6 shrink-0 rounded border border-border" style={{ backgroundColor: pickedColor || 'transparent' }} />
              <span className="font-mono text-foreground">{pickedColor || '尚未取色'}</span>
              <div className="ml-2 flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" title="缩小" onClick={() => changeZoom(-25)}>−</Button>
                <span className="w-12 text-center tabular-nums">{zoomPercent}%</span>
                <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" title="放大" onClick={() => changeZoom(25)}>+</Button>
              </div>
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
        ) : (
          <div className="relative z-10 shrink-0 border-t border-border bg-background px-4 py-2 text-[11px] text-muted-foreground">
            编辑后点工具栏「保存」回传 · 关闭对话框放弃修改
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
