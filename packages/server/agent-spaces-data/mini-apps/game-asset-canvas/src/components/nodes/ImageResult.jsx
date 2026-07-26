import { openMediaGallery } from '@agent-spaces/ui';

/**
 * 节点内的图片网格结果展示，点击用 MediaGallery 打开大图（可翻页）。
 * @param {{ images: string[], max?: number, preview?: boolean, onImageLoad?: Function }} props
 * @param {number} [props.max] 单网格最多展示张数，0 或缺省表示全部（GIF 拆帧等可能产出数十帧）
 * @param {boolean} [props.preview] 输出预览模式：无标签/边框，图片全宽纵向排列
 * @param {Function} [props.onImageLoad] 图片加载完成回调
 */
export default function ImageResult({ images, max = 0, preview = false, onImageLoad }) {
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
          <button
            type="button"
            key={i}
            onClick={(e) => { e.stopPropagation(); open(i); }}
            className="block aspect-square overflow-hidden rounded border border-border"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
