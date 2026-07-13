const BOARD_PATH = 'board.json';

export default {
  get_board: (_input, ctx) => ctx.readConfig(BOARD_PATH) ?? {
    title: 'Kanban', layoutMode: 'horizontal', columns: [], tasks: [],
  },
  write_board: (input, ctx) => {
    const board = {
      title: typeof input.title === 'string' ? input.title.slice(0, 100) : 'Kanban',
      layoutMode: input.layoutMode === 'vertical' ? 'vertical' : 'horizontal',
      columns: Array.isArray(input.columns) ? input.columns : [],
      tasks: Array.isArray(input.tasks) ? input.tasks : [],
    };
    ctx.writeConfig(BOARD_PATH, board);
    return board;
  },
};
