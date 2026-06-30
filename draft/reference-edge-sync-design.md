# reference 边同步回编辑器数据方案

## 1. 背景

当前 workflow 里有两套“引用关系”表达：

1. 画布上的 `reference` 边
2. 节点 `data` / `inputFields` 里的 `{{ __data__["nodeId"].field }}` 模板

现在服务端执行期已经补了兜底：如果存在 `reference` 边，会在执行前临时把它注入到目标节点参数里。

但编辑器数据本身没有被同步更新，导致几个问题：

- 画布看起来已经连线，但节点配置文本里可能还是空的
- 导出 / 调试 / 二次编辑时，用户很难直接看出实际入参
- 前端状态、持久化数据、运行时行为三者不一致
- 后续再做校验、重构、批量编辑时容易出现隐式依赖

## 2. 目标

把 `reference` 边同步回编辑器数据，保证：

- 线和数据表达一致
- 保存后的 workflow JSON 自解释
- 不依赖执行期兜底也能看懂和复现参数来源
- 后续校验逻辑优先基于持久化数据工作

## 3. 非目标

这次不处理：

- `runtime` 边改造
- 所有节点类型的复杂富文本拼接 UI
- 自动消除重复文案或重写用户已有 prompt

## 4. 推荐方案

采用“前端编辑时同步，服务端保存时兜底规范化”的双层方案。

### 4.1 前端主同步

当用户新增、修改、删除 `reference` 边时，前端立即更新目标节点数据：

- `targetHandle = property:xxx`
  把引用模板写入 `node.data.xxx`
- `targetHandle = input:xxx`
  把引用模板写入 `node.data.inputFields[].value`

模板规则：

- `sourceHandle = output:result` -> `{{ __data__["sourceNodeId"].result }}`
- `sourceHandle = output:data.images` -> `{{ __data__["sourceNodeId"].data.images }}`
- `sourceHandle = input:foo` -> `{{ __inputs__["sourceNodeId"].foo }}`

写入策略：

- 目标值为空：直接写入模板
- 目标值非空且不含该模板：按换行追加
- 已含该模板：不重复写入

### 4.2 服务端保存兜底

在 `createWorkflow/updateWorkflow` 或 workflow-editor 保存入口增加一次规范化：

- 扫描所有 `reference` 边
- 补齐前端未同步成功的模板
- 去重重复模板

这样即使未来有旧客户端或异常数据，也不会再落下“有线无值”的状态。

## 5. 数据流建议

### 新增 reference 边

1. 用户在画布上连线
2. 前端根据 `sourceHandle/targetHandle` 生成模板
3. 更新目标节点 `data`
4. 再写入 edge
5. 保存 workflow

### 删除 reference 边

1. 删除 edge
2. 前端从目标字段中移除对应模板
3. 如果字段只剩空白，收敛为空字符串

### 修改 reference 边

1. 先按“删除旧边”移除旧模板
2. 再按“新增新边”写入新模板

## 6. 冲突处理

需要明确三条规则：

1. 用户手写文本和模板共存时，不覆盖用户原文，只追加模板。
2. 多条 `reference` 边指向同一 `property:prompt` 时，允许多模板并存，按边创建顺序追加。
3. 如果目标字段不是字符串，不自动写入，直接给出编辑器提示或阻止连线。

## 7. 推荐落地点

前端：

- workflow 画布连线创建逻辑
- edge 删除逻辑
- 节点表单状态更新逻辑

服务端：

- `packages/server/src/services/workflow.ts`
- 如有独立 workflow-editor 保存工具，也可在保存前先规范化一次

共享能力建议抽成一个纯函数：

- 输入：`nodes + edges`
- 输出：同步后的 `nodes`

这样前后端都能复用同一套规则。

## 8. 纯函数建议

建议增加类似函数：

```ts
syncReferenceEdgesToNodeData(nodes, edges): WorkflowNode[]
```

职责：

- 解析 `reference` 边
- 定位目标 property / input field
- 生成模板
- 追加或移除模板
- 保持幂等

要求：

- 同样输入执行多次，输出不再变化
- 不修改传入对象，返回新对象

## 9. 测试建议

至少覆盖：

1. 新增 `property:message` 引用边后，节点 `data.message` 自动写入模板
2. 新增 `input:agentResult` 引用边后，`inputFields[].value` 自动写入模板
3. 重复创建同一条边，不重复追加模板
4. 删除边后，对应模板被移除
5. 一个字段绑定多个上游时，模板顺序稳定
6. 旧 workflow 只有边没有模板时，保存后被自动补齐

## 10. 分阶段落地

第一阶段：

- 先做前端新增边同步
- 服务端保存时补齐

第二阶段：

- 做删除边时的模板移除
- 增加编辑器提示和去重

第三阶段：

- 抽共享纯函数
- 前后端统一规则

## 11. 最小实现建议

如果只做最小改动，优先级如下：

1. 保存前服务端补齐模板
2. 前端新增边时同步模板
3. 前端删除边时移除模板

原因：

- 第 1 步先保证数据最终一致
- 第 2 步解决编辑体验和可见性
- 第 3 步再补完整闭环

