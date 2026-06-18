const BOARD_PATH = 'board.json';

function normBoard(prev) {
  // 兜底：保证字段完整，避免旧/空数据缺字段
  return {
    title: (prev && prev.title) || 'Kanban',
    layoutMode: (prev && prev.layoutMode) || 'horizontal',
    columns: Array.isArray(prev && prev.columns) ? prev.columns : [],
    tasks: Array.isArray(prev && prev.tasks) ? prev.tasks : [],
  };
}

export default {
  update_title: ({ title }, ctx) => {
    const t = typeof title === 'string' ? title.slice(0, 100) : 'Kanban';
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), title: t }));
  },
  update_layout: ({ layoutMode }, ctx) => {
    const m = layoutMode === 'vertical' ? 'vertical' : 'horizontal';
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), layoutMode: m }));
  },
  update_columns: ({ columns }, ctx) => {
    const cols = Array.isArray(columns) ? columns : [];
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), columns: cols }));
  },
  update_tasks: ({ tasks }, ctx) => {
    const ts = Array.isArray(tasks) ? tasks : [];
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), tasks: ts }));
  },
};
