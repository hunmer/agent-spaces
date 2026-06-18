import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '../utils/i18n.js';

const { Calendar, AlignLeft, GripVertical, CheckCircle2, AlertCircle } = window.AgentSpacesUI;

const PRIORITY_STYLES = {
  low: { text: 'text-emerald-700 bg-emerald-50 border border-emerald-100', dot: 'bg-emerald-500' },
  medium: { text: 'text-amber-700 bg-amber-50 border border-amber-100', dot: 'bg-amber-500' },
  high: { text: 'text-rose-700 bg-rose-50 border border-rose-100', dot: 'bg-rose-500' },
};

const PRIORITY_LABEL = { low: t.low, medium: t.medium, high: t.high };

function formatDate(dateStr) {
  try { return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return dateStr; }
}

export default function KanbanCard({ task, onClick, isOverlay = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isOverlay,
  });

  const style = isOverlay
    ? { transform: 'rotate(2.5deg) scale(1.04)', cursor: 'grabbing' }
    : { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, cursor: isDragging ? 'grabbing' : 'pointer' };

  const ps = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.columnId !== 'done' && task.columnId !== 'archive';

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => { if (!isDragging) onClick(); }}
      className={`group relative flex flex-col p-4 bg-white dark:bg-neutral-800 rounded-xl border border-stone-200 dark:border-neutral-700 hover:border-stone-400 dark:hover:border-neutral-500 hover:shadow-md transition-all duration-200 ${isOverlay ? 'shadow-2xl border-2 scale-105 rotate-2 z-20' : 'shadow-xs'}`}
      {...(!isOverlay ? attributes : {})}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase ${ps.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ps.dot}`} />
          {PRIORITY_LABEL[task.priority]}
        </span>
        {!isOverlay && (
          <div {...listeners} className="p-1 text-stone-300 group-hover:text-stone-500 rounded-md hover:bg-stone-50 dark:hover:bg-neutral-700 transition cursor-grab active:cursor-grabbing" onClick={(e) => e.stopPropagation()}>
            <GripVertical className="h-4 w-4" />
          </div>
        )}
      </div>
      <h4 className="text-sm font-semibold text-stone-800 dark:text-neutral-100 line-clamp-2 leading-snug mb-1.5">{task.title}</h4>
      {task.description ? <p className="text-xs text-stone-500 dark:text-neutral-400 line-clamp-2 leading-relaxed mb-3">{task.description}</p> : null}
      <div className="border-t border-stone-100 dark:border-neutral-700 my-2" />
      <div className="flex items-center justify-between text-[11px] text-stone-400 dark:text-neutral-500 font-medium">
        <div className="flex items-center gap-1">
          {task.description ? <AlignLeft className="h-3.5 w-3.5 text-stone-300" /> : null}
          {task.columnId === 'done' ? <span className="flex items-center gap-0.5 text-emerald-600 font-bold"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{t.done}</span> : null}
          {task.columnId === 'archive' ? <span className="flex items-center gap-0.5 text-stone-500 font-bold"><AlertCircle className="h-3.5 w-3.5 text-stone-400" />{t.archived}</span> : null}
        </div>
        {task.dueDate ? (
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${overdue ? 'text-rose-600 bg-rose-50 font-bold border border-rose-100' : 'text-stone-500'}`}>
            <Calendar className="h-3 w-3" />{formatDate(task.dueDate)}
          </span>
        ) : (
          <span className="text-[10px] text-stone-300">{formatDate(new Date(task.createdAt).toISOString())}</span>
        )}
      </div>
    </div>
  );
}
