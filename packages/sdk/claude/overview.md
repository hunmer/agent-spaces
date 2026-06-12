# SDK 架构总览

## 定位

`@agent-spaces/sdk` 是 Agent Spaces 平台的前端 API 统一调用层。它将所有后端 REST API 封装为类型安全的 TypeScript 函数，按业务域拆分为 39 个独立模块适配器。web 包通过单例消费 SDK，组件只需 `sdk.xxx.method()` 即可完成 API 调用。

## 设计目标

- **类型安全**：所有方法和返回值完整类型化，类型从 `@agent-spaces/shared` 导入
- **统一认证**：HttpClient 自动注入 Bearer Token，401/403 触发回调
- **可调试**：`setDebug(true)` 输出带颜色标记的请求/响应日志
- **运行时可切换**：支持运行时切换服务器地址（通过 `updateConfig`）
- **零业务逻辑**：SDK 层不做任何业务逻辑判断，纯粹做 HTTP 请求映射

## 架构模式

SDK 采用**模块工厂模式**：

1. `createSDK(config)` 创建 `HttpClient` 实例
2. 39 个 `createXxxApi(http)` 工厂函数各自返回一个 API 适配器对象
3. 所有适配器对象挂载到统一的 `SDK` 接口上

```
createSDK(config)
  └── HttpClient (baseUrl + token + onUnauthorized)
        ├── workspace       # 工作空间管理
        ├── agent           # Agent 预设管理
        ├── channel         # 频道聊天
        ├── issue           # Issue 管理
        ├── task            # Task 管理
        ├── git             # Git 操作
        ├── editor          # 文件编辑器
        ├── llm             # LLM 模型/供应商管理
        ├── workflow        # Workflow CRUD + 执行
        ├── workflowPlugin  # Workflow 插件
        ├── miniApp      # Workflow UI 项目
        ├── kanban          # 看板
        ├── database        # 文档数据库
        ├── worktree        # Git Worktree
        ├── hooks           # Hook 管理
        ├── command         # 快速命令
        ├── subscription    # 订阅管理
        ├── notification    # 通知
        ├── speech          # 语音识别
        ├── codeFavorites   # 代码收藏
        ├── prompts         # Prompt 模板
        ├── skills          # Skills 管理
        ├── mcps            # MCP 服务器
        ├── npmSettings     # NPM 设置
        ├── outputStyles    # 输出风格模板
        ├── tools           # 内置工具
        ├── robotAccounts   # 机器人账号
        ├── auth            # 认证
        ├── data            # 数据导入导出
        ├── version         # 版本检查
        ├── search          # 代码/文件搜索
        ├── agentStore      # Agent 在线商店
        ├── font            # 字体管理
        ├── inspector       # DOM Inspector
        ├── avatar          # 头像上传
        ├── agentCommands   # Agent 命令
        └── chat            # Chat Agent（独立聊天系统）
```

## 边界

- SDK **仅负责 HTTP 请求封装**，不包含：
  - WebSocket 连接管理（由 web 包 `lib/socket.ts` 处理）
  - 状态管理（由 Zustand store 处理）
  - 路由跳转逻辑
  - UI 组件
- SDK 的类型定义有两个来源：
  - 内部类型（`src/types.ts`）：`SDKConfig`、`ApiError`、`RequestOptions`
  - 模块内联类型：`PromptTemplate`、`SkillInfo`、`McpServerInfo`、`NpmSettings`、`OutputStyleTemplate`、`RobotAccount`、`ChatAgent`、`ChatMessage`、`ChatWorkspace`、`ChatSession`、`MiniAppProject`
  - 外部共享类型（`@agent-spaces/shared`）：`Workspace`、`AgentConfig`、`Channel`、`Message` 等

## 运行时形态

SDK 在浏览器环境中运行，通过 `fetch` API 发起 HTTP 请求。消费方是 `packages/web` 中的 Next.js 前端应用。SDK 不在 Node.js 环境中运行。

## HTTP 请求流程

```
组件调用 sdk.xxx.method()
  → 适配器方法调用 http.get/post/put/delete/...
    → HttpClient.request() 统一处理：
      1. URL 拼接（baseUrl + path）
      2. Bearer Token 注入（通过 getToken 延迟获取）
      3. 调试日志输出（如开启）
      4. fetch() 发起请求
      5. 401/403 触发 onUnauthorized 回调
      6. 非 2xx 抛出 ApiError
      7. 2xx 返回 JSON 解析后的数据
```
