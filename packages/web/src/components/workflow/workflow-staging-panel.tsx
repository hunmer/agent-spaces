'use client';

import { useState, useEffect, useCallback, type DragEvent } from 'react';
import type { StagedNode } from '@agent-spaces/shared';
import { stagingApi } from '@/lib/workflow-api';
import { useLocalizedNodeDefinition } from '@/lib/workflow-nodes';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GripVertical, Trash2, Plus, Inbox, Loader2 } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { WORKFLOW_NODE_DRAG_MIME, WORKFLOW_STAGED_NODE_DRAG_MIME } from './workflow-drag-types';

interface StagingPanelProps {
  workflowId: string;
  onAddFromStaging: (node: StagedNode) => void;
}

const WIDE_BREAKPOINT = 1024;

function useIsWide() {
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`);
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isWide;
}

function SortableStagedItem({
  node, onDelete, onUse, horizontal,
}: {
  node: StagedNode;
  onDelete: () => void;
  onUse: () => void;
  horizontal?: boolean;
}) {
  const t = useTranslations('workflows');
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: node.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const def = useLocalizedNodeDefinition(node.type);
  const label = (node.data?.label as string) || def?.label || node.type;
  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(WORKFLOW_NODE_DRAG_MIME, node.type);
    event.dataTransfer.setData(WORKFLOW_STAGED_NODE_DRAG_MIME, JSON.stringify(node));
    event.dataTransfer.effectAllowed = 'copy';
  }, [node]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      draggable
      onDragStart={handleDragStart}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors border border-transparent hover:border-border${horizontal ? ' w-44 shrink-0 bg-card' : ''}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate">{label}</div>
        <div className="text-[9px] text-muted-foreground">{def?.category || t('staging.uncategorized')}</div>
      </div>
      <div className="hidden group-hover:flex gap-0.5">
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onUse}>
          <Plus className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={onDelete}>
          <Trash2 className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  );
}

export function WorkflowStagingPanel({ workflowId, onAddFromStaging }: StagingPanelProps) {
  const t = useTranslations('workflows');
  const [nodes, setNodes] = useState<StagedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const isWide = useIsWide();

  const loadStaging = useCallback(async () => {
    try {
      const list = await stagingApi.load(workflowId);
      setNodes(list);
    } catch {
      // Staging is optional
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { loadStaging(); }, [loadStaging]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { staged } = (e as CustomEvent).detail;
      if (!staged) return;
      setNodes(prev => {
        const updated = [...prev, staged];
        stagingApi.save(workflowId, updated).catch(() => {});
        return updated;
      });
    };
    window.addEventListener('workflow:node-staged', handler);
    return () => window.removeEventListener('workflow:node-staged', handler);
  }, [workflowId]);

  const handleSave = useCallback(async (updated: StagedNode[]) => {
    setNodes(updated);
    try {
      await stagingApi.save(workflowId, updated);
    } catch { /* silent */ }
  }, [workflowId]);

  const handleDelete = useCallback((id: string) => {
    const updated = nodes.filter(n => n.id !== id);
    handleSave(updated);
  }, [nodes, handleSave]);

  const handleClear = useCallback(async () => {
    await stagingApi.clear(workflowId);
    setNodes([]);
  }, [workflowId]);

  const handleDragEnd = useCallback((event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = nodes.findIndex(n => n.id === active.id);
    const newIndex = nodes.findIndex(n => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const updated = [...nodes];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);
    handleSave(updated);
  }, [nodes, handleSave]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderNodes = () => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={nodes.map(n => n.id)}
        strategy={isWide ? horizontalListSortingStrategy : verticalListSortingStrategy}
      >
        {isWide ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {nodes.map(node => (
              <SortableStagedItem
                key={node.id}
                node={node}
                horizontal
                onDelete={() => handleDelete(node.id)}
                onUse={() => onAddFromStaging(node)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {nodes.map(node => (
              <SortableStagedItem
                key={node.id}
                node={node}
                onDelete={() => handleDelete(node.id)}
                onUse={() => onAddFromStaging(node)}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </DndContext>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <span className="text-xs font-medium">{t('staging.count', { count: nodes.length })}</span>
        {nodes.length > 0 && (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleClear}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Staged nodes */}
      {nodes.length === 0 ? (
        <div className="flex-1 text-xs text-muted-foreground text-center py-6">
          <Inbox className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p>{t('staging.empty')}</p>
          <p className="text-[10px] mt-1">{t('staging.emptyHint')}</p>
        </div>
      ) : isWide ? (
        <div className="px-3">{renderNodes()}</div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-3 pb-3">{renderNodes()}</div>
        </ScrollArea>
      )}
    </div>
  );
}
