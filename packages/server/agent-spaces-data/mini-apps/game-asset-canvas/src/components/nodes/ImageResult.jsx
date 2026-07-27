import { FolderPlus, openMediaGallery } from '@agent-spaces/ui';

/**
 * 节点内的图片网格结果展示，点击用 MediaGallery 打开大图（可翻页）。
 * @param {{ images: string[], max?: number, preview?: boolean, onImageLoad?: Function, onAddToAssets?: (urls:string|string[])=>void }} props
 * @param {number} [props.max] 单网格最多展示张数，0 或缺省表示全部（GIF 拆帧等可能产出数十帧）
 * @param {boolean} [props.preview] 输出预览模式：无标签/边框，图片全宽纵向排列
 * @param {Function} [props.onImageLoad] 图片加载完成回调
 * @param {Function} [props.onAddToAssets] 传入则每张图右上角显示「添加到素材库」按钮，点击回传该张图 url
 */
export default function ImageResult({ images, max = 0, preview = false, onImageLoad, onAddToAssets }) {
  const all = images || [];
  const list = max > 0 ? all.slice(0, max) : all;
  if (!list.length) return null;

  const items = list.map((src) => ({ src, type: 'image' }));

  const open = (index) => {
    openMediaGallery(items, index);
  };

  if (preview) {
    return (
      <div className="flex w-full flex-col gap-2">
        {list.map((url, i) => (
          <button
            type="button"
            key={i}
            onClick={(e) => { e.stopPropagation(); open(i); }}
            className="block w-full overflow-hidden"
          >
            <img src={url} alt="" className="block h-auto w-full object-contain" onLoad={onImageLoad} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">产出（{all.length}）</span>
      <div className="grid grid-cols-3 gap-1">
        {list.map((url, i) => (
          <div key={i} className="group/ir relative block aspect-square overflow-visible rounded border border-border">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); open(i); }}
              className="block h-full w-full overflow-hidden rounded"
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
            {onAddToAssets && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddToAssets(url); }}
                title="添加到素材库"
                className="absolute -right-1 -top-1 z-20 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
              >
                <FolderPlus className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
