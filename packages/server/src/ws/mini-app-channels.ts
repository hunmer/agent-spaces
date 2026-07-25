// WS channels for mini-app task control.
//
// agent_run 工具的 execute 内部把 runtime 句柄注册到 mini-app-tasks registry（key=taskId）。
// 这里接收前端的 miniApp.taskStop 事件，凭 taskId 调 runtime.stop() 真正中断 agent 执行。
// 与 routes/plugin.ts 的 req.on('close') 兜底停止互补：前者是用户主动停止，后者是客户端断开。

import { registerHandler } from './handler.js';
import { stopTask } from '../services/mini-app-tasks.js';

export function registerMiniAppChannels(): void {
  registerHandler('miniApp.taskStop', (ws, _workspaceId, data) => {
    const { taskId } = (data || {}) as { taskId?: string };
    if (!taskId) {
      ws.send(JSON.stringify({ event: 'miniApp.taskStop:error', data: { error: 'taskId is required' } }));
      return;
    }
    try {
      const stopped = stopTask(taskId);
      ws.send(JSON.stringify({ event: 'miniApp.taskStop:result', data: { taskId, stopped } }));
    } catch (err: any) {
      ws.send(JSON.stringify({ event: 'miniApp.taskStop:error', data: { error: err?.message || String(err) } }));
    }
  });
}
