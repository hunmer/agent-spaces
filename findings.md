# Findings

- 父日志与子日志都稳定包含首个错误 `Loop node missing body`；子日志快照实际存在对应 `loop_body` 节点和 loop-body 边。
- 后续 `Workflow variable reference missing node output` 是循环节点无输出的连锁错误。
- `缺少 secretId 或 secretKey` 是独立插件配置错误，不是循环 body 丢失的原因。
- `executeSubWorkflow` 把目标节点/边传给 `executeEmbeddedWorkflow`，但 `executeLoopNode` 从父 `session.nodes` 查找 body，存在明显作用域错配。
- 待验证：复合元数据兼容性、runtime edge 过滤是否构成第二层问题。
- 实际子工作流 `workflow.json` 的 loop/body 含完整 `parentId/rootId/role`，排除元数据缺失。
- loop-body 锁定边是非 reference 边，会进入 runtime edge，暂排除边过滤问题。
- 根因确认：节点遍历使用局部子工作流图，但 `executeNode` 内部的输入/引用边绑定、循环 body 查找和分支判断仍读取父 `session.nodes/session.edges`。
- 子工作流插件配置也只按父 `session.workflow/session.nodes` 加载，导致目标工作流启用的 COS 配置在子执行中为空。
- 修复采用异步执行图作用域，携带当前 nodes、edges、config；避免并行或嵌套子工作流通过临时修改父 session 相互污染。
- 用户认为父调用未向子 start 传入数据；日志中 loop 的 `arrayPath` 已解析为父输入数组，说明 start 执行数据实际存在。回归测试已改为显式覆盖父输入 → 子 start → loop 引用链。
- 修改后的真实 handoff 测试通过：嵌入输入写入子 start，loop 可读取并完成两次迭代。未生成 start 步骤日志是现有嵌入执行设计，不代表数据缺失。
