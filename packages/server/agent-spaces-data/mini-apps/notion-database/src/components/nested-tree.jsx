// 沙箱版嵌套树渲染。原 @/components/editor/file-tree 的 NestedTree 在沙箱不可用。
// 递归渲染 + 展开折叠 + 选中 + 拖拽排序（@dnd-kit）。
import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';

const cn = (...a) => a.filter(Boolean).join(' ');

export function NestedTree({ nodes, activeId, openFolders, onSelect, onToggle, onReorder, renderNode }) {
  const childrenOf = (pid) => nodes.filter((n) => (n.parentId || null) === (pid || null));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const renderLevel = (parentId, depth) => {
    const items = childrenOf(parentId);
    return (
      <DndContext key={`lvl-${parentId || 'root'}`} sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={(e) => {
          const { active, over } = e;
          if (over && active.id !== over.id) {
            const ordered = arrayMove(items, items.findIndex((i) => i.id === active.id), items.findIndex((i) => i.id === over.id));
            onReorder && onReorder(parentId, ordered.map((i) => i.id));
          }
        }}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((node) => {
            const isOpen = !!openFolders[node.id];
            const children = node.type === 'folder' && isOpen ? renderLevel(node.id, depth + 1) : null;
            return (
              <TreeRow key={node.id} node={node} depth={depth} active={node.id === activeId}
                isOpen={isOpen} onSelect={onSelect} onToggle={onToggle} renderNode={renderNode}>
                {children}
              </TreeRow>
            );
          })}
        </SortableContext>
      </DndContext>
    );
  };
  return <div>{renderLevel(null, 0)}</div>;
}

function TreeRow({ node, depth, active, isOpen, onSelect, onToggle, renderNode, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const style = { transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, transition, paddingLeft: depth * 12 };
  return (
    <div ref={setNodeRef} style={style}>
      <div className={cn('flex items-center gap-1 px-2 py-1 rounded cursor-pointer', active && 'bg-accent', isDragging && 'opacity-50')}
        onClick={() => onSelect && onSelect(node)} {...attributes} {...listeners}>
        {renderNode ? renderNode({ node, isOpen, onToggle }) : <span>{node.title || node.id}</span>}
      </div>
      {children}
    </div>
  );
}
