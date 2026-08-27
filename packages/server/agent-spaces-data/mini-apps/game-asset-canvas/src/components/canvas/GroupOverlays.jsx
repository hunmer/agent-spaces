import { Fragment, useState } from 'react';
import { ViewportPortal } from '@xyflow/react';
import { Play, WorkflowGroupOverlay } from '@agent-spaces/ui';
import GroupExecutionToolbar from './GroupExecutionToolbar';
import GroupOutputBindingDialog from './GroupOutputBindingDialog';

/**
 * 分组 overlay 列表：在 ReactFlow 的 ViewportPortal 内渲染所有分组的 WorkflowGroupOverlay。
 * 从 Canvas.jsx 抽出。复用宿主 WorkflowGroupOverlay（与 workflow 编辑器同源），
 * 放在 ViewportPortal 内跟随画布 pan/zoom，按子节点包围盒自动贴合。
 *
 * 必须作为 ReactFlow 的 children 渲染（ViewportPortal 依赖 ReactFlow 上下文）。
 *
 * @param {object} props
 * @param {Array} props.items  groupOverlayItems：[{group, childNodes:[{id,position,width,height}]}]
 * @param {string|null} props.selectedGroupId  当前选中的分组 id
 * @param {string|null} props.dropTargetGroupId 当前拖入命中的分组 id
 * @param {Function} props.onSelect     (groupId) => void
 * @param {Function} props.onSelectNodes (groupId) => void
 * @param {Function} props.onDelete     (groupId) => void
 * @param {Function} props.onUpdate     (groupId, updates) => void
 * @param {Function} props.onMove       (groupId, delta) => void
 * @param {Function} props.onConnect    (groupId, targetNodeId) => void
 * @param {Function} props.screenDeltaToFlowDelta (delta) => flowDelta
 */
export default function GroupOverlays({
  items, groups, nodes, selectedGroupId, dropTargetGroupId,
  onSelect, onSelectNodes, onDelete, onUpdate, onMove, onAutoLayout, onConnect, screenDeltaToFlowDelta,
  inputSlotCounts, onSetExecutionMode, onSetExecutionCount,
  runningGroupIds,
  onRunGroup,
  onRunAllExecution, onStopAllExecution, runAllStates,
  onSwitchExecutionRun, onUploadExecutionAssets, onRemoveExecutionAsset,
  onSetOutputBinding, onDisconnectOutputBinding,
}) {
  const [dragPreview, setDragPreview] = useState(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(() => new Set());
  const [bindingDialog, setBindingDialog] = useState(null);

  const handleCollapsedChange = (groupId, collapsed) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (collapsed) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  };

  return (
    <ViewportPortal>
      <GroupBindingEdges items={items} />
      {items.map(({ group, childNodes }) => (
        <Fragment key={group.id}>
          <WorkflowGroupOverlay
            group={group}
            childNodes={childNodes}
            collapsed={collapsedGroupIds.has(group.id)}
            isSelected={selectedGroupId === group.id}
            isDropTarget={dropTargetGroupId === group.id}
            onCollapsedChange={handleCollapsedChange}
            onSelect={onSelect}
            onSelectNodes={onSelectNodes}
            headerRight={onRunGroup ? (
              <button
                type="button"
                title="运行分组内可执行节点"
                disabled={runningGroupIds.has(group.id) || runAllStates?.[group.id]?.running}
                className="flex h-5 items-center gap-1 rounded border border-border/70 bg-background/80 px-1.5 text-[10px] font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onRunGroup(group.id)}
              >
                <Play className="size-2.5" />
                批量运行
              </button>
            ) : null}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onMove={onMove}
            onAutoLayout={onAutoLayout}
            onDragPreviewChange={setDragPreview}
            onConnect={onConnect}
            onConnectGroup={(sourceGroupId, targetGroupId) => {
              console.debug('[GroupOutputBindingDebug] shared group handle connected', {
                sourceGroupId, targetGroupId,
              });
              setBindingDialog({ sourceGroupId, targetGroupId });
            }}
            screenDeltaToFlowDelta={screenDeltaToFlowDelta}
          />
          {(selectedGroupId === group.id || hasConfiguredExecution(group)) && (
            <GroupExecutionToolbar
              group={group}
              childNodes={childNodes}
              inputSlotCount={inputSlotCounts.get(group.id) || 0}
              busy={runningGroupIds.has(group.id)}
              onSetMode={onSetExecutionMode}
              onSetCount={onSetExecutionCount}
              onSwitchRun={onSwitchExecutionRun}
              onUploadFiles={onUploadExecutionAssets}
              onRemoveAsset={onRemoveExecutionAsset}
              onRunAll={onRunAllExecution}
              onStopAll={onStopAllExecution}
              runAllState={runAllStates?.[group.id]}
              onConnectGroup={(sourceGroupId, targetGroupId) => {
                setBindingDialog({ sourceGroupId, targetGroupId });
              }}
              onDisconnectGroup={onDisconnectOutputBinding}
              sourceGroupName={groups.find((item) => (
                item.id === group.batchExecution?.assets?.binding?.sourceGroupId
              ))?.name}
            />
          )}
        </Fragment>
      ))}
      {dragPreview && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: dragPreview.bounds.x + dragPreview.delta.x,
            top: dragPreview.bounds.y + dragPreview.delta.y,
            width: dragPreview.bounds.width,
            height: dragPreview.bounds.height,
            border: '2px dashed var(--primary)',
            borderRadius: 8,
            backgroundColor: 'rgba(59,130,246,0.06)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
          }}
        />
      )}
      <GroupOutputBindingDialog
        state={bindingDialog}
        groups={groups}
        nodes={nodes}
        onClose={() => setBindingDialog(null)}
        onSave={onSetOutputBinding}
        onDisconnect={onDisconnectOutputBinding}
      />
    </ViewportPortal>
  );
}

