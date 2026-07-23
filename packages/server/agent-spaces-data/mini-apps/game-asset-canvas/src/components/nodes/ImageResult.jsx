import { openMediaGallery } from '@agent-spaces/ui';

/**
 * 节点内的图片网格结果展示，点击用 MediaGallery 打开大图（可翻页）。
 * @param {{ images: string[], max?: number }} props
 */
export default function ImageResult({ images, max = 9 }) {
  const list = (images || []).slice(0, max);
  if (!list.length) return null;

  const items = images.map((src) => ({ src, type: 'image' }));

  const open = (index) => {
    // 把点击的那张作为起始页，MediaGallery 内可左右翻页看全部
    openMediaGallery(items.slice(0, max), index);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">产出（{images?.length || 0}）</span>
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
