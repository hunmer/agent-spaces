import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Input, ScrollArea,
} from '@agent-spaces/ui';

/** 将激活分组中的图片批量写入素材库分类。 */
export default function GroupAssetLibraryDialog({
  open, group, assets = [], onClose, onSubmit,
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(group?.name || '');
    setSelected(new Set(assets.map((_, index) => index)));
  }, [assets, group?.id, group?.name, open]);

  const toggleAsset = (index) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  });

  const handleSubmit = async () => {
    const categoryName = name.trim() || group?.name || '未命名分组';
    const selectedAssets = assets.filter((_, index) => selected.has(index));
    if (!selectedAssets.length) return;
    setSubmitting(true);
    try {
      await onSubmit?.(categoryName, selectedAssets);
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent
        className="flex min-w-0 flex-col gap-0 overflow-hidden p-0"
        style={{ width: 'min(720px, 92vw)', maxWidth: '92vw', maxHeight: '80vh' }}
      >
        <div className="min-w-0 px-5 pt-5">
        <DialogHeader>
          <DialogTitle>添加到素材库</DialogTitle>
          <DialogDescription>
            将当前分组的图片添加到素材库，共 {assets.length} 个，已选 {selected.size} 个。
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-2 py-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="group-asset-category-name">
            展示分组名称
          </label>
          <Input
            id="group-asset-category-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
          />
          <div className="mt-2 text-xs font-medium text-muted-foreground">
            将会添加的素材（{assets.length}）
          </div>
          <ScrollArea className="min-h-0 max-h-[45vh] w-full rounded border border-border">
            <div
              className="grid min-w-0 gap-2 p-2"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}
            >
              {assets.map((asset, index) => {
                const checked = selected.has(index);
                return (
                  <button
                    key={`${asset.url}-${index}`}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleAsset(index)}
                    disabled={submitting}
                    className={`relative min-w-0 overflow-hidden rounded border-2 bg-muted/30 text-left transition ${
                      checked ? 'border-primary ring-2 ring-primary/20' : 'border-border opacity-60 hover:border-primary/50'
                    }`}
                  >
                    <img
                      src={asset.thumb || asset.url}
                      alt={asset.name || ''}
                      draggable={false}
                      className="pointer-events-none aspect-square h-auto w-full object-cover"
                    />
                    <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-background/85 p-0.5">
                      <Checkbox checked={checked} className="h-4 w-4" />
                    </span>
                    <div className="truncate px-1 py-1 text-[10px] text-muted-foreground" title={asset.name}>
                      {asset.name || '未命名素材'}
                    </div>
                  </button>
                );
              })}
              {!assets.length && (
                <div className="py-6 text-center text-xs text-muted-foreground" style={{ gridColumn: '1 / -1' }}>
                  当前分组没有可添加的图片
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
          <Button onClick={handleSubmit} disabled={!selected.size || submitting}>
            {submitting ? '添加中…' : `提交 (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
