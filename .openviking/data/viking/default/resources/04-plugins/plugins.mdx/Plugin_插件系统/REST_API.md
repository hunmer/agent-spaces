## 配置

插件可在 `info.json` 的 `config` 字段声明一组配置项（类型 `PluginConfigField`，定义于 `packages/shared/src/types/workflow-plugin.ts:11`）：

```json
"config": [
  {
    "key": "defaultTimeout",
    "label": "默认超时(ms)",
    "desc": "请求的默认超时时间",
    "type": "number",
    "value": "30000"
  },
  {
    "key": "userAgent",
    "label": "User-Agent",
    "type": "string",
    "value": "workflow/1.0"
  }
]
```

支持类型：`string` / `number` / `boolean` / `select`（带 `options`）/ `object`。配置值持久化在 `~/.agent-spaces-data/plugins/state.json` 的 `config[pluginId]` 字典中，`getPluginConfig` 会把清单默认值与用户值合并后返回。`select` 类型的 `options` 形如 `[{ label, value }]`。

凭据（如 OSS AccessKey、COS SecretId、API Key）应通过 config 注入，**Workflow UI 表单不要收集或传递凭据**——`callPluginTool` 在执行时会自动合并 config，preview 代码应省略凭据参数。

### 工作流级配置方案（Plugin Schemes）

除插件全局配置外，SDK 还提供「按 Workflow 隔离的插件配置方案」（`Plugin Scheme`，`packages/sdk/src/modules/workflow-plugin.ts:35`）：

- `listSchemes(workflowId, pluginId)`
- `createScheme(workflowId, pluginId, schemeName)`
- `readScheme(workflowId, pluginId, schemeName)`
- `saveScheme(workflowId, pluginId, schemeName, data)`
- `deleteScheme(workflowId, pluginId, schemeName)`

对应后端路由 `GET/POST/PUT/DELETE /api/workflows/:workflowId/plugin-schemes/:pluginId/:schemeName`，用于在同一插件下为不同 Workflow 维护不同的参数预设。

## REST API

Plugin 路由统一挂载在 `/api/plugins`（`packages/server/src/app.ts:249`），均需 Bearer Token 鉴权：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/plugins` | 列出所有插件（支持 `?locale=` 本地化） |
| `GET` | `/api/plugins/workflow` | 仅列出 `hasWorkflow` 的插件 |
| `GET` | `/api/plugins/:pluginId/icon` | 返回插件图标文件 |
| `GET` | `/api/plugins/:pluginId/config` | 读取插件配置 |
| `PUT` | `/api/plugins/:pluginId/config` | 保存插件配置 |
| `GET` | `/api/plugins/:pluginId/tools` | 列出插件暴露的 Agent 工具 |
| `POST` | `/api/plugins/:pluginId/tools/execute` | 执行具名工具（参数 `name` / `args` / `workspaceId` / `executorId` / `taskId` / `meta`） |
| `GET` | `/api/plugins/:pluginId/workflow-nodes` | 列出插件提供的 Workflow 节点定义 |
| `POST` | `/api/plugins/:pluginId/enable` | 启用插件 |
| `POST` | `/api/plugins/:pluginId/disable` | 禁用插件 |
| `DELETE` | `/api/plugins/:pluginId` | 卸载插件（删除目录并清理 state.json） |
| `POST` | `/api/plugins/store/:pluginId/install` | 从商店或远程 URL 安装插件（body 含 `sourceUrl` / `md5`） |

前端统一通过 `sdk.workflowPlugin.*`（`packages/sdk/src/modules/workflow-plugin.ts`）调用。

### 工具执行的任务编排

`POST /api/plugins/:pluginId/tools/execute` 支持可选的任务编排：当请求体带 `workspaceId`（即 projectId）时，后端会通过 `mini-app-tasks` 服务生成 `taskId`，并通过 WebSocket 广播任务生命周期事件（`plugin.ts:134-179`）：

- `miniApp.taskStarted` — 任务开始（携带 `taskId` / `executorId` / `pluginId` / `toolName` / `meta`）
- `miniApp.taskFinished` — 任务完成（额外携带 `result`）
- `miniApp.taskFailed` — 任务失败（额外携带 `error`）

任务状态缓存在进程内（projectId 维度，TTL 10 分钟清理终态），客户端可通过 `miniApp.taskSnapshot` 拉取当前快照。不带 `workspaceId` 的调用不触发编排，向后兼容普通一次性执行。

> 注意：插件本身没有专属的 `plugin.*` WebSocket 事件域——所有与插件工具执行相关的实时通知都复用 `miniApp.*` 命名空间。