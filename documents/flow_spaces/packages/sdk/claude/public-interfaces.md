# SDK 暴露的公共接口

## createSDK() 工厂函数

SDK 的唯一入口。接收 `SDKConfig` 配置，返回 `SDK` 实例。

### SDKConfig

| 属性 | 类型 | 必需 | 说明 |
|------|------|------|------|
| baseUrl | `string` | 是 | 服务器基础 URL，如 `http://localhost:3100` |
| getToken | `() => string \| null` | 是 | Token 获取函数（延迟求值，每次请求时调用） |
| onUnauthorized | `() => void` | 否 | 401/403 时的回调（通常跳转登录页） |
| debug | `boolean` | 否 | 是否启用调试日志，默认 false |

### SDK 接口方法

| 方法 | 签名 | 说明 |
|------|------|------|
| setDebug | `(enabled: boolean) => void` | 运行时切换调试日志 |
| updateConfig | `(patch: Partial<SDKConfig>) => void` | 更新配置（如切换服务器） |
| http | `HttpClient` | 底层 HTTP 客户端实例 |

## API 模块方法一览

### workspace（16 方法）

| 方法 | HTTP | 路径 | 说明 |
|------|------|------|------|
| list | GET | `/api/workspaces` | 列出所有工作空间 |
| get | GET | `/api/workspaces/:id` | 获取单个工作空间 |
| create | POST | `/api/workspaces` | 创建工作空间 |
| update | PUT | `/api/workspaces/:id` | 更新工作空间 |
| delete | DELETE | `/api/workspaces/:id` | 删除工作空间 |
| getNotificationSettings | GET | `/api/workspaces/:id/notification-settings` | 获取通知配置 |
| updateNotificationSettings | PUT | `/api/workspaces/:id/notification-settings` | 更新通知配置 |
| getPrompt | GET | `/api/workspaces/:id/prompt` | 获取 Prompt |
| updatePrompt | PUT | `/api/workspaces/:id/prompt` | 更新 Prompt |
| browseFolder | GET | `/api/folder/browse` | 浏览文件夹 |
| cloneSse | SSE | `/api/workspaces/clone` | Git Clone（SSE） |
| reveal | POST | `/api/workspaces/:id/reveal` | 在文件管理器中显示 |
| checkPermissions | GET | `/api/folder/check-permissions` | 检查文件夹权限 |
| createFolder | POST | `/api/folder/create` | 创建文件夹 |
| readFile | GET | `/api/folder/read-file` | 读取文件内容 |
| startNotifications | POST | `/api/workspaces/:id/notifications/start` | 启动通知 |
| stopNotifications | POST | `/api/workspaces/:id/notifications/stop` | 停止通知 |
| testNotification | POST | `/api/workspaces/:id/notifications/test` | 发送测试通知 |

### agent（11 方法）

| 方法 | HTTP | 路径 | 说明 |
|------|------|------|------|
| listPresets | GET | `/api/agents/presets` | 列出预设 |
| getPreset | GET | `/api/agents/presets/:id` | 获取预设 |
| createPreset | POST | `/api/agents/presets` | 创建预设 |
| updatePreset | PUT | `/api/agents/presets/:id` | 更新预设 |
| deletePreset | DELETE | `/api/agents/presets/:id` | 删除预设 |
| usageDashboard | GET | `/api/agents/usage/dashboard` | 用量仪表盘 |
| sessionDetail | GET | `/api/agents/sessions/:agentSessionId/detail` | 会话详情下钻（消息时间线 + 用量 + 来源） |
| design | POST | `/api/agents/design` | AI 生成 Agent 配置 |
| optimizePrompt | POST | `/api/agents/presets/optimize-prompt` | 优化 Prompt |
| testConnection | POST | `/api/agents/presets/test-connection` | 测试连接 |
| generateFromPrompt | POST | `/api/agents/presets/generate` | 从 Prompt 生成配置 |
| syncWorkspaces | POST | `/api/agents/presets/sync-workspaces` | 同步到工作空间 |

### channel（10 方法）

| 方法 | HTTP | 路径 | 说明 |
|------|------|------|------|
| list | GET | `/api/workspaces/:wsId/channels` | 列出频道 |
| create | POST | `/api/workspaces/:wsId/channels` | 创建频道 |
| get | GET | `/api/workspaces/:wsId/channels/:chId` | 获取频道 |
| update | PUT | `/api/workspaces/:wsId/channels/:chId` | 更新频道 |
| delete_ | DELETE | `/api/workspaces/:wsId/channels/:chId` | 删除频道 |
| getMessages | GET | `.../messages` | 获取消息 |
| getState | GET | `.../state` | 获取频道状态 |
| clearMessages | DELETE | `.../messages` | 清除消息 |
| uploadAttachment | UPLOAD | `.../upload` | 上传附件 |
| deleteMessage | DELETE | `.../messages/:msgId` | 删除消息 |
| getToolDetail | GET | `.../tool-details/:toolName` | 获取工具调用详情 |

### issue（11 方法）

| 方法 | 说明 |
|------|------|
| list / create / get / update / delete_ | CRUD |
| start / resume / continue / interrupt | 生命周期操作 |
| listComments / addComment / deleteComment / updateComment | 评论管理 |

