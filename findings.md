# Findings

## 组输出自动绑定（2026-08-03）

- 用户要求参考 `packages/web/src/components/workflow/workflow-group-node.tsx:394-405`，在 `GroupExecutionToolbar` 最右侧增加组连线入口。
- 目标组需持久化过滤规则，支持全部、指定节点、按节点类型多选。
- 连线后的自动绑定只读取来源组节点当前输出，并用于目标组“按上传素材执行”，不读取生成历史。

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

## 批量连线显示问题

- `connect_batch` 返回 created=8/invalid=0，但用户观察到仅一个目标节点显示 Handle edge；图生图参考图已显示，说明输入派生链路至少读取到了连接关系。
- 验收数据：workspace `ws-ms7oxb6j-uar4` 的 `canvas.json`，8 条期望边为 `node-mscmg3ya-{1..8}` → `node-mscusvbg-{1..8}`。
- 指定 `canvas.json` 实际包含 16 节点、8 条边，source/target 与 inputType/inputTarget 全部正确，但所有 edge 都缺少 `id`。
- ReactFlow 以 `edge.id` 标识渲染元素；8 条边的 id 全是 undefined 会发生渲染键冲突，因此数据派生仍能读取全部边，UI Handle 连线却只稳定显示一条。
- 手动连线路径使用 ReactFlow `addEdge`，会自动补 edge.id；`prepareBatchEdges` 直接 push 裸 edge 对象，没有 id，导致仅批量工具路径出错。
- `useCanvasState` 初次加载和远端同步都直接 `setEdges(state.edges || [])`，现有持久化数据没有迁移机会。
- 修复策略：统一纯函数 `ensureEdgeIds`，保留合法唯一旧 ID，为缺失/重复 ID 生成稳定 ID；批量建边与画布加载共同使用，并在发现迁移时回写 canvas.json。
- 2026-08-03 续作复核：规划文件与交接结论一致，Phase 9 仍在进行，后续直接实施统一 edge ID 规范化和旧数据迁移。
- 当前工作区已有 manifest、panel-layout、mini-app 索引和旧规划文件删除等无关改动，修复时不触碰、不回退。
- `useCanvasState` 的初次加载与远端同步均直接保存原始 state 到 `lastSavedRef` 并设置原始 edges；迁移需先构造规范化 state，再写入 ref/state，才能避免同步签名循环。
- 复核发现批量新边生成 ID 时还需把现有 edges 纳入保留集合，避免与既有自定义 ID 冲突。
- 远端同步若 `dirtyRef.current` 为真，不应为远端旧数据执行迁移回写，否则可能覆盖本地未保存状态；迁移保存必须置于 dirty 判断之后（保存回声例外可直接忽略）。
- 新增 edge 工具及既有工具回归共 9 项通过，`git diff --check` 通过。
- 使用用户指定 `canvas.json` 实测规范化：8 条 edges 得到 8 个唯一 ID，缺失 ID 为 0；生成结果与 8 组 source/target 一一对应。
- 根目录已安装 `@babel/core` 与 `@babel/preset-react`，可直接对两个受影响 hook 做无输出编译检查。
- 加载迁移流程先设置规范化 `lastSavedRef`，再异步 `saveCanvas`；保存回声的同步签名会被现有判断拦截，不产生回环。
- 两个受影响 hook 均通过 Babel 编译；现有开发服务 3000 端口健康检查为 200。
- 当前可用工具中没有 `procm-mcp`，无法按项目约定重启持久化服务；开发服务可由热更新或页面刷新载入改动。
