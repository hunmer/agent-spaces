import { openMediaGallery } from '@agent-spaces/ui';

/**
 * 节点内的图片网格结果展示，点击用 MediaGallery 打开大图（可翻页）。
 * @param {{ images: string[], max?: number }} props
 * @param {number} [props.max] 单网格最多展示张数，0 或缺省表示全部（GIF 拆帧等可能产出数十帧）
 */
export default function ImageResult({ images, max = 0 }) {
  const all = images || [];
  const list = max > 0 ? all.slice(0, max) : all;
  if (!list.length) return null;

  const items = list.map((src) => ({ src, type: 'image' }));

  const open = (index) => {
    openMediaGallery(items, index);
  };

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
