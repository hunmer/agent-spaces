# 工作流

Workflow 是 Agent Spaces 的核心编排机制。通过可视化 DAG 编辑器（基于 @xyflow/react），拖拽节点、连线定义执行依赖，灵活编排 Agent 与各类操作。

## 什么是 Workflow？

Workflow 是一个有向无环图（DAG）模板，定义节点间的执行顺序和依赖关系。每个节点可以是 Agent 执行单元、流程控制、AI、展示、交互、字符串处理或 SQL 数据库节点。

## 创建 Workflow 模板

1. 进入左侧导航的「Workflows」
2. 点击「创建 Workflow」进入 DAG 编辑器
3. 从左侧节点面板拖入节点
4. 连线定义执行依赖（@dagrejs/dagre 自动布局）
5. 设置名称和描述，保存

## 节点分类

| 分类 | 节点示例 |
|------|----------|
| **流程控制** | `start` / `end` / `switch` / `loop`+`loop_body`（复合节点）/ `variable_aggregate` / `set/get/delete_variable` / `run_code`(JS) / `run_python` |
| **AI** | `agent_run`（绑定 Agent 预设，含权限模式 default/dontAsk/acceptEdits/plan/auto/bypassPermissions） |
| **人机交互** | `alert` / `prompt` / `form`（服务端阻塞等待前端回应） |
| **展示** | `gallery_preview` / `music_player` / `table_display` / `code_render`(React/HTML) / `markdown` / `sticky_note` |
| **SQLite 数据库** | `sqlite_query` / `insert` / `update` / `delete` / `raw`（SQL 安全校验） |
| **知识库** | `kb_add` / `kb_query`（向量检索）/ `kb_delete` |
| **工具与字符串** | `flatten_array` / `pluck_array_key` / `merge_arrays` / `parse_json` / `string_concat` / `string_split` |
| **Mini App** | `show_miniapp`（WS 双向通信，阻塞等待用户提交数据） |
| **插件节点** | 插件动态注册的自定义节点（服务端 / 客户端 / 双端执行） |

## 复合节点与子流程

- **Loop 复合节点** — `loop` + `loop_body` 组成，支持 `count` / `array` / `infinite` 三种 loopType，可并发执行 + 跨迭代共享变量
- **嵌套子流程** — `sub_workflow` 节点执行另一个完整 workflow（禁止自调用）

## 触发方式

| 触发方式 | 说明 |
|---|---|
| WebSocket 实时 | 前端编辑器默认入口 |
| HTTP API（SSE） | `POST /api/workflows/:id/execute`，流式回传 |
| cron 定时 | cron 表达式 + timezone，node-cron 调度 |
| Webhook / Hook | `POST /api/workflow-hook/hook/:hookName`，SSE 回传 |
| Issue 自动编排 | Issue 绑定 `workflowId`，由 executionManager 驱动 |
| Agent 工具调用 | Agent 运行时通过工具调用工作流 |

## 执行形态

- WebSocket 事件流（逐节点 start/progress/complete/error 推送）
- HTTP SSE 流式响应
- 客户端交互响应（alert/prompt/form/show_miniapp）
- 断线快照恢复（断线后可恢复执行状态）
- 双向控制（pause / resume / stop / debug-node 走 WS）
- 容错模式 `faultTolerance: 'ignore' | 'stop'`

## DAG 校验

保存时自动校验：至少一个节点、无环路、无重复边、无自环、边引用有效、Agent 节点绑定的预设存在。

## Issue 与 Workflow

创建 Issue 时选择 Workflow 模板，启动自动化后：

1. 加载 Workflow 模板
2. Agent 节点映射为 Task
3. 节点入边作为 Task 依赖
4. 按依赖调度（所有前置 done 才启动）
5. 全部完成 → Issue 标记 completed

Agent 节点执行享有 Task 失败重试机制（`retryCount` / `maxRetries`）。
