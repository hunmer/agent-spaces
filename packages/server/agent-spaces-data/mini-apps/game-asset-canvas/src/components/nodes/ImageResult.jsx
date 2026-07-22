import { useState } from 'react';

/**
 * 节点内的图片网格结果展示，点击放大。
 * @param {{ images: string[], max?: number }} props
 */
export default function ImageResult({ images, max = 9 }) {
  const [active, setActive] = useState(null);
  const list = (images || []).slice(0, max);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">产出（{images?.length || 0}）</span>
      <div className="grid grid-cols-3 gap-1">
        {list.map((url, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setActive(url)}
            className="block aspect-square overflow-hidden rounded border border-border"
          >
            <img src={url} alt="" className="h-full w-full object-cover transition hover:opacity-80" />
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setActive(null)}
        >
          <img src={active} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
