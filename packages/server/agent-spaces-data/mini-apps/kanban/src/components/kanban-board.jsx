import { useState, useCallback, useMemo } from 'react';
import {
  DndContext, useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor,
  DragOverlay, defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove, SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanColumnComponent from './kanban-column.jsx';
import KanbanCard from './kanban-card.jsx';
import TaskModal from './task-modal.jsx';
import ColumnModal from './column-modal.jsx';
import ColumnManageDialog from './column-manage-dialog.jsx';
import { useBoard, createBoardActions } from '../hooks/use-board.js';
import { genId } from '../utils/constants.js';
import { t } from '../utils/i18n.js';

const { Plus, LayoutGrid, Search, Layers, WandSparkles } = window.AgentSpacesUI;

export default function KanbanBoard() {
  const { board, loaded, update } = useBoard();
  const actions = useMemo(() => createBoardActions(board, update), [board, update]);

  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeDragTask, setActiveDragTask] = useState(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);
  const [isManageOpen, setIsManageOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = board.columns;
  const tasks = board.tasks;
  const layoutMode = board.layoutMode;

  const filteredTasks = useMemo(() => tasks.filter((tk) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || tk.title.toLowerCase().includes(q) || (tk.description || '').toLowerCase().includes(q);
    const matchesPriority = priorityFilter === 'all' || tk.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  }), [tasks, searchQuery, priorityFilter]);

  // --- Drag handlers (tasks only) ---
  const handleDragStart = useCallback(({ active }) => {
    const taskObj = tasks.find((tk) => tk.id === active.id);
    if (taskObj) setActiveDragTask(taskObj);
  }, [tasks]);

  const handleDragOver = useCallback(({ active, over }) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    if (columns.some((c) => c.id === activeId)) return;
    const activeTaskObj = tasks.find((tk) => tk.id === activeId);
    if (!activeTaskObj) return;
    const isOverAColumn = columns.some((c) => c.id === overId);
    const targetColumnId = isOverAColumn ? overId : tasks.find((tk) => tk.id === overId)?.columnId;
    if (targetColumnId && activeTaskObj.columnId !== targetColumnId) {
      actions.setTasks(tasks.map((tk) => (tk.id === activeId ? { ...tk, columnId: targetColumnId } : tk)));
    }
  }, [columns, tasks, actions]);

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveDragTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (columns.some((c) => c.id === activeId)) return;
    const activeTaskObj = tasks.find((tk) => tk.id === activeId);
    if (!activeTaskObj) return;
    const isOverAColumn = columns.some((c) => c.id === overId);
    const targetColumnId = isOverAColumn ? overId : tasks.find((tk) => tk.id === overId)?.columnId;
    if (!targetColumnId) return;
    const ai = tasks.findIndex((tk) => tk.id === activeId);
    const oi = tasks.findIndex((tk) => tk.id === overId);
    const updated = tasks.map((tk) => (tk.id === activeId ? { ...tk, columnId: targetColumnId } : tk));
    if (oi !== -1) actions.setTasks(arrayMove(updated, ai, oi));
    else actions.setTasks(updated);
  }, [columns, tasks, actions]);

  // --- Actions ---
  const handleAddTask = (columnId) => {
    const newTask = {
      id: genId('task'), title: '', description: '', priority: 'medium',
      columnId, order: tasks.filter((tk) => tk.columnId === columnId).length,
      createdAt: Date.now(),
    };
    setSelectedTask(newTask);
    setIsTaskModalOpen(true);
  };

  const handleApplyTemplate = () => {
    const template = [
      { title: 'Draft', color: 'slate' }, { title: 'Todo', color: 'sky' },
      { title: 'In Progress', color: 'amber' }, { title: 'Done', color: 'emerald' }, { title: 'Bug', color: 'rose' },
    ];
    const newCols = template.map((tp, i) => ({ id: genId('col'), title: tp.title, color: tp.color, order: columns.length + i }));
    update({ columns: [...columns, ...newCols] });
  };

  if (!loaded) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t.loading}</div>;

  const priorityLabels = { all: t.priorityAll, high: t.priorityHigh, medium: t.priorityMedium, low: t.priorityLow };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-stone-200 dark:border-neutral-700 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <input type="text" placeholder={t.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-stone-50 dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-stone-500/10 transition" />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {['all', 'high', 'medium', 'low'].map((p) => (
            <button key={p} onClick={() => setPriorityFilter(p)} className={`px-2.5 py-1 text-[10px] rounded-full border transition font-medium cursor-pointer ${priorityFilter === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-white dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-300 hover:bg-stone-50 text-stone-600 border-stone-200'}`}>{priorityLabels[p]}</button>
          ))}
        </div>
        <button onClick={() => handleAddTask(columns[0]?.id || '')} disabled={columns.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"><Plus className="h-3.5 w-3.5" />{t.newCard}</button>
        <button onClick={() => setIsManageOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 rounded-lg text-xs font-semibold text-stone-600 dark:text-neutral-300 shadow-xs transition cursor-pointer"><Layers className="h-3.5 w-3.5" />{t.section}</button>
        <button onClick={() => actions.updateLayout(layoutMode === 'horizontal' ? 'vertical' : 'horizontal')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 rounded-lg text-xs font-semibold text-stone-600 dark:text-neutral-300 shadow-xs transition cursor-pointer"><LayoutGrid className="h-3.5 w-3.5" />{layoutMode === 'horizontal' ? t.vertical : t.horizontal}</button>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {columns.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 border border-dashed border-stone-200 dark:border-neutral-600 rounded-3xl">
            <Layers className="h-10 w-10 text-stone-300 mb-3" />
            <p className="text-sm font-bold text-stone-500 dark:text-neutral-400">{t.noSections}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={handleApplyTemplate} className="px-4 py-2 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 text-stone-600 dark:text-neutral-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-stone-50 dark:hover:bg-neutral-700 transition"><WandSparkles className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />{t.useTemplate}</button>
              <button onClick={() => setIsColumnModalOpen(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold cursor-pointer">{t.addSection}</button>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className={`flex-1 h-full ${layoutMode === 'horizontal' ? 'flex flex-row overflow-x-auto items-start gap-4 pb-4' : 'flex flex-col gap-4 overflow-y-auto'}`}>
              <SortableContext items={columns.map((c) => c.id)} strategy={layoutMode === 'horizontal' ? horizontalListSortingStrategy : verticalListSortingStrategy}>
                {columns.map((col) => (
                  <KanbanColumnComponent
                    key={col.id} column={col} tasks={filteredTasks.filter((tk) => tk.columnId === col.id)}
                    layoutMode={layoutMode} onCardClick={(task) => { setSelectedTask(task); setIsTaskModalOpen(true); }}
                    onAddTask={handleAddTask}
                  />
                ))}
              </SortableContext>
              {layoutMode === 'horizontal' && (
                <button onClick={() => setIsColumnModalOpen(true)} className="w-[280px] shrink-0 h-[120px] rounded-2xl border-2 border-dashed border-stone-200 dark:border-neutral-600 hover:border-stone-400 dark:hover:border-neutral-400 text-stone-400 hover:text-stone-800 dark:hover:text-neutral-200 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer">
                  <Plus className="h-5 w-5" /><span className="text-xs font-bold">{t.newSection}</span>
                </button>
              )}
            </div>
            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
              {activeDragTask ? <KanbanCard task={activeDragTask} onClick={() => {}} isOverlay /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <TaskModal task={selectedTask} columns={columns} isOpen={isTaskModalOpen} onClose={() => { setIsTaskModalOpen(false); setSelectedTask(null); }} onSave={actions.saveTask} onDelete={actions.deleteTask} />
      <ColumnModal isOpen={isColumnModalOpen} onClose={() => { setIsColumnModalOpen(false); setEditingColumn(null); }} onCreate={actions.addColumn} onEdit={actions.editColumn} editingColumn={editingColumn} />
      <ColumnManageDialog
        isOpen={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        columns={columns}
        onReorder={actions.reorderColumns}
        onEdit={(col) => { setIsManageOpen(false); setEditingColumn(col); setIsColumnModalOpen(true); }}
        onDelete={actions.deleteColumn}
        onAdd={() => { setIsManageOpen(false); setIsColumnModalOpen(true); }}
      />
    </div>
  );
}
