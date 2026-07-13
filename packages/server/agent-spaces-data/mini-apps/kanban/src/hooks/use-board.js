const BOARD_PATH = 'board.json';
const EMPTY_BOARD = { title: 'Kanban', layoutMode: 'horizontal', columns: [], tasks: [] };

export function useBoard() {
  const [board, setBoard] = React.useState(EMPTY_BOARD);
  const [loaded, setLoaded] = React.useState(false);

  // 初始化：等待配置快照就绪；即便没有 board.json，也应进入空白看板。
  React.useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS) {
      setLoaded(true);
      return;
    }
    const applyInitialBoard = () => {
      const b = AS.getConfig?.(BOARD_PATH);
      if (b) setBoard(b);
      setLoaded(true);
    };
    if (AS.isConfigReady?.()) {
      applyInitialBoard();
      return;
    }
    if (!AS.onConfigReady) {
      applyInitialBoard();
      return;
    }
    const offReady = AS.onConfigReady?.(applyInitialBoard);
    return () => { try { offReady?.(); } catch {} };
  }, []);

  // 订阅变更：configSnapshot / configChanged 都会走这里，同步权威配置。
  React.useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS?.onConfigChanged) return;
    const unsub = AS.onConfigChanged((path, value) => {
      if (path === BOARD_PATH && value) {
        setBoard(value);
        setLoaded(true);
      }
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  const update = React.useCallback((patch) => {
    // 乐观更新本地 + 落盘（service 广播后会用权威值回填）
    setBoard((prev) => ({ ...prev, ...patch }));
    if (patch.title !== undefined) AS_invoke('update_title', { title: patch.title });
    else if (patch.layoutMode !== undefined) AS_invoke('update_layout', { layoutMode: patch.layoutMode });
    else if (patch.columns !== undefined) AS_invoke('update_columns', { columns: patch.columns });
    else if (patch.tasks !== undefined) AS_invoke('update_tasks', { tasks: patch.tasks });
  }, []);

  return { board: { ...EMPTY_BOARD, ...board }, loaded, update };
}

function AS_invoke(name, payload) {
  window.AgentSpaces?.invokeService?.(name, payload).catch((e) => {
    console.error('[kanban] service failed:', name, e);
  });
}

// 便捷 action 工厂（供 board 组件调用）
// 单条增删改走原子 service（create_column/update_card 等），
// 拖拽重排、模板应用等批量场景仍用整组覆盖 update_columns/update_tasks。
export function createBoardActions(board, update) {
  return {
    updateLayout: (layoutMode) => update({ layoutMode }),
    addColumn: (title, color) => AS_invoke('create_column', { title, color }),
    editColumn: (colId, title, color) => AS_invoke('rename_column', { id: colId, title, color }),
    deleteColumn: (colId, force = false) => AS_invoke('delete_column', { id: colId, force }).catch((e) => {
      // 非空列拒绝：前端默认沿用"连同卡片一起删"的原行为，传 force 兜底
      if (String(e.message || e).includes('非空')) return AS_invoke('delete_column', { id: colId, force: true });
      console.error('[kanban] delete_column failed:', e);
    }),
    reorderColumns: (columns) => update({ columns: columns.map((c, i) => ({ ...c, order: i })) }),
    setTasks: (tasks) => update({ tasks }),
    saveTask: (task) => {
      const exists = board.tasks.some((tk) => tk.id === task.id);
      if (exists) {
        AS_invoke('update_card', {
          id: task.id, title: task.title, description: task.description,
          priority: task.priority, columnId: task.columnId, dueDate: task.dueDate,
        });
      } else {
        AS_invoke('create_card', {
          title: task.title, columnId: task.columnId, description: task.description,
          priority: task.priority, dueDate: task.dueDate,
        });
      }
    },
    deleteTask: (taskId) => AS_invoke('delete_card', { id: taskId }),
  };
}
