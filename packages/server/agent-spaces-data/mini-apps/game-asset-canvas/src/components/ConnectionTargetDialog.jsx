import { useEffect, useMemo, useState } from 'react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  FileText, Film, Images, ScanLine, Volume2,
} from '@agent-spaces/ui';

const TARGET_ICONS = {
  images: Images,
  mask: ScanLine,
};

const ASSET_ICONS = { image: Images, video: Film, audio: Volume2 };

export default function ConnectionTargetDialog({
  open, targets = [], targetsByInputType, assets = [], inputType = 'image', onSelect, onClose,
}) {
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const assetSignature = assets.map((asset) => `${asset.id}:${asset.type}:${asset.url}`).join('|');
  useEffect(() => {
    setSelectedAssetId(assets.length === 1 ? assets[0].id : '');
    setSelectedTargetId('');
  }, [assetSignature, assets.length, open]);
  const selectedAsset = assets.length === 1
    ? assets[0]
    : assets.find((asset) => asset.id === selectedAssetId);
  const needsAssetSelection = assets.length > 1;
  const activeInputType = selectedAsset?.type || inputType;
  const activeTargets = useMemo(
    () => (needsAssetSelection && !selectedAsset
      ? []
      : (targetsByInputType ? (targetsByInputType[activeInputType] || []) : targets)),
    [activeInputType, needsAssetSelection, selectedAsset, targets, targetsByInputType],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="overflow-hidden p-5" style={{ width: '420px', maxWidth: '92vw' }}>
        <DialogHeader>
          <DialogTitle className="text-sm">{needsAssetSelection ? '选择素材与连接目标' : '选择连接目标'}</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            {needsAssetSelection && !selectedAsset
              ? '先选择该分镜中的一个素材，再选择兼容的目标输入。'
              : activeInputType === 'text'
              ? '选择目标属性；字段包含 {变量} 时，可继续选择只替换该变量。'
              : '选择本次连线要写入的目标位置。'}
          </DialogDescription>
        </DialogHeader>

        {needsAssetSelection ? <div className="nodrag nopan nowheel flex min-w-0 flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-medium text-muted-foreground">分镜素材</span>
          <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {assets.map((asset) => {
              const Icon = ASSET_ICONS[asset.type] || FileText;
              const active = asset.id === selectedAssetId;
              return <button
                key={asset.id}
                type="button"
                className={`flex min-w-0 items-center gap-2 rounded border p-2 text-left ${active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'}`}
                onClick={() => setSelectedAssetId(asset.id)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {asset.type === 'image' ? <img src={asset.thumb || asset.url} alt="" className="h-full w-full object-cover" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{asset.label}</span>
              </button>;
            })}
          </div>
        </div> : null}

        {/* min-w-0 + overflow-hidden：作为 DialogContent(grid) 的直接子项，
            必须打破 grid item 默认 min-width:auto，否则被内容 fit-content 撑到 641px，
            导致内部 truncate 链全部失效（实测 span 宽 641px > dialog 420px）。 */}
        <div className="flex min-w-0 flex-col gap-2 overflow-hidden py-1">
          {(!needsAssetSelection || selectedAsset) ? <span className="text-[11px] font-medium text-muted-foreground">可连接对象</span> : null}
          {activeTargets.map((target) => {
            const Icon = TARGET_ICONS[target.id] || (activeInputType === 'text' ? FileText : (ASSET_ICONS[activeInputType] || Images));
            const variables = activeInputType === 'text' && Array.isArray(target.variables)
              ? target.variables
              : [];
            const expanded = selectedTargetId === target.id && variables.length > 0;
            return (
              <div key={target.id} className="flex min-w-0 flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  // whitespace-normal 覆盖 Button base 的 whitespace-nowrap（否则被内容撑宽）
                  className={`h-auto w-full min-w-0 justify-start gap-3 whitespace-normal px-3 py-3 text-left ${expanded ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => {
                    if (variables.length) {
                      setSelectedTargetId((current) => (current === target.id ? '' : target.id));
                      return;
                    }
                    onSelect?.(target.id, selectedAsset || null, activeInputType, undefined);
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="block truncate text-sm font-medium">{target.label}</span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      {target.description}
                    </span>
                  </div>
                  {variables.length ? <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{variables.length} 个变量</span> : null}
                </Button>
                {expanded ? <div className="ml-7 flex min-w-0 flex-wrap gap-1.5 rounded border border-border bg-muted/30 p-2">
                  <button
                    type="button"
                    className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:border-primary hover:text-primary"
                    onClick={() => onSelect?.(target.id, selectedAsset || null, activeInputType, undefined)}
                  >
                    替换整个字段
                  </button>
                  {variables.map((variable) => <button
                    key={variable}
                    type="button"
                    className="rounded border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary hover:border-primary hover:bg-primary/15"
                    onClick={() => onSelect?.(target.id, selectedAsset || null, activeInputType, variable)}
                  >
                    {`{${variable}}`}
                  </button>)}
                </div>
                : null}
              </div>
            );
          })}
          {needsAssetSelection && !selectedAsset ? <p className="rounded border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">选择素材后显示可连接对象</p> : null}
          {(!needsAssetSelection || selectedAsset) && !activeTargets.length ? <p className="rounded border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">当前素材与目标节点不兼容</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
