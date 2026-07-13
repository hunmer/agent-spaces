import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import KanbanCard from './kanban-card.jsx';
import { t } from '../utils/i18n.js';

const { Plus, ChevronDown, ChevronUp } = window.AgentSpacesUI;

const COLUMN_COLORS = {
  slate: '#78716c', sky: '#0ea5e9', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', purple: '#a855f7',
};

export default function KanbanColumn({ column, tasks, layoutMode, onCardClick, onAddTask }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeColor = COLUMN_COLORS[column.color] || COLUMN_COLORS.slate;
  const taskIds = tasks.map((tk) => tk.id);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 dark:border-neutral-700 ${isOver ? 'bg-stone-100/60 dark:bg-neutral-700/40 scale-[1.01] shadow-xs' : 'bg-stone-50/25 dark:bg-neutral-800/50 border-stone-200 dark:border-neutral-700'} ${layoutMode === 'horizontal' ? 'w-full md:w-[310px] lg:w-[330px] shrink-0 h-full max-h-[75vh] md:max-h-[80vh]' : 'w-full'}`}
      style={{ maxWidth: layoutMode === 'horizontal' ? 330 : undefined }}
    >
      <div
        className="px-4 py-3.5 border-t-2 rounded-t-2xl border-b border-stone-200/80 dark:border-neutral-700 flex items-center justify-between"
        style={{ borderTopColor: activeColor, backgroundColor: `${activeColor}1f`, color: activeColor }}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: activeColor }} />
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
        <div className={`flex-1 flex flex-col gap-3 min-h-[140px] select-none ${layoutMode === 'horizontal' ? 'overflow-y-auto' : ''}`} style={{ padding: 14 }}>
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
