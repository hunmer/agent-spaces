## Files To Read Next

- `packages/shared/src/types/workflow.ts`
  - definition 字段能力边界
- `packages/shared/src/types/workflow-node-factory.ts`
  - composite node 创建逻辑
- `packages/web/src/lib/workflow-nodes/registry.ts`
  - definition 注册入口
- `packages/web/src/components/workflow/use-workflow-node-operations.ts`
  - 节点创建真实入口
- `packages/web/src/components/workflow/workflow-node.tsx`
  - 节点渲染入口
- `packages/web/src/components/workflow/workflow-properties-panel.tsx`
  - 通用属性面板
- `packages/server/src/services/execution-manager.ts`
  - 执行分派入口
- `packages/server/src/services/plugin.ts`
  - 插件节点接入

## Common Failure Modes

- 只加 definition，忘了 server dispatch  
  - 结果：`Unsupported node type`
- 只加 server 执行，忘了 definition  
  - 结果：编辑器不可见
- 输出结构与 `outputs` 不一致  
  - 结果：变量引用和执行预览混乱
- 复合节点没处理 generated edges / scope  
  - 结果：创建、删除或执行异常
- 客户端节点当后台节点用  
  - 结果：无连接时直接失败