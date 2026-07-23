'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, Lock, Unlock, Trash2 } from 'lucide-react';
import type { WorkflowGroup } from '@agent-spaces/shared';
import { WorkflowAutoLayoutMenu, type WorkflowAutoLayoutOptions } from './workflow-auto-layout-menu';

/**
 * GroupNode — visual container overlay for grouping nodes on the canvas.
 * Rendered as an absolute-positioned div behind child nodes.
 */

interface GroupOverlayProps {
  group: WorkflowGroup;
  childNodes: Array<{ id: string; position: { x: number; y: number }; width?: number; height?: number }>;
  isSelected: boolean;
  isDropTarget: boolean;
  onSelect: (groupId: string) => void;
  onDelete: (groupId: string) => void;
  onUpdate: (groupId: string, updates: Partial<WorkflowGroup>) => void;
  onMove: (groupId: string, delta: { x: number; y: number }, options?: { pushUndo?: boolean }) => void;
  onAutoLayout?: (direction: 'LR' | 'TB', options?: WorkflowAutoLayoutOptions) => void;
  layoutEngine?: string;
  onDragPreviewChange?: (preview: {
    groupId: string;
    bounds: { x: number; y: number; width: number; height: number };
    delta: { x: number; y: number };
  } | null) => void;
  screenDeltaToFlowDelta: (delta: { x: number; y: number }) => { x: number; y: number };
}

const GROUP_COLORS = [
  { name: '蓝色', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.3)', header: 'rgba(59,130,246,0.1)' },
  { name: '绿色', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.3)', header: 'rgba(16,185,129,0.1)' },
  { name: '紫色', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.3)', header: 'rgba(139,92,246,0.1)' },
  { name: '橙色', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.3)', header: 'rgba(249,115,22,0.1)' },
  { name: '粉色', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.3)', header: 'rgba(236,72,153,0.1)' },
];

function getGroupColor(color?: string) {
  if (!color) return GROUP_COLORS[0];
  return GROUP_COLORS.find(c => c.name === color) || GROUP_COLORS[0];
}

