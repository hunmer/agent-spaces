# Findings

- `MiniAppPreview` 当前用 `chatDockOpen` 控制宿主外层 `ResizablePanel`，其中渲染 `MiniAppAgentDock`。
- React mini-app 由同页面内独立 React Root 渲染，不是 iframe，因此宿主可以用 React Portal 挂载到 mini-app 提供的 DOM 节点。
- `RightPanel` 是受控 Tabs，`Canvas.jsx` 持有 `rightTab`，适合通过 Host Slot 激活事件切换到 `chat`。
- `MiniAppProject` 字段是显式持久化/传递，新增 manifest 配置必须补服务端类型、导入和预览 props。
- Host Slot 注册表按 `projectId:name` 隔离，支持元素订阅、激活状态双向同步和卸载清理。
- 特殊模式中，Chat tab 的直接点击和宿主工具栏按钮都会同步 `chatDockOpen`；关闭 Chat 会恢复进入 Chat 前的 tab。

## Session tools 优化

- Session 共 4 条消息、55 次工具调用；两轮 Agent 回复分别调用 14 次和 41 次工具。
- 第二轮任务为基于已有 8 个角色三视图创建 8 个表情九宫格节点，日志显示 `add_node` 被逐个调用 8 次，存在明显批量效率优化空间。
- 最终画布为 16 个节点、8 条边、2 个分组；需继续检查分组成员、节点位置与工具返回值是否一致。
- 工具调用分布：`add_node` 19、`delete_node` 11、`WriteWorkspaceFile` 10、`update_nodes` 2、`add_nodes` 1；批量任务产生大量补偿调用。
- 日志中 `add_nodes` / `update_nodes` 的 `data` 实际形态为 `{ "$text": "{\"params\":...}" }`，而非 `{params:{...}}`；工具仍返回 `ok:true`，形成“假成功”。
- 分组重建阶段连续对单节点调用相同 `groupLayout`，最终 6 个节点落在完全相同位置 `(120,1162)`，说明单节点增量布局未正确考虑已在组内的节点。
- 最终分组包含已删除的 `editImage-mscr5b4l-11`，说明 `delete_node` 清理了节点和边，但没有同步清理 group.nodeIds。
- `useCanvasAgentRpc` 每次请求从 `ctxRef.current` 读取 React 最近一次渲染快照；并发 `add_node` 请求会共享旧的 `curNodes/curGroups`。
- `canvas.addNode` 先用函数式 `ensureGroupByName` 更新 group，随后却用旧 `curGroups` 调 `arrangeGroupAfterAdd`，因此并发调用布局时看不到同轮新增成员。
- `canvas.deleteNode` 只调用 `deleteFn(nodeId)`，没有调用 `setGroups` 移除 `childNodeIds`，与日志中的幽灵成员完全一致。
- `add_node` 的自动位置先基于旧 `curNodes` 计算，再把显式 position 传给 `createNodeAt`，绕过了后者原本用于连续新增防重叠的自动位置逻辑。
- 仓库内没有 `$text` 的业务处理代码，说明它是工具 schema/参数转换产生的兼容包装；API 必须显式解包，同时工具 schema 应声明 `params/text/output` 等常用结构。
- 当前 mini-app 无独立 package.json，已有纯 JS 测试使用 Node 内置 `node:test`，适合为数据解包和分组成员纯函数补回归测试。
- 已实现 `parseNodeData`：兼容 session 中的 `{ $text: "JSON" }`，非法 JSON 明确返回 `ok:false`，普通结构化 data 原样保留。
- 已实现纯函数分组成员累加/删除，并在 RPC 每次变更后立即更新 `ctxRef` 快照，避免同一渲染周期内并发请求读取旧状态。
- 批量创建改为先计算完整 additions 与位置，再同步写入 RPC 节点快照；新增 5 项回归测试，连同 5 项布局测试共 10 项通过。
- API 集成测试已直接重放 session 的 `$text` 输入，确认 `add_nodes` 下发给 RPC 的是结构化 `data.params`；非法 `$text` 不会发 RPC。
- 当前针对性测试共 12 项全部通过。
- Mini-app agent 注册逻辑原样使用 `src/tools.js` 的 `inputSchema`；仓库已有工具广泛使用 `additionalProperties`，新增 schema 字段符合现有运行时约定。
- 重要运行时约束：`compileApiJs` 会剥离 `api.js` 的所有 import 后用 `new Function` 加载，因此 API 入口不能依赖新增模块 import；数据解析函数必须内置在 `api.js`。
- 已从正式 server dist 调用真实 `compileApiJs/compileToolsJs`：成功加载 24 个 tools、24 个 API handler，`$text` 重放后 RPC 收到结构化 params。
- 最终回归新增“8 个增量归组节点 → 4×2 网格 → 8 个唯一位置”场景；最终目标测试 10 项全部通过。