### task（8 方法）

| 方法 | 说明 |
|------|------|
| list / create / get / update / delete_ | CRUD |
| retry / cancel | 重试与取消 |
| reorder | 排序 |

### git（26 方法）

| 方法 | 说明 |
|------|------|
| status / diff / log / branches | 状态查询 |
| init / commit / push / pull / fetch | 基本操作 |
| stage / unstage / discard / discardAll | 暂存区 |
| checkout / checkoutDetached / createBranch / deleteBranch | 分支 |
| remotes / addRemote / remoteUrl | 远程仓库 |
| cherryPick / createTag / reset / mergeBase | 高级操作 |
| resolveFile | 冲突解决 |
| operations | 操作历史 |
| generateCommitMessage | AI 生成提交信息 |
| config / updateConfig | Git 配置 |

### editor（13 方法）

| 方法 | 说明 |
|------|------|
| tree / content / save | 文件操作 |
| editorState / saveEditorState | 状态持久化 |
| search | 代码搜索 |
| exists / reveal / copy / deleteFile / rename | 文件管理 |
| importUrl / importPath / uploadFiles | 导入 |

### llm（8 方法）

| 方法 | 说明 |
|------|------|
| listModels / createModel / updateModel / deleteModel | 模型 CRUD |
| listProviders / createProvider / updateProvider / deleteProvider | 供应商 CRUD |

### workflow（18 方法）

| 方法 | 说明 |
|------|------|
| list / get / create / update / delete_ / duplicate | CRUD + 复制 |
| execute | SSE 流式执行 |
| listFolders / createFolder / updateFolder / deleteFolder | 文件夹 |
| listVersions / addVersion / getVersion / deleteVersion / clearVersions | 版本 |
| listAllExecutionLogs / listExecutionLogs / getExecutionLog / getExecutionLogPath / deleteExecutionLog / clearExecutionLogs | 执行日志 |
| loadOperationHistory / saveOperationHistory / clearOperationHistory | 操作历史 |
| loadStaging / saveStaging / clearStaging | 暂存区 |
| loadChat / saveChat / clearChat | Agent 聊天 |

### workflow-plugin（12 方法）

| 方法 | 说明 |
|------|------|
| listAll / listWorkflow | 列表 |
| enable / disable / uninstall | 状态管理 |
| installFromStore | 从商店安装 |
| getWorkflowNodes | 获取节点定义 |
| getConfig / saveConfig | 配置 |
| listSchemes / createScheme / readScheme / saveScheme / deleteScheme | 方案管理 |

### mini-app（13 方法）

| 方法 | 说明 |
|------|------|
| list / get / create / update / delete_ | 项目 CRUD |
| getFileTree / readFile / writeFile | 文件操作 |
| readConfig / writeConfig / writeDataFile | 配置与数据 |
| importZip / exportZip | 导入导出 |
| uploadAvatar / getAvatarUrl | 头像 |

### chat（17 方法）

| 方法 | 说明 |
|------|------|
| listAgents / createAgent / updateAgent / deleteAgent | Agent CRUD |
| listMessages / clearMessages | 消息管理 |
| workspaceTree / workspaceFileContent | 工作目录 |
| listWorkspaces / createWorkspace / updateWorkspace / deleteWorkspace | Workspace CRUD |
| listSessions / createSession / renameSession / updateSession / deleteSession | Session CRUD |
| listSessionMessages / clearSessionMessages | Session 消息 |
| getWorkspaceState / saveWorkspaceState | 状态持久化 |

### 其他模块

以下模块提供标准 CRUD 或简单操作：

- **kanban**（2 方法）：get / save
- **database**（14 方法）：数据库 CRUD + 节点管理 + 向量搜索 + AI 聊天
- **worktree**（5 方法）：列表/创建/删除/PR/合并/Diff
- **hooks**（6 方法）：CRUD + 上传 + 应用
- **command**（6 方法）：CRUD + 启动/停止
- **subscription**（5 方法）：CRUD + 配额
- **notification**（3 方法）：列表/标记已读/清除
- **speech**（4 方法）：CRUD
- **code-favorites**（3 方法）：列表/创建/删除
- **prompts**（6 方法）：CRUD + Agent 列表 + 应用
- **skills**（12 方法）：列表/保存/删除 + 导入 + 同步 + 文件管理
- **mcps**（5 方法）：列表/保存/删除 + 收藏 + 导入
- **npm-settings**（2 方法）：获取/更新
- **output-styles**（6 方法）：CRUD + Agent 列表 + 应用
- **tools**（2 方法）：列表/更新
- **robot-accounts**（6 方法）：CRUD + 微信二维码登录
- **auth**（4 方法）：登录/验证/头像/修改密钥
- **data**（6 方法）：导入导出 + cc-switch 迁移
- **version**（3 方法）：当前版本/检查更新/触发更新
- **search**（2 方法）：代码搜索/文件搜索
- **agent-store**（1 方法）：获取在线索引
- **font**（4 方法）：列表/上传/删除/Base64上传
- **inspector**（1 方法）：跟踪
- **avatar**（2 方法）：获取/上传
- **agent-commands**（7 方法）：列表/CRUD + 应用
