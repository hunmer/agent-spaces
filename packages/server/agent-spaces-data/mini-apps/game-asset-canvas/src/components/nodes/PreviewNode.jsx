import { useState } from 'react';
import NodeShell from './NodeShell';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 图片预览节点：接收上游通过连线推入的图片，网格展示 + 点击放大。
 * data.images: string[]
 */
export default function PreviewNode({ id, data }) {
  const images = data?.images || [];
  const [active, setActive] = useState(null);

  return (
    <NodeShell nodeType={NODE_TYPES.preview} data={data} targetHandle>
      {images.length === 0 ? (
        <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">
          <span className="text-2xl">🖼️</span>
          <span>连接上游节点以接收图片</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {images.map((url, i) => (
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
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setActive(null)}
        >
          <img src={active} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </NodeShell>
  );
}
