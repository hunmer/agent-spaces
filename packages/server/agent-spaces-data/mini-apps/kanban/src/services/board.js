const BOARD_PATH = 'board.json';

const COLUMN_TITLE_MAX = 25;
const TASK_TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const COLUMN_COLORS = ['sky', 'amber', 'emerald', 'rose', 'purple', 'slate'];
const PRIORITIES = ['low', 'medium', 'high'];
const LAYOUT_MODES = ['horizontal', 'vertical'];

function getBoardPath(workspaceId) {
  return workspaceId ? `workspaces/${encodeURIComponent(workspaceId)}/${BOARD_PATH}` : BOARD_PATH;
}

function genId(prefix) {
  const g = globalThis.crypto;
  const uid = g && g.randomUUID
    ? g.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${uid}`;
}

function normBoard(prev) {
  // 兜底：保证字段完整，避免旧/空数据缺字段
  return {
    title: (prev && typeof prev.title === 'string') ? prev.title : 'Kanban',
    layoutMode: (prev && LAYOUT_MODES.includes(prev.layoutMode)) ? prev.layoutMode : 'horizontal',
    columns: (prev && Array.isArray(prev.columns)) ? prev.columns : [],
    tasks: (prev && Array.isArray(prev.tasks)) ? prev.tasks : [],
  };
}

function clampStr(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export default {
  // ---- 整组覆盖（保留：用于批量场景，如拖拽重排、模板应用）----
  update_title: ({ title, workspaceId }, ctx) => {
    const t = typeof title === 'string' ? title.slice(0, 100) : 'Kanban';
    return ctx.updateConfig(getBoardPath(workspaceId), (prev) => ({ ...normBoard(prev), title: t }));
  },
  update_layout: ({ layoutMode, workspaceId }, ctx) => {
    const m = layoutMode === 'vertical' ? 'vertical' : 'horizontal';
    return ctx.updateConfig(getBoardPath(workspaceId), (prev) => ({ ...normBoard(prev), layoutMode: m }));
  },
  update_columns: ({ columns, workspaceId }, ctx) => {
    const cols = Array.isArray(columns) ? columns : [];
    return ctx.updateConfig(getBoardPath(workspaceId), (prev) => ({ ...normBoard(prev), columns: cols }));
  },
  update_tasks: ({ tasks, workspaceId }, ctx) => {
    const ts = Array.isArray(tasks) ? tasks : [];
    return ctx.updateConfig(getBoardPath(workspaceId), (prev) => ({ ...normBoard(prev), tasks: ts }));
  },

  // ---- 列：原子操作 ----
  create_column: ({ title, color, workspaceId }, ctx) => ctx.updateConfig(getBoardPath(workspaceId), (prev) => {
    const board = normBoard(prev);
    const t = typeof title === 'string' ? title.trim() : '';
    if (!t) throw new Error('缺少参数 title');
    const c = (color && COLUMN_COLORS.includes(color)) ? color : 'sky';
    const column = { id: genId('col'), title: clampStr(t, COLUMN_TITLE_MAX), color: c, order: board.columns.length };
    board.columns.push(column);
    return board;
  }),
  rename_column: ({ id, title, color, workspaceId }, ctx) => ctx.updateConfig(getBoardPath(workspaceId), (prev) => {
    const board = normBoard(prev);
    const col = board.columns.find((c) => c.id === id);
    if (!col) throw new Error(`列不存在: ${id}`);
    const t = typeof title === 'string' ? title.trim() : '';
    if (!t) throw new Error('缺少参数 title');
    col.title = clampStr(t, COLUMN_TITLE_MAX);
    if (color && COLUMN_COLORS.includes(color)) col.color = color;
    return board;
  }),
  delete_column: ({ id, force, workspaceId }, ctx) => ctx.updateConfig(getBoardPath(workspaceId), (prev) => {
    const board = normBoard(prev);
    const idx = board.columns.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`列不存在: ${id}`);
    if (!force && board.tasks.some((tk) => tk.columnId === id)) {
      throw new Error(`列 ${id} 非空，拒绝删除；请先移走卡片或传 force=true`);
    }
    board.columns.splice(idx, 1);
    if (force) board.tasks = board.tasks.filter((tk) => tk.columnId !== id);
    board.columns.forEach((c, i) => { c.order = i; });
    return board;
  }),

  // ---- 卡片：原子操作 ----
  create_card: ({ title, columnId, description, priority, dueDate, workspaceId }, ctx) => ctx.updateConfig(getBoardPath(workspaceId), (prev) => {
    const board = normBoard(prev);
    const t = typeof title === 'string' ? title.trim() : '';
    if (!t) throw new Error('缺少参数 title');
    if (!columnId || !board.columns.some((c) => c.id === columnId)) {
      throw new Error(`列不存在: ${columnId || '(空)'}`);
    }
    const task = {
      id: genId('task'),
      title: clampStr(t, TASK_TITLE_MAX),
      description: clampStr(description || '', DESCRIPTION_MAX),
      priority: priority && PRIORITIES.includes(priority) ? priority : 'medium',
      columnId,
      dueDate: typeof dueDate === 'string' ? dueDate : '',
      createdAt: Date.now(),
    };
    board.tasks.push(task);
    return board;
  }),
  update_card: ({ id, title, description, priority, dueDate, columnId, workspaceId }, ctx) => ctx.updateConfig(getBoardPath(workspaceId), (prev) => {
    const board = normBoard(prev);
    const task = board.tasks.find((tk) => tk.id === id);
    if (!task) throw new Error(`卡片不存在: ${id}`);
    if (typeof title === 'string' && title.trim()) task.title = clampStr(title.trim(), TASK_TITLE_MAX);
    if (description !== undefined) task.description = clampStr(description, DESCRIPTION_MAX);
    if (priority !== undefined && PRIORITIES.includes(priority)) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = typeof dueDate === 'string' ? dueDate : '';
    if (typeof columnId === 'string' && columnId !== task.columnId) {
      if (!board.columns.some((c) => c.id === columnId)) throw new Error(`列不存在: ${columnId}`);
      task.columnId = columnId;
    }
    return board;
  }),
  delete_card: ({ id, workspaceId }, ctx) => ctx.updateConfig(getBoardPath(workspaceId), (prev) => {
    const board = normBoard(prev);
    const idx = board.tasks.findIndex((tk) => tk.id === id);
    if (idx === -1) throw new Error(`卡片不存在: ${id}`);
    board.tasks.splice(idx, 1);
    return board;
  }),
};
