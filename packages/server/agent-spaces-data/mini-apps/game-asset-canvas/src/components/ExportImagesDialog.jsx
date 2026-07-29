import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Checkbox, ScrollArea,
} from '@agent-spaces/ui';

/**
 * 导出图片选择对话框：多图时让用户勾选要导出到画布的图片。
 *
 * - 单图场景由调用方直接导出，不走本对话框。
 * - 选中态为图片索引集合；底部提供「全选/取消全选」开关 + 「导出全部」「导出选中」两个动作。
 *   - 导出全部：无论当前勾选，直接导出全部图片（高频快捷路径）。
 *   - 导出选中：仅导出勾选的图片。
 *
 * @param {{
 *   open: boolean,
 *   images: string[],            // 待选择图片 url 列表
 *   onClose: ()=>void,
 *   onExport: (urls: string[]) => void,  // 确认导出（传最终选中的 url 子集）
 * }} props
 */
export default function ExportImagesDialog({ open, images, onClose, onExport }) {
  const [selected, setSelected] = useState(() => new Set());

  // 打开/图片变化时重置为全选（默认全选，最省事）
  useEffect(() => {
    if (open) setSelected(new Set(images.map((_, i) => i)));
  }, [open, images]);

  const allSelected = useMemo(
    () => images.length > 0 && selected.size === images.length,
    [images, selected],
  );

  const toggle = (i) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(images.map((_, i) => i)));

  const close = () => { setSelected(new Set()); onClose?.(); };

  const exportSelected = () => {
    const urls = images.filter((_, i) => selected.has(i));
    if (!urls.length) return;
    onExport?.(urls);
    close();
  };

  const exportAll = () => {
    if (!images.length) return;
    onExport?.(images);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0" style={{ width: '70vw', maxWidth: '70vw', maxHeight: '80vh', height: '80vh' }}>
        <DialogHeader className="border-b border-border px-4 py-3 pr-10">
          <DialogTitle className="text-sm">导出图片到画布</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            共 {images.length} 张，已选 {selected.size} 张
          </DialogDescription>
        </DialogHeader>

        {/* 全选条（独立一行，避开右上角关闭按钮） */}
        <div className="flex items-center justify-end border-b border-border bg-muted/20 px-4 py-1.5">
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={toggleAll}>
            {allSelected ? '取消全选' : '全选'}
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
            {images.map((url, i) => {
              const checked = selected.has(i);
              return (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => toggle(i)}
                  className={`group relative flex min-h-[110px] items-center justify-center overflow-hidden rounded-md border-2 bg-background transition ${
                    checked ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <img src={url} alt={`图${i + 1}`} draggable={false}
                    className="pointer-events-none max-h-[100px] max-w-full object-contain" />
                  {/* 左上角：勾选框 + 序号 */}
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1">
                    <Checkbox checked={checked} className="h-4 w-4 bg-background/80" />
                  </span>
                  <span className="absolute bottom-1 right-1.5 rounded bg-background/80 px-1 text-[9px] text-muted-foreground">
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center gap-2 border-t border-border bg-muted/20 px-4 pt-3 pb-4">
          <span className="mr-auto text-[11px] text-muted-foreground">
            导出后会在来源节点右侧自动排布，互不重叠
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportAll} disabled={!images.length}>
              导出全部 ({images.length})
            </Button>
            <Button size="sm" onClick={exportSelected} disabled={selected.size === 0}>
              导出选中 ({selected.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
