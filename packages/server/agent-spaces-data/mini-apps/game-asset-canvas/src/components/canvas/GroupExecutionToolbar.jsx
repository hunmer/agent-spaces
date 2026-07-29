import { useEffect, useMemo, useState } from 'react';
import { FileUpload, Loader2, X } from '@agent-spaces/ui';
import {
  GROUP_EXECUTION_MODES,
  MAX_GROUP_EXECUTION_COUNT,
  clampExecutionCount,
} from '../../utils/group-execution';

const EMPTY_UPLOAD_FILES = [];

export default function GroupExecutionToolbar({
  group,
  childNodes,
  inputSlotCount,
  busy,
  onSetMode,
  onSetCount,
  onSwitchRun,
  onUploadFiles,
  onRemoveAsset,
}) {
  const execution = group.batchExecution;
  const mode = execution?.mode === GROUP_EXECUTION_MODES.assets
    ? GROUP_EXECUTION_MODES.assets
    : GROUP_EXECUTION_MODES.count;
  const target = clampExecutionCount(execution?.count?.target || 1);
  const countRuns = execution?.count?.runs?.length
    ? execution.count.runs
    : Array.from({ length: target }, (_, index) => ({ id: `count-${index + 1}`, index: index + 1 }));
  const assetRuns = execution?.assets?.runs || [];
  const activeCountId = execution?.count?.activeId || countRuns[0]?.id;
  const activeAssetId = execution?.assets?.activeId || assetRuns[0]?.id;
  const bounds = useMemo(() => getGroupBounds(group, childNodes), [childNodes, group]);
  const [countDraft, setCountDraft] = useState(String(target));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredAssetId, setHoveredAssetId] = useState(null);

  useEffect(() => setCountDraft(String(target)), [target]);

  const commitCount = () => {
    const next = clampExecutionCount(countDraft);
    setCountDraft(String(next));
    if (next !== target) onSetCount(group.id, next);
  };

  const handleUpload = async (items) => {
    const files = items.map((item) => item?.file).filter(Boolean);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const result = await onUploadFiles(group.id, files);
      if (result?.failed?.length) setError(`上传失败：${result.failed.join('、')}`);
    } catch (uploadError) {
      setError(uploadError?.message || String(uploadError));
    } finally {
      for (const item of items) {
        if (item?.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      }
      setUploading(false);
    }
  };

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute z-20 flex min-w-[420px] flex-col gap-1.5 rounded-md border border-border bg-background/95 p-1.5 text-foreground shadow-md backdrop-blur-sm"
      style={{ left: bounds.x, top: bounds.y - 8, width: Math.max(bounds.width, 420), transform: 'translateY(-100%)' }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <style>{`
        .group-asset-file-upload { width: 64px; flex: 0 0 64px; }
        .group-asset-file-upload > div:first-child {
          width: 64px; height: 64px; min-height: 64px; padding: 4px; gap: 2px; border-radius: 6px;
        }
        .group-asset-file-upload > div:first-child > svg { width: 16px; height: 16px; }
        .group-asset-file-upload > div:first-child > div > p:first-child { font-size: 10px; line-height: 12px; }
        .group-asset-file-upload > div:first-child > div > p:not(:first-child) { display: none; }
      `}</style>
      <div className="flex min-h-7 items-center gap-1.5">
        <div className="flex shrink-0 rounded border border-border bg-muted/40 p-0.5">
          <ModeButton
            active={mode === GROUP_EXECUTION_MODES.count}
            disabled={busy}
            onClick={() => onSetMode(group.id, GROUP_EXECUTION_MODES.count)}
          >按次数执行</ModeButton>
          <ModeButton
            active={mode === GROUP_EXECUTION_MODES.assets}
            disabled={busy}
            onClick={() => onSetMode(group.id, GROUP_EXECUTION_MODES.assets)}
          >按上传素材执行</ModeButton>
        </div>

        {mode === GROUP_EXECUTION_MODES.count ? (
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="shrink-0">执行次数</span>
            <input
              type="number"
              min="1"
              max={MAX_GROUP_EXECUTION_COUNT}
              value={countDraft}
              disabled={busy}
              onChange={(event) => setCountDraft(event.target.value)}
              onBlur={commitCount}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              className="h-6 w-14 rounded border border-border bg-background px-1.5 text-center text-[11px] tabular-nums text-foreground outline-none focus:border-primary"
            />
          </label>
        ) : (
          <>
            <span className="truncate text-[10px] text-muted-foreground">
              {inputSlotCount > 0 ? `自动替换 ${inputSlotCount} 个输入槽位` : '无可替换输入槽位'}
            </span>
            {uploading && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />上传中
              </span>
            )}
          </>
        )}
      </div>

      {mode === GROUP_EXECUTION_MODES.count ? (
        <div className="flex min-h-7 flex-wrap items-center gap-1">
          {countRuns.map((run) => (
            <button
              key={run.id}
              type="button"
              disabled={busy}
              onClick={() => onSwitchRun(group.id, GROUP_EXECUTION_MODES.count, run.id)}
              className={`flex h-7 w-7 items-center justify-center rounded border text-[11px] tabular-nums transition ${
                activeCountId === run.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50'
              }`}
              title={`切换到第 ${run.index} 次`}
            >{run.index}</button>
          ))}
        </div>
      ) : (
        <div
          className="flex items-start gap-2 overflow-x-auto pb-0.5"
          style={{ minHeight: 80, paddingTop: 10, paddingRight: 10 }}
        >
          <FileUpload
            value={EMPTY_UPLOAD_FILES}
            onChange={handleUpload}
            accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
            maxFiles={0}
            disabled={busy || uploading || inputSlotCount === 0}
            placeholder="上传素材"
            className="group-asset-file-upload"
          />
            {assetRuns.length === 0 ? (
              <span className="px-1 text-[10px] text-muted-foreground">上传图片后，每张图片会成为一个独立分组实例</span>
            ) : assetRuns.map((run, index) => (
              <div
                key={run.id}
                className="h-16 w-16 shrink-0"
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  setHoveredAssetId(run.id);
                  console.debug('[GroupExecutionDebug] asset thumbnail hover', { groupId: group.id, runId: run.id });
                }}
                onMouseLeave={() => setHoveredAssetId((current) => (current === run.id ? null : current))}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSwitchRun(group.id, GROUP_EXECUTION_MODES.assets, run.id)}
                  className={`h-16 w-16 overflow-hidden rounded border-2 bg-muted/40 transition ${
                    activeAssetId === run.id ? 'border-primary' : 'border-transparent hover:border-primary/60'
                  }`}
                  title={`${index + 1}. ${run.name || '上传素材'}`}
                >
                  <img src={run.url} alt={run.name || `素材 ${index + 1}`} draggable={false} className="h-full w-full object-cover" />
                </button>
                {hoveredAssetId === run.id && (
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemoveAsset(group.id, run.id);
                    }}
                    title="移除素材实例"
                    className="flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ position: 'absolute', top: -10, right: -10, zIndex: 20, width: 20, height: 20 }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {error && <p className="truncate text-[10px] text-destructive" title={error}>{error}</p>}
      {busy && <p className="truncate text-[10px] text-muted-foreground">分组执行中，完成后可切换实例</p>}
    </div>
  );
}

function ModeButton({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-6 rounded px-2 text-[10px] font-medium transition ${
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >{children}</button>
  );
}

function getGroupBounds(group, childNodes) {
  if (!childNodes.length) {
    return { x: group.x ?? 50, y: group.y ?? 50, width: group.width ?? 300 };
  }
  const padding = 30;
  const headerHeight = 28;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const node of childNodes) {
    minX = Math.min(minX, node.position.x - padding);
    minY = Math.min(minY, node.position.y - headerHeight - padding);
    maxX = Math.max(maxX, node.position.x + (node.width || 200) + padding);
  }
  return { x: minX, y: minY, width: Math.max(200, maxX - minX) };
}
