// Kanban 原子工具实现
// 数据结构: { title, layoutMode, columns:[{id,title,color,order}], tasks:[{id,title,description,priority,columnId,dueDate}] }
// 读写入口统一走 ctx.readConfig / ctx.writeConfig（服务端 ApiCtx 不提供 updateConfig）。

const BOARD_PATH = 'board.json';
const TITLE_MAX = 100;
const COLUMN_TITLE_MAX = 25;
const TASK_TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const COLUMN_COLORS = ['sky', 'amber', 'emerald', 'rose', 'purple', 'slate'];
const PRIORITIES = ['low', 'medium', 'high'];
const LAYOUT_MODES = ['horizontal', 'vertical'];

function genId(prefix) {
  const g = globalThis.crypto;
  const uid = g && g.randomUUID
    ? g.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${uid}`;
}

function normBoard(prev) {
  return {
    title: (prev && typeof prev.title === 'string') ? prev.title : 'Kanban',
    layoutMode: (prev && LAYOUT_MODES.includes(prev.layoutMode)) ? prev.layoutMode : 'horizontal',
    columns: (prev && Array.isArray(prev.columns)) ? prev.columns : [],
    tasks: (prev && Array.isArray(prev.tasks)) ? prev.tasks : [],
  };
}

function loadBoard(ctx) {
  return normBoard(ctx.readConfig(BOARD_PATH));
}

function saveBoard(ctx, board) {
  ctx.writeConfig(BOARD_PATH, board);
  return board;
}

function isNonEmptyStr(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function clampStr(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function err(msg) {
  return { error: msg };
}

// ---- 读操作 ----

function get_board(_input, ctx) {
  return loadBoard(ctx);
}

function list_columns(_input, ctx) {
  return loadBoard(ctx).columns;
}

function list_cards(input, ctx) {
  const board = loadBoard(ctx);
  const colId = (input && typeof input.columnId === 'string') ? input.columnId : null;
  if (colId !== null && !board.columns.some((c) => c.id === colId)) {
    return err(`列不存在: ${colId}`);
  }
  return colId === null ? board.tasks : board.tasks.filter((tk) => tk.columnId === colId);
}

function get_card(input, ctx) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  if (!id) return err('缺少参数 id');
  const task = loadBoard(ctx).tasks.find((tk) => tk.id === id);
  return task || err(`卡片不存在: ${id}`);
}

// ---- 列操作 ----

function create_column(input, ctx) {
  const title = isNonEmptyStr(input && input.title) ? input.title.trim() : '';
  if (!title) return err('缺少参数 title');
  const color = input && COLUMN_COLORS.includes(input.color) ? input.color : 'sky';
  const board = loadBoard(ctx);
  if (board.columns.some((c) => c.title === title)) {
    return err(`列标题已存在: ${title}`);
  }
  const column = { id: genId('col'), title: clampStr(title, COLUMN_TITLE_MAX), color, order: board.columns.length };
  board.columns.push(column);
  saveBoard(ctx, board);
  return column;
}

function rename_column(input, ctx) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  const title = isNonEmptyStr(input && input.title) ? input.title.trim() : '';
  if (!id) return err('缺少参数 id');
  if (!title) return err('缺少参数 title');
  const board = loadBoard(ctx);
  const col = board.columns.find((c) => c.id === id);
  if (!col) return err(`列不存在: ${id}`);
  col.title = clampStr(title, COLUMN_TITLE_MAX);
  saveBoard(ctx, board);
  return col;
}

function delete_column(input, ctx) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  const force = input && input.force === true;
  if (!id) return err('缺少参数 id');
  const board = loadBoard(ctx);
  const idx = board.columns.findIndex((c) => c.id === id);
  if (idx === -1) return err(`列不存在: ${id}`);
  // 非空列默认拒绝，避免静默丢失卡片
  if (!force && board.tasks.some((tk) => tk.columnId === id)) {
    return err(`列 ${id} 非空，拒绝删除；请先移走卡片或传 force=true`);
  }
  const [removed] = board.columns.splice(idx, 1);
  if (force) board.tasks = board.tasks.filter((tk) => tk.columnId !== id);
  // 重排 order
  board.columns.forEach((c, i) => { c.order = i; });
  saveBoard(ctx, board);
  return { removed };
}

// ---- 卡片操作 ----

function normalizeTaskInput(input, board) {
  const title = isNonEmptyStr(input && input.title) ? input.title.trim() : '';
  if (!title) return err('缺少参数 title');
  const columnId = input && typeof input.columnId === 'string' ? input.columnId : '';
  if (!columnId || !board.columns.some((c) => c.id === columnId)) {
    return err(`列不存在: ${columnId || '(空)'}`);
  }
  const priority = input && PRIORITIES.includes(input.priority) ? input.priority : 'medium';
  const description = clampStr((input && input.description) || '', DESCRIPTION_MAX);
  const dueDate = input && typeof input.dueDate === 'string' ? input.dueDate : '';
  return { title: clampStr(title, TASK_TITLE_MAX), columnId, priority, description, dueDate };
}

function create_card(input, ctx) {
  const board = loadBoard(ctx);
  const norm = normalizeTaskInput(input, board);
  if (norm.error) return norm;
  const task = {
    id: genId('task'),
    title: norm.title,
    description: norm.description,
    priority: norm.priority,
    columnId: norm.columnId,
    dueDate: norm.dueDate,
    createdAt: Date.now(),
  };
  board.tasks.push(task);
  saveBoard(ctx, board);
  return task;
}

function update_card(input, ctx) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  if (!id) return err('缺少参数 id');
  const board = loadBoard(ctx);
  const task = board.tasks.find((tk) => tk.id === id);
  if (!task) return err(`卡片不存在: ${id}`);

  if (isNonEmptyStr(input.title)) task.title = clampStr(input.title.trim(), TASK_TITLE_MAX);
  if (input.description !== undefined) task.description = clampStr(input.description, DESCRIPTION_MAX);
  if (input.priority !== undefined && PRIORITIES.includes(input.priority)) task.priority = input.priority;
  if (input.dueDate !== undefined) task.dueDate = typeof input.dueDate === 'string' ? input.dueDate : '';
  if (typeof input.columnId === 'string' && input.columnId !== task.columnId) {
    if (!board.columns.some((c) => c.id === input.columnId)) return err(`列不存在: ${input.columnId}`);
    task.columnId = input.columnId;
  }
  saveBoard(ctx, board);
  return task;
}

function move_card(input, ctx) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  const toColumnId = input && typeof input.toColumnId === 'string' ? input.toColumnId : '';
  if (!id) return err('缺少参数 id');
  if (!toColumnId) return err('缺少参数 toColumnId');
  const board = loadBoard(ctx);
  const task = board.tasks.find((tk) => tk.id === id);
  if (!task) return err(`卡片不存在: ${id}`);
  if (!board.columns.some((c) => c.id === toColumnId)) return err(`列不存在: ${toColumnId}`);
  if (task.columnId === toColumnId) return { moved: false, reason: '已在目标列' };
  task.columnId = toColumnId;
  saveBoard(ctx, board);
  return { moved: true, task };
}

function delete_card(input, ctx) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  if (!id) return err('缺少参数 id');
  const board = loadBoard(ctx);
  const idx = board.tasks.findIndex((tk) => tk.id === id);
  if (idx === -1) return err(`卡片不存在: ${id}`);
  const [removed] = board.tasks.splice(idx, 1);
  saveBoard(ctx, board);
  return { removed };
}

export default {
  get_board,
  list_columns,
  list_cards,
  get_card,
  create_column,
  rename_column,
  delete_column,
  create_card,
  update_card,
  move_card,
  delete_card,
};
