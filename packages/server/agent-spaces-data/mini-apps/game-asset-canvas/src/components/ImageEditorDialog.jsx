import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@agent-spaces/ui';
import { getPainterro } from '../utils/image-ops/cdn';

/**
 * 图片编辑器对话框：用 Painterro 编辑单张图片，编辑器 DOM 被搬进 Dialog 容器。
 *
 * 设计要点：
 * 1. **不传 params.id**：Painterro 走默认路径创建 `.ptro-holder-wrapper`
 *    （fixed 全屏遮罩）+ 内嵌 `.ptro-holder`（fixed 内框）。这是 Painterro
 *    最稳定的路径（传 id 会触发 holderEl=null 分支，内部某处会访问 null）。
 * 2. **DOM 搬运**：实例创建后立即用 `instance.holderId` 拿到 wrapper DOM，
 *    移到 Dialog 内的容器。配合 CSS 覆盖 fixed → absolute，撑满容器。
 * 3. **生命周期**：effect deps 只用 [open, imageUrl]，回调用 ref 持有最新值，
 *    避免 StrictMode/父组件重渲染传新引用触发 cleanup→hide() 导致「打开即关」。
 *    mountedRef 门控防 StrictMode 双跑。
 * 4. **saveHandler**：Blob → uploadFile → http URL → onSave 回调。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.imageUrl 待编辑图片 URL
 * @param {(urls: string[]) => void} props.onSave 保存产出回调（urls 为 http URL 数组）
 * @param {() => void} props.onClose 关闭回调
 */
export default function ImageEditorDialog({ open, imageUrl, onSave, onClose }) {
  const containerRef = useRef(null);           // Dialog 内承载 Painterro holder 的容器
  const painterroRef = useRef(null);           // Painterro 实例
  const savedRef = useRef(false);              // saveHandler 是否已成功保存
  const mountedRef = useRef(false);            // 本轮是否已成功挂载（防 StrictMode 双跑）
  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);
  onSaveRef.current = onSave;
  onCloseRef.current = onClose;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 销毁实例 + 还原 DOM（Painterro 默认会把 wrapper 挂到 body，hide 后需手动清掉）
  const cleanupInstance = useCallback(() => {
    try { painterroRef.current?.hide?.(); } catch {}
    // Painterro hide 后会把 wrapper 留在 body，主动清掉防泄漏
    const inst = painterroRef.current;
    if (inst?.holderId) {
      const wrapper = document.getElementById(inst.holderId);
      if (wrapper) wrapper.remove();
    }
    painterroRef.current = null;
  }, []);

  // 打开时初始化 Painterro（仅依赖 open + imageUrl，回调用 ref 避免重跑）
  useEffect(() => {
    if (!open || !imageUrl) return;
    if (mountedRef.current) return;             // 防 StrictMode 双跑重复创建
    mountedRef.current = true;

    let cancelled = false;
    savedRef.current = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const Painterro = await getPainterro();
        if (cancelled) return;
        const AS = window.AgentSpaces;
        const instance = Painterro({
          // 不传 id：走默认全屏 wrapper 路径（最稳定），稍后 DOM 搬进 Dialog
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
            // Painterro 自身关闭（用户点 X 或保存 done(true)）→ 关闭 Dialog
            onCloseRef.current?.();
          },
        });
        painterroRef.current = instance;
        instance.show(imageUrl);

        // DOM 搬运：把 Painterro 默认挂到 body 的 wrapper 移到 Dialog 容器
        if (instance.holderId && containerRef.current) {
          const wrapper = document.getElementById(instance.holderId);
          if (wrapper && containerRef.current !== wrapper.parentElement) {
            containerRef.current.appendChild(wrapper);
          }
        }
      } catch (err) {
        console.error('painterro load/open failed:', err);
        setError(`编辑器加载失败：${err?.message || String(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cleanupInstance();
      mountedRef.current = false;
    };
  }, [open, imageUrl, cleanupInstance]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCloseRef.current?.(); }}>
      <DialogContent
        className="gap-0 p-0 overflow-hidden flex flex-col"
        style={{ width: '92vw', maxWidth: '92vw', maxHeight: '94vh', height: '94vh' }}
      >
        <DialogHeader className="px-4 py-3 border-b border-border !gap-0">
          <DialogTitle>🎨 图片编辑器（Painterro）</DialogTitle>
        </DialogHeader>

        {error && (
          <p className="px-4 py-2 text-xs text-red-500 bg-red-500/10 whitespace-pre-wrap">{error}</p>
        )}

        {/* Painterro holder 搬运目标容器：填满 Dialog 主体。
            Painterro 默认 wrapper/holder 都是 position:fixed，用任意选择器强行改 absolute
            让它们填满此容器（容器本身 position:relative） */}
        <div
          ref={containerRef}
          className="relative flex min-h-0 flex-1 bg-muted/20 [&_.ptro-holder-wrapper]:absolute [&_.ptro-holder-wrapper]:inset-0 [&_.ptro-holder-wrapper]:!w-full [&_.ptro-holder-wrapper]:!h-full [&_.ptro-holder]:!absolute [&_.ptro-holder]:!inset-0 [&_.ptro-holder]:!w-auto [&_.ptro-holder]:!h-auto [&_.ptro-holder]:!flex [&_.ptro-holder]:!shadow-none"
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              加载编辑器…
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          编辑后点工具栏「保存」回传 · 关闭对话框放弃修改
        </div>
      </DialogContent>
    </Dialog>
  );
}
