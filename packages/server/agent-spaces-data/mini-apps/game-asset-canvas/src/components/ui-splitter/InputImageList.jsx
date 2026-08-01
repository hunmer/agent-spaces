/**
 * UiSplitterDialog 顶部输入图缩略图横条。
 * 展示每张输入图，点击切换激活图；左上 badge 显示切片数，禁用导出时变灰。
 * 纯展示组件，无内部状态。
 */
export default function InputImageList({ thumbUrls, activeUrl, sliceCounts, exportEnabled, onSwitchTo }) {
  if (!thumbUrls?.length) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/20 px-3 py-2">
      {thumbUrls.map((url, i) => {
        const active = url === activeUrl;
        const n = sliceCounts[url] || 0;
        const enabled = exportEnabled[url] !== false;
        return (
          <button
            key={url + i}
            type="button"
            onClick={() => onSwitchTo(url)}
            className={`group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-background transition ${
              active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
            } ${enabled ? '' : 'opacity-50 grayscale'}`}
            title={`图 ${i + 1}${n ? ` · ${n} 个切片` : ''}${enabled ? '' : '（已禁用导出）'}`}
          >
            <img src={url} alt={`图${i + 1}`} draggable={false}
              className="pointer-events-none max-h-full max-w-full object-contain" />
            {/* 左上角：切片数 badge（有切片时高亮；禁用导出时变灰） */}
            <span className={`absolute left-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-br-md px-1 text-[9px] font-semibold leading-none ${
              !enabled
                ? 'bg-muted-foreground/40 text-background'
                : n > 0 ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-muted-foreground'
            }`}>
              {n || ''}
            </span>
            {/* 右下角：序号 */}
            <span className="absolute bottom-0 right-0 bg-background/80 px-1 text-[9px] leading-tight text-muted-foreground">
              {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