export function WorkflowGroupOverlay({
  group, childNodes, isSelected, isDropTarget,
  onSelect, onDelete, onUpdate, onMove, onAutoLayout, layoutEngine, onDragPreviewChange, screenDeltaToFlowDelta,
}: GroupOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const isDraggingRef = useRef(false);
  const colors = getGroupColor(group.color);
  const layoutNodeIds = useMemo(() => childNodes.map(node => node.id), [childNodes]);

  const bounds = useMemo(() => {
    if (childNodes.length === 0) {
      return { x: group.x ?? 50, y: group.y ?? 50, width: group.width ?? 300, height: group.height ?? 200 };
    }
    const padding = 30;
    const headerHeight = 28;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
      height: collapsed ? headerHeight + padding : Math.max(100, maxY - minY),
    };
  }, [childNodes, collapsed, group.x, group.y, group.width, group.height]);

  React.useEffect(() => {
    console.debug('[WorkflowGroupBoundsDebug] render group bounds', {
      groupId: group.id,
      storedBounds: {
        x: group.x,
        y: group.y,
        width: group.width,
        height: group.height,
      },
      renderedBounds: bounds,
      childNodes,
    });
  }, [bounds, childNodes, group.height, group.id, group.width, group.x, group.y]);

  const handleToggleCollapse = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => !prev);
  }, []);

  const handleToggleLock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(group.id, { locked: !group.locked });
  }, [group.id, group.locked, onUpdate]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(group.name);
    setIsEditing(true);
  }, [group.name]);

  const finishEdit = useCallback(() => {
    setIsEditing(false);
    if (editName !== group.name) {
      onUpdate(group.id, { name: editName });
    }
  }, [editName, group.name, group.id, onUpdate]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(group.id);
  }, [group.id, onDelete]);

  const stopButtonPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const handleHeaderPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (group.locked || isEditing) return;
    const target = event.target as Element;
    if (target.closest('button,input')) return;

    event.preventDefault();
    event.stopPropagation();
    onSelect(group.id);

    let last = { x: event.clientX, y: event.clientY };
    let frameId: number | null = null;
    let totalFlowDelta = { x: 0, y: 0 };
    let pendingPreviewDelta = { x: 0, y: 0 };
    const pointerId = event.pointerId;
    const element = event.currentTarget;
    isDraggingRef.current = true;
    onDragPreviewChange?.({ groupId: group.id, bounds, delta: { x: 0, y: 0 } });
    element.setPointerCapture(pointerId);

    const flushPreview = () => {
      frameId = null;
      onDragPreviewChange?.({ groupId: group.id, bounds, delta: pendingPreviewDelta });
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const screenDelta = {
        x: moveEvent.clientX - last.x,
        y: moveEvent.clientY - last.y,
      };
      const flowDelta = screenDeltaToFlowDelta(screenDelta);
      last = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (screenDelta.x === 0 && screenDelta.y === 0) return;
      totalFlowDelta = {
        x: totalFlowDelta.x + flowDelta.x,
        y: totalFlowDelta.y + flowDelta.y,
      };
      pendingPreviewDelta = totalFlowDelta;
      if (frameId === null) {
        frameId = requestAnimationFrame(flushPreview);
      }
    };

    const finishDrag = (applyMove: boolean) => {
      isDraggingRef.current = false;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      onDragPreviewChange?.(null);
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      if (applyMove && (totalFlowDelta.x !== 0 || totalFlowDelta.y !== 0)) {
        onMove(group.id, totalFlowDelta);
      }
    };

    const handlePointerUp = () => finishDrag(true);
    const handlePointerCancel = () => finishDrag(false);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
  }, [bounds, group.id, group.locked, isEditing, onDragPreviewChange, onMove, onSelect, screenDeltaToFlowDelta]);

  return (
    <div
      data-workflow-group-id={group.id}
      className={`pointer-events-none absolute transition-shadow ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        backgroundColor: colors.bg,
        border: `2px ${isDropTarget ? 'solid' : 'dashed'} ${isSelected || isDropTarget ? 'var(--primary)' : colors.border}`,
        boxShadow: isDropTarget ? '0 0 0 2px color-mix(in srgb, var(--primary) 25%, transparent)' : undefined,
        borderRadius: 8,
        overflow: 'hidden',
        zIndex: 0,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(group.id); }}
    >
      <div
        className={`pointer-events-auto flex h-10 select-none items-center gap-1 px-2 pb-2 backdrop-blur-sm ${group.locked ? 'cursor-default' : 'cursor-move'}`}
        style={{ backgroundColor: colors.header }}
        onPointerDown={handleHeaderPointerDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { if (!isDraggingRef.current) setIsHovered(false); }}
      >
        <button className="p-0 hover:bg-black/5 rounded" onPointerDown={stopButtonPointerDown} onClick={handleToggleCollapse}>
          {collapsed
            ? <ChevronRight className="h-3 w-3 text-muted-foreground" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground" />
          }
        </button>

        {isEditing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-[10px] bg-transparent outline-none border-b border-primary min-w-0"
            autoFocus
          />
        ) : (
          <span
            className="text-[10px] font-medium truncate flex-1"
            onDoubleClick={handleDoubleClick}
          >
            {group.name || '未命名分组'}
          </span>
        )}

        {isHovered && (
          <div className="flex items-center gap-0.5">
            {GROUP_COLORS.map(c => (
              <button
                key={c.name}
                className={`size-2 rounded-full shrink-0 border transition-all ${
                  group.color === c.name ? 'border-foreground/80 scale-125' : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: c.border }}
                onPointerDown={stopButtonPointerDown}
                onClick={(e) => { e.stopPropagation(); onUpdate(group.id, { color: c.name }); }}
              />
            ))}
            <div className="mx-0.5 h-3 w-px bg-border/50" />
            <WorkflowAutoLayoutMenu
              onAutoLayout={onAutoLayout}
              layoutEngine={layoutEngine}
              nodeIds={layoutNodeIds}
              disabled={group.locked || layoutNodeIds.length === 0}
              buttonClassName="h-5 w-5 p-0 hover:bg-black/10 rounded"
              iconClassName="h-2.5 w-2.5 text-muted-foreground"
            />
            <button className="p-0.5 hover:bg-black/10 rounded" onPointerDown={stopButtonPointerDown} onClick={handleToggleLock}>
              {group.locked
                ? <Lock className="h-2.5 w-2.5 text-orange-500" />
                : <Unlock className="h-2.5 w-2.5 text-muted-foreground" />
              }
            </button>
            <button className="p-0.5 hover:bg-black/10 rounded" onPointerDown={stopButtonPointerDown} onClick={handleDelete}>
              <Trash2 className="h-2.5 w-2.5 text-destructive" />
            </button>
          </div>
        )}
        {group.locked && !isHovered && (
          <Lock className="h-2.5 w-2.5 text-orange-500 shrink-0" />
        )}
      </div>
    </div>
  );
}

// ---- Group management hook ----

export function useGroupManagement() {
  const [groups, setGroups] = useState<WorkflowGroup[]>([]);

  const addGroup = useCallback((name: string, color?: string, childNodeIds?: string[]) => {
    const group: WorkflowGroup = {
      id: `group_${Date.now()}`,
      name,
      color: color || '蓝色',
      childNodeIds: childNodeIds || [],
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    };
    setGroups(prev => [...prev, group]);
    return group;
  }, []);

  const updateGroup = useCallback((id: string, updates: Partial<WorkflowGroup>) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
  }, []);

  const addNodeToGroup = useCallback((groupId: string, nodeId: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId && !g.childNodeIds.includes(nodeId)
        ? { ...g, childNodeIds: [...g.childNodeIds, nodeId] }
        : g
    ));
  }, []);

  const removeNodeFromGroup = useCallback((nodeId: string) => {
    setGroups(prev => prev.map(g =>
      g.childNodeIds.includes(nodeId)
        ? { ...g, childNodeIds: g.childNodeIds.filter(id => id !== nodeId) }
        : g
    ));
  }, []);

  return { groups, setGroups, addGroup, updateGroup, deleteGroup, addNodeToGroup, removeNodeFromGroup };
}
