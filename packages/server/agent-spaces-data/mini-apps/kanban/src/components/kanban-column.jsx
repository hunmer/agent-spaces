import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import KanbanCard from './kanban-card.jsx';
import { t } from '../utils/i18n.js';

const { Plus, ChevronDown, ChevronUp } = window.AgentSpacesUI;

const COLOR_OPTIONS = [
  { name: 'slate', headerBg: 'border-t-stone-500 bg-stone-50 dark:bg-neutral-800 text-stone-700 dark:text-neutral-200' },
  { name: 'sky', headerBg: 'border-t-sky-500 bg-sky-50/40 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300' },
  { name: 'emerald', headerBg: 'border-t-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' },
  { name: 'amber', headerBg: 'border-t-amber-500 bg-amber-50/40 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' },
  { name: 'rose', headerBg: 'border-t-rose-500 bg-rose-50/40 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300' },
  { name: 'purple', headerBg: 'border-t-purple-500 bg-purple-50/40 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300' },
];

const DOT_COLORS = {
  slate: 'bg-stone-400', sky: 'bg-sky-400', emerald: 'bg-emerald-400', amber: 'bg-amber-400', rose: 'bg-rose-400', purple: 'bg-purple-400',
};

export default function KanbanColumn({ column, tasks, layoutMode, onCardClick, onAddTask }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeColor = COLOR_OPTIONS.find((c) => c.name === column.color) || COLOR_OPTIONS[0];
  const taskIds = tasks.map((tk) => tk.id);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-2xl border transition-all duration-200 dark:border-neutral-700 ${isOver ? 'bg-stone-100/60 dark:bg-neutral-700/40 scale-[1.01] shadow-xs' : 'bg-stone-50/25 dark:bg-neutral-800/50 border-stone-200 dark:border-neutral-700'} ${layoutMode === 'horizontal' ? 'w-full md:w-[310px] lg:w-[330px] shrink-0 h-full max-h-[75vh] md:max-h-[80vh]' : 'w-full'}`}
    >
      <div className={`px-4 py-3.5 border-t-2 rounded-t-2xl border-b border-stone-200/80 dark:border-neutral-700 flex items-center justify-between ${activeColor.headerBg}`}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className={`block h-3 w-3 rounded-full ${DOT_COLORS[column.color] || 'bg-stone-400'}`} />
          <h3 className="text-sm font-bold truncate">{column.title}</h3>
          <span className="bg-stone-200/70 dark:bg-neutral-600 text-stone-700 dark:text-neutral-300 text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[18px] text-center">{tasks.length}</span>
        </div>
        {layoutMode === 'vertical' && (
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-neutral-200 hover:bg-stone-100 dark:hover:bg-neutral-700 rounded-md transition cursor-pointer">
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        )}
      </div>

      {(!isCollapsed || layoutMode === 'horizontal') && (
        <div className={`p-3.5 flex-1 flex flex-col gap-3 min-h-[140px] select-none ${layoutMode === 'horizontal' ? 'overflow-y-auto' : ''}`}>
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.length > 0 ? (
              <div className={`grid gap-3 ${layoutMode === 'vertical' ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1'}`}>
                {tasks.map((task) => <KanbanCard key={task.id} task={task} onClick={() => onCardClick(task)} />)}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-6 px-4 border border-dashed border-stone-200 dark:border-neutral-600 rounded-xl text-stone-400">
                <p className="text-xs font-medium">{t.emptySection}</p>
                <p className="text-[10px] mt-1">{t.dropHint}</p>
              </div>
            )}
          </SortableContext>
          <button onClick={() => onAddTask(column.id)} className="w-full flex items-center justify-center gap-1.5 py-2 px-3 mt-1 text-xs font-semibold text-stone-500 dark:text-neutral-400 hover:text-stone-900 dark:hover:text-neutral-100 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 hover:border-stone-400 dark:hover:border-neutral-500 rounded-xl transition cursor-pointer">
            <Plus className="h-4 w-4" />{t.addTask}
          </button>
        </div>
      )}
    </div>
  );
}
