// 返回当前正在进行的任务（含 executorId）。
// 客户端拿到后，用返回项的 executorId 与自身 window.AgentSpaces.getExecutorId() 匹配，
// 只显示自己发起的队列项（历史结果仍全员共享，走 configChanged）。
export default {
  get_queue: (_payload, ctx) => ctx.listRunningTasks(),
};