function GroupBindingEdges({ items }) {
  const byId = new Map(items.map((item) => [item.group.id, item]));
  const connections = items.flatMap((targetItem) => {
    const sourceGroupId = targetItem.group.batchExecution?.assets?.binding?.sourceGroupId;
    const sourceItem = byId.get(sourceGroupId);
    if (!sourceItem) return [];
    return [{ sourceItem, targetItem }];
  });
  if (!connections.length) return null;

  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: 0, top: 0, width: 1, height: 1, zIndex: 1 }}
      aria-hidden="true"
    >
      {connections.map(({ sourceItem, targetItem }, index) => {
        const source = getOverlayBounds(sourceItem.group, sourceItem.childNodes);
        const target = getOverlayBounds(targetItem.group, targetItem.childNodes);
        const sourceCenterX = source.x + source.width / 2;
        const targetCenterX = target.x + target.width / 2;
        const forward = targetCenterX >= sourceCenterX;
        const x1 = forward ? source.x + source.width : source.x;
        const x2 = forward ? target.x : target.x + target.width;
        const y1 = source.y + source.height / 2;
        const y2 = target.y + target.height / 2;
        const controlOffset = Math.max(48, Math.abs(x2 - x1) / 2);
        const c1 = x1 + (forward ? controlOffset : -controlOffset);
        const c2 = x2 - (forward ? controlOffset : -controlOffset);
        const markerId = `group-binding-arrow-${index}`;
        return (
          <g key={targetItem.group.id}>
            <defs>
              <marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--primary)" />
              </marker>
            </defs>
            <path
              d={`M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeDasharray="6 4"
              markerEnd={`url(#${markerId})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

function getOverlayBounds(group, childNodes) {
  if (!childNodes.length) {
    return {
      x: group.x ?? 50,
      y: group.y ?? 50,
      width: group.width ?? 300,
      height: group.height ?? 200,
    };
  }
  const padding = 30;
  const headerHeight = 28;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of childNodes) {
    minX = Math.min(minX, node.position.x - padding);
    minY = Math.min(minY, node.position.y - headerHeight - padding);
    maxX = Math.max(maxX, node.position.x + (node.width || 200) + padding);
    maxY = Math.max(maxY, node.position.y + (node.height || 100) + padding);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(200, maxX - minX),
    height: Math.max(100, maxY - minY),
  };
}

function hasConfiguredExecution(group) {
  const execution = group.batchExecution;
  const hasMultipleRuns = Number(execution?.count?.target) > 1;
  const hasUploadedAssets = Array.isArray(execution?.assets?.runs) && execution.assets.runs.length > 0;
  const hasOutputBinding = !!execution?.assets?.binding?.sourceGroupId;
  return hasMultipleRuns || hasUploadedAssets || hasOutputBinding;
}
