// 节点数据由前端经 window.AgentSpaces.db('notion-database') 直接读写（前端运行）。
// service 仅负责在写操作后广播 miniApp.nodeChanged 事件，通知其他客户端刷新。
export default {
  node_changed: (input, ctx) => {
    ctx.broadcast('miniApp.nodeChanged', input || {});
    return { ok: true };
  },
};
