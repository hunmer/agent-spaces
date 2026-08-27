import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUpload, Loader2, Play, Slider, Spline, Square, Unlink, X } from '@agent-spaces/ui';
import {
  GROUP_EXECUTION_MODES,
  MAX_GROUP_EXECUTION_COUNT,
  clampExecutionCount,
} from '../../utils/group-execution';
import GroupRunSelectionDialog from './GroupRunSelectionDialog';

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
  onRunAll,
  onStopAll,
  runAllState,
  onConnectGroup,
  onDisconnectGroup,
  sourceGroupName,
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
  const outputBinding = execution?.assets?.binding || null;
  const activeCountId = execution?.count?.activeId || countRuns[0]?.id;
  const activeAssetId = execution?.assets?.activeId || assetRuns[0]?.id;
  const currentRuns = mode === GROUP_EXECUTION_MODES.assets ? assetRuns : countRuns;
  const runAllRunning = runAllState?.running === true;
  const toolbarBusy = busy || runAllRunning;
  const bounds = useMemo(() => getGroupBounds(group, childNodes), [childNodes, group]);
  const [countDraft, setCountDraft] = useState(String(target));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [runSelectionOpen, setRunSelectionOpen] = useState(false);

  useEffect(() => setCountDraft(String(target)), [target]);

  const commitCount = () => {
    const next = clampExecutionCount(countDraft);
    setCountDraft(String(next));
    if (next !== target) onSetCount(group.id, next);
  };

  const commitSliderCount = (value) => {
    const next = clampExecutionCount(value);
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
            disabled={toolbarBusy}
            onClick={() => onSetMode(group.id, GROUP_EXECUTION_MODES.count)}
          >按次数执行</ModeButton>
          <ModeButton
            active={mode === GROUP_EXECUTION_MODES.assets}
            disabled={toolbarBusy}
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
              disabled={toolbarBusy}
              onChange={(event) => setCountDraft(event.target.value)}
              onBlur={commitCount}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              className="h-6 w-14 rounded border border-border bg-background px-1.5 text-center text-[11px] tabular-nums text-foreground outline-none focus:border-primary"
            />
          </label>
        ) : (
          <>
            <span className="truncate text-[10px] text-muted-foreground">
              {outputBinding
                ? `已连接 ${sourceGroupName || '来源分组'} · ${assetRuns.length} 个当前输出`
                : (inputSlotCount > 0 ? `自动替换 ${inputSlotCount} 个输入槽位` : '无可替换输入槽位')}
            </span>
            {uploading && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />上传中
              </span>
            )}
          </>
        )}
        {mode === GROUP_EXECUTION_MODES.count && (
          <label
            className="ml-auto flex w-28 shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground"
            title={`一次批量处理 ${clampExecutionCount(countDraft)} 次`}
          >
            <span className="shrink-0 tabular-nums">批量 {clampExecutionCount(countDraft)}</span>
            <Slider
              min={1}
              max={MAX_GROUP_EXECUTION_COUNT}
              step={1}
              value={clampExecutionCount(countDraft)}
              disabled={toolbarBusy}
              onValueChange={(value) => setCountDraft(String(clampExecutionCount(value)))}
              onValueCommitted={commitSliderCount}
            />
          </label>
        )}
        <button
          type="button"
          disabled={!toolbarBusy && currentRuns.length === 0}
          onClick={() => {
            if (toolbarBusy) onStopAll?.(group.id);
            else setRunSelectionOpen(true);
          }}
          title={toolbarBusy ? '停止当前分组的全部执行' : '选择并运行项目实例'}
          className={`ml-auto flex h-6 shrink-0 items-center gap-1 rounded border bg-background px-2 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            toolbarBusy
              ? 'border-destructive text-destructive hover:bg-destructive/10'
              : 'border-border text-foreground hover:border-primary hover:text-primary'
          }`}
        >
          {toolbarBusy ? <Square className="h-3 w-3" fill="currentColor" /> : <Play className="h-3 w-3" />}
          {toolbarBusy ? '停止所有' : '运行所有'}
        </button>
        <div className="shrink-0">
          <GroupConnectButton
            groupId={group.id}
            disabled={toolbarBusy || group.locked}
            onConnect={onConnectGroup}
          />
        </div>
        {outputBinding && (
          <button
            type="button"
            title="解除与来源分组的连接"
            disabled={toolbarBusy || group.locked}
            onClick={() => onDisconnectGroup?.(group.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
          >
            <Unlink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {mode === GROUP_EXECUTION_MODES.count ? (
        <div className="flex min-h-7 flex-wrap items-center gap-1">
          {countRuns.map((run) => (
            <button
              key={run.id}
              type="button"
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
          style={{ minHeight: 96, paddingTop: 10, paddingRight: 10 }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <FileUpload
            value={EMPTY_UPLOAD_FILES}
            onChange={handleUpload}
            accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
            maxFiles={0}
            disabled={toolbarBusy || uploading || inputSlotCount === 0 || !!outputBinding}
            placeholder={outputBinding ? '自动绑定' : '上传素材'}
            className="group-asset-file-upload"
          />
            {assetRuns.length === 0 ? (
              <span className="px-1 text-[10px] text-muted-foreground">上传图片后，每张图片会成为一个独立分组实例</span>
            ) : assetRuns.map((run, index) => (
              <div
                key={run.id}
                className="h-20 w-16 shrink-0"
                style={{ position: 'relative' }}
              >
                <button
                  type="button"
                  onClick={() => onSwitchRun(group.id, GROUP_EXECUTION_MODES.assets, run.id)}
                  className={`h-16 w-16 overflow-hidden rounded border-2 bg-muted/40 transition ${
                    activeAssetId === run.id ? 'border-primary' : 'border-transparent hover:border-primary/60'
                  }`}
                  title={`${index + 1}. ${run.name || '上传素材'}`}
                >
                  <img src={run.url} alt={run.name || `素材 ${index + 1}`} draggable={false} className="h-full w-full object-cover" />
                </button>
                {!outputBinding && (
                  <button
                    type="button"
                    disabled={toolbarBusy}
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
                <RunStatusLabel
                  status={runAllState?.statusByRun?.[run.id]
                    || (busy && activeAssetId === run.id ? 'running' : null)}
                />
              </div>
            ))}
        </div>
      )}

      {error && <p className="truncate text-[10px] text-destructive" title={error}>{error}</p>}
      <GroupRunSelectionDialog
        open={runSelectionOpen}
        mode={mode}
        runs={currentRuns}
        onClose={() => setRunSelectionOpen(false)}
        onConfirm={(runIds) => onRunAll?.(group.id, runIds)}
      />
    </div>
  );
}

function RunStatusLabel({ status }) {
  if (!status) return null;
  const labels = { queued: '等待', running: '运行中', done: '完成', error: '失败', stopped: '已停止' };
  return (
    <div className={`flex h-4 items-center justify-center gap-0.5 text-[9px] ${
      status === 'error' ? 'text-destructive'
        : status === 'done' ? 'text-emerald-600'
          : 'text-primary'
    }`}>
      {(status === 'queued' || status === 'running') && (
        <Loader2 className={`h-2.5 w-2.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      )}
      <span>{labels[status] || status}</span>
    </div>
  );
}

function GroupConnectButton({ groupId, disabled, onConnect }) {
  const cleanupRef = useRef(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = (event) => {
    if (!onConnect || disabled) return;
    cleanupRef.current?.();
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const preview = createGroupConnectPreview(start);
    console.debug('[GroupOutputBindingDebug] drag start', { sourceGroupId: groupId });
    element.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId === pointerId) preview.update(moveEvent.clientX, moveEvent.clientY);
    };
    const cleanup = () => {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      preview.remove();
      cleanupRef.current = null;
    };
    const handlePointerUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      const targetGroupId = getGroupAtScreenPoint(upEvent.clientX, upEvent.clientY);
      cleanup();
      console.debug('[GroupOutputBindingDebug] drag end', { sourceGroupId: groupId, targetGroupId });
      if (targetGroupId && targetGroupId !== groupId) onConnect(groupId, targetGroupId);
    };
    const handlePointerCancel = (cancelEvent) => {
      if (cancelEvent.pointerId === pointerId) cleanup();
    };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    cleanupRef.current = cleanup;
  };

  return (
    <button
      type="button"
      title="拖出本组输出；也可接收其他分组拖入"
      data-group-connect-id={groupId}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      className="flex h-6 w-6 shrink-0 cursor-crosshair items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-primary disabled:pointer-events-none disabled:opacity-40"
    >
      <Spline className="h-3.5 w-3.5" />
    </button>
  );
}

function createGroupConnectPreview(start) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  const line = document.createElementNS(namespace, 'line');
  const endpoint = document.createElementNS(namespace, 'circle');
  Object.assign(svg.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '9999', pointerEvents: 'none',
  });
  line.setAttribute('x1', String(start.x));
  line.setAttribute('y1', String(start.y));
  line.setAttribute('x2', String(start.x));
  line.setAttribute('y2', String(start.y));
  line.setAttribute('stroke', 'var(--primary, currentColor)');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '5,5');
  endpoint.setAttribute('cx', String(start.x));
  endpoint.setAttribute('cy', String(start.y));
  endpoint.setAttribute('r', '4');
  endpoint.setAttribute('fill', 'var(--primary, currentColor)');
  svg.append(line, endpoint);
  document.body.appendChild(svg);
  return {
    update(x, y) {
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
      endpoint.setAttribute('cx', String(x));
      endpoint.setAttribute('cy', String(y));
    },
    remove() { svg.remove(); },
  };
}

function getGroupAtScreenPoint(x, y) {
  const handleTarget = Array.from(document.querySelectorAll('[data-group-connect-id]'))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .find(({ rect }) => (
      x >= rect.left - 6 && x <= rect.right + 6 && y >= rect.top - 6 && y <= rect.bottom + 6
    ));
  if (handleTarget) return handleTarget.element.getAttribute('data-group-connect-id');

  return Array.from(document.querySelectorAll('[data-workflow-group-id]'))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0]
    ?.element.getAttribute('data-workflow-group-id') || null;
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
