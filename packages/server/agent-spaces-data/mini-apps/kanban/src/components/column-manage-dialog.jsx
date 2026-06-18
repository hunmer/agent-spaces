import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '../utils/i18n.js';

const { GripVertical, Edit2, Trash2, Plus, Button, Dialog, DialogContent, DialogHeader, DialogTitle } = window.AgentSpacesUI;

const DOT_COLORS = {
  slate: 'bg-stone-400', sky: 'bg-sky-400', emerald: 'bg-emerald-400', amber: 'bg-amber-400', rose: 'bg-rose-400', purple: 'bg-purple-400',
};

function SortableColumnItem({ column, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: column.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-700 rounded-lg">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600 dark:hover:text-neutral-300 p-0.5">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className={`h-3 w-3 rounded-full shrink-0 ${DOT_COLORS[column.color] || 'bg-stone-400'}`} />
      <span className="flex-1 text-sm font-medium truncate">{column.title}</span>
      <button onClick={() => onEdit(column)} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-neutral-200 hover:bg-stone-100 dark:hover:bg-neutral-700 rounded-md transition cursor-pointer">
        <Edit2 className="h-3.5 w-3.5" />
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button onClick={() => { onDelete(column.id); setConfirmDelete(false); }} className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] rounded transition cursor-pointer">{t.confirm}</button>
          <button onClick={() => setConfirmDelete(false)} className="px-1 py-0.5 bg-white dark:bg-neutral-600 border border-stone-200 dark:border-neutral-500 text-stone-600 dark:text-neutral-300 text-[9px] rounded transition cursor-pointer">{t.no}</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function ColumnManageDialog({ isOpen, onClose, columns, onReorder, onEdit, onDelete, onAdd }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex((c) => c.id === active.id);
    const newIndex = columns.findIndex((c) => c.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) onReorder(arrayMove(columns, oldIndex, newIndex));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.manageSections}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 max-h-[400px] overflow-y-auto">
          {columns.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {columns.map((col) => <SortableColumnItem key={col.id} column={col} onEdit={onEdit} onDelete={onDelete} />)}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="text-sm text-stone-400 text-center py-8">{t.noSections}</p>
          )}
        </div>
        <div className="px-4 py-3 border-t">
          <Button size="sm" variant="outline" onClick={onAdd} className="w-full"><Plus className="h-3.5 w-3.5 mr-1.5" />{t.addSection}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
