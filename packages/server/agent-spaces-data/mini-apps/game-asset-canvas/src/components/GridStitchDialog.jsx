import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, ColorPicker, Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Label, Loader, NumberInput,
} from '@agent-spaces/ui';
import { GripVertical, LayoutGrid } from '@agent-spaces/ui';
import CutoutSettings, { SettingField } from './ui-splitter/CutoutSettings';
import { applySpriteSheetCutout } from '../utils/image-ops/spriteSheet';
import { imageDataToDataUrl, urlToImageData } from '../utils/image-ops/io';
import { sampleColor, toHex } from '../utils/image-ops/sprite-splitter';
import { BG_PRESETS } from '../utils/ui-splitter-helpers';
import {
  mapObjectContainPoint, moveGridStitchItem, normalizeGridStitchData,
} from '../utils/grid-stitch';

export default function GridStitchDialog({
  open, inputImages, initialData, processorParams, onDataChange, onConfirm, onClose,
}) {
  const normalized = useMemo(
    () => normalizeGridStitchData(initialData, inputImages, processorParams),
    [initialData, inputImages, processorParams],
  );
  const [draft, setDraft] = useState(normalized);
  const [previewUrls, setPreviewUrls] = useState({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [dragIndex, setDragIndex] = useState(-1);
  const [picking, setPicking] = useState(false);
  const sourceImagesRef = useRef({});

  useEffect(() => {
    if (open) setDraft(normalized);
  }, [open, normalized]);

  const updateDraft = useCallback((patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDataChange?.(next);
  }, [draft, onDataChange]);

  useEffect(() => {
    if (!open || !draft.order.length) {
      setPreviewUrls({});
      return undefined;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError('');
    Promise.all(draft.order.map(async (url) => {
      const imageData = await urlToImageData(url);
      const output = applySpriteSheetCutout(imageData, draft);
      return { url, imageData, previewUrl: imageDataToDataUrl(output) };
    })).then((items) => {
      if (!cancelled) {
        sourceImagesRef.current = Object.fromEntries(items.map((item) => [item.url, item.imageData]));
        setPreviewUrls(Object.fromEntries(items.map((item) => [item.url, item.previewUrl])));
      }
    }).catch((error) => {
      if (!cancelled) setPreviewError(error?.message || String(error));
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, draft.order, draft.cutoutMethod, draft.tolerance, draft.cutoutColor]);

  const rows = Math.max(1, Math.ceil(draft.order.length / draft.columns));
  const handleDrop = useCallback((targetIndex) => {
    if (dragIndex < 0) return;
    updateDraft({ order: moveGridStitchItem(draft.order, dragIndex, targetIndex) });
    setDragIndex(-1);
  }, [draft.order, dragIndex, updateDraft]);

  const handleTogglePicking = useCallback(() => {
    setPicking((current) => !current);
  }, []);

  const handleSampleColor = useCallback((event, url) => {
    if (!picking) return;
    const imageData = sourceImagesRef.current[url];
    const element = event.currentTarget;
    if (!imageData || !element) return;
    const rect = element.getBoundingClientRect();
    const point = mapObjectContainPoint(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
      { width: imageData.width, height: imageData.height },
    );
    if (!point) return;
    updateDraft({ cutoutMethod: 'picked', cutoutColor: toHex(sampleColor(imageData, point.x, point.y)) });
    setPicking(false);
  }, [picking, updateDraft]);

  const handleConfirm = useCallback(() => {
    onConfirm?.(draft);
    onClose?.();
  }, [draft, onConfirm, onClose]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }}>
      <style>{`
        .game-asset-grid-stitch-dialog {
          width: 80vw !important;
          max-width: 80vw !important;
          height: 80vh !important;
          max-height: 80vh !important;
        }
      `}</style>
      <DialogContent className="game-asset-grid-stitch-dialog nodrag nopan nowheel flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <LayoutGrid className="h-4 w-4" />网格拼接编辑器
          </DialogTitle>
          <DialogDescription className="text-xs">
            {draft.order.length} 张图片 · {draft.columns} 列 × {rows} 行
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col bg-muted/20 p-4">
            <div className="mb-2 flex h-5 items-center justify-between text-[11px] text-muted-foreground">
              <span>{picking ? '点击图片吸取背景色' : '拖拽图片调整拼接顺序'}</span>
              {previewLoading && <span className="flex items-center gap-1"><Loader className="h-3 w-3" />更新预览</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background p-4">
              <div
                className="grid h-full w-full"
                style={{
                  gridTemplateColumns: `repeat(${draft.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  gap: `${draft.spacing}px`,
                  backgroundColor: draft.backgroundColor,
                }}
              >
                {draft.order.map((url, index) => (
                  <div
                    key={url}
                    draggable={!picking}
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => setDragIndex(-1)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(index)}
                    className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden border border-border bg-transparent"
                    style={{ cursor: picking ? 'crosshair' : 'grab', opacity: dragIndex === index ? 0.5 : 1 }}
                    title={`第 ${index + 1} 格`}
                  >
                    <img src={previewUrls[url] || url} alt="" className="h-full w-full object-contain" draggable={false}
                      onClick={(event) => handleSampleColor(event, url)} />
                    <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded bg-background/90 px-1 text-[10px] font-medium text-foreground shadow">
                      {index + 1}
                    </span>
                    <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-background/90 text-muted-foreground shadow">
                      <GripVertical className="h-4 w-4" />
                    </span>
                  </div>
                ))}
              </div>
              {previewError && <p className="mt-3 text-xs text-destructive">预览失败：{previewError}</p>}
            </div>
          </section>

          <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-background p-4">
            <div className="flex flex-col gap-4">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground">网格设置</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SettingField label="列数">
                    <NumberInput min={1} max={32} value={draft.columns}
                      onChange={(value) => updateDraft({ columns: Math.max(1, value ?? 1) })} className="h-8" />
                  </SettingField>
                  <SettingField label="间隔(px)">
                    <NumberInput min={0} max={64} value={draft.spacing}
                      onChange={(value) => updateDraft({ spacing: Math.max(0, value ?? 0) })} className="h-8" />
                  </SettingField>
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-foreground">抠图</h3>
                <div className="flex flex-col items-stretch gap-3">
                  <CutoutSettings
                    method={draft.cutoutMethod}
                    tolerance={draft.tolerance}
                    pickedHex={draft.cutoutColor}
                    onMethodChange={(value) => updateDraft({ cutoutMethod: value })}
                    onToleranceChange={(value) => updateDraft({ tolerance: value })}
                    onColorChange={(value) => updateDraft({ cutoutColor: value })}
                    onPickColor={handleTogglePicking}
                    picking={picking}
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-foreground">画布背景</h3>
                <Label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>统一背景颜色</span>
                  <div className="flex h-8 items-center rounded-md border border-border bg-background px-2">
                    <ColorPicker colors={BG_PRESETS} value={draft.backgroundColor}
                      onChange={(value) => updateDraft({ backgroundColor: value })} />
                  </div>
                </Label>
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleConfirm} disabled={draft.order.length < 2}>
            输出到节点
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
