import { Fragment, useState } from 'react';
import { ViewportPortal } from '@xyflow/react';
import { WorkflowGroupOverlay } from '@agent-spaces/ui';
import GroupExecutionToolbar from './GroupExecutionToolbar';

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
 * @param {Function} props.onDelete     (groupId) => void
 * @param {Function} props.onUpdate     (groupId, updates) => void
 * @param {Function} props.onMove       (groupId, delta) => void
 * @param {Function} props.onConnect    (groupId, targetNodeId) => void
 * @param {Function} props.screenDeltaToFlowDelta (delta) => flowDelta
 */
export default function GroupOverlays({
  items, selectedGroupId, dropTargetGroupId,
  onSelect, onDelete, onUpdate, onMove, onAutoLayout, onConnect, screenDeltaToFlowDelta,
  inputSlotCounts, onSetExecutionMode, onSetExecutionCount,
  runningGroupIds,
  onSwitchExecutionRun, onUploadExecutionAssets, onRemoveExecutionAsset,
}) {
  const [dragPreview, setDragPreview] = useState(null);

  return (
    <ViewportPortal>
      {items.map(({ group, childNodes }) => (
        <Fragment key={group.id}>
          <WorkflowGroupOverlay
            group={group}
            childNodes={childNodes}
            isSelected={selectedGroupId === group.id}
            isDropTarget={dropTargetGroupId === group.id}
            onSelect={onSelect}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onMove={onMove}
            onAutoLayout={onAutoLayout}
            onDragPreviewChange={setDragPreview}
            onConnect={onConnect}
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
    </ViewportPortal>
  );
}

function hasConfiguredExecution(group) {
  const execution = group.batchExecution;
  const hasMultipleRuns = Number(execution?.count?.target) > 1;
  const hasUploadedAssets = Array.isArray(execution?.assets?.runs) && execution.assets.runs.length > 0;
  return hasMultipleRuns || hasUploadedAssets;
}
