[根目录](../../CLAUDE.md) > [packages](../) > **sdk**

# @agent-spaces/sdk

## 项目简介

`@agent-spaces/sdk` 是 Agent Spaces 平台的前端 API 统一调用层。它封装了平台所有后端 REST API 为类型安全的 TypeScript 函数，按业务域拆分为 39 个独立模块适配器。SDK 采用模块工厂模式，通过 `createSDK()` 一次创建，web 包单例消费，组件只需 `sdk.xxx.method()` 即可完成 API 调用。

SDK 层零业务逻辑，纯粹做 HTTP 请求映射。运行时仅依赖浏览器原生 `fetch` API，运行时依赖仅有 `@agent-spaces/shared` 的类型（编译后擦除）。

## 约定的规则

- **模块工厂模式**：每个 API 模块实现 `createXxxApi(http: HttpClient)` 工厂函数，返回标准方法对象
- **DELETE 方法命名**：使用 `delete_` 避免 JS 保留字冲突
- **路径编码**：路径参数直接拼接，查询参数中的用户输入必须 `encodeURIComponent()`
- **类型来源**：优先从 `@agent-spaces/shared` 导入类型；如 shared 中无对应类型，可在模块内定义并导出
- **无状态**：SDK 不缓存、不重试、不节流，纯请求映射
- **构建**：`pnpm build`（tsc），`pnpm dev`（tsc --watch）
- **TypeScript strict 模式，ESNext 模块，ESM**

## 文件索引

| 文件 | 说明 |
|------|------|
| [claude/overview.md](claude/overview.md) | 架构总览、设计目标、边界、HTTP 请求流程 |
| [claude/conventions.md](claude/conventions.md) | 开发约定、模块工厂模式、命名规范、禁止事项 |
| [claude/module-responsibilities.md](claude/module-responsibilities.md) | 39 个模块的职责说明 |
| [claude/entrypoints.md](claude/entrypoints.md) | 入口文件、构建配置、消费方式 |
| [claude/public-interfaces.md](claude/public-interfaces.md) | SDK 暴露的全部 API 接口（250+ 方法） |
| [claude/dependencies-and-config.md](claude/dependencies-and-config.md) | 依赖关系、配置文件、构建顺序 |
| [claude/data-model.md](claude/data-model.md) | SDK 内部类型、模块内联类型、shared 类型导入清单 |
| [claude/testing-and-quality.md](claude/testing-and-quality.md) | 测试现状、验证命令、质量保障方式 |
| [claude/file-map.md](claude/file-map.md) | 完整目录结构和文件说明 |
| [claude/faq.md](claude/faq.md) | 常见问题 |
| [claude/changelog.md](claude/changelog.md) | 变更记录 |

## 核心架构

```
createSDK(config)
  └── HttpClient (baseUrl + token + onUnauthorized + debug)
        ├── workspace       agent            channel
        ├── issue           task             git
        ├── editor          llm              workflow
        ├── workflowPlugin  miniApp          kanban
        ├── database        worktree         hooks
        ├── command         subscription     notification
        ├── speech          codeFavorites    prompts
        ├── skills          mcps             npmSettings
        ├── outputStyles    tools            robotAccounts
        ├── auth            data             version
        ├── search          agentStore       font
        ├── inspector       avatar           agentCommands
        └── chat
```

注：`miniApp` 模块对应文件 `src/modules/mini-apps.ts`（导出 `createMiniAppApi`）。

### HttpClient 便捷方法

| 方法 | 用途 |
|------|------|
| `get<T>()` | GET + JSON 解析 |
| `post<T>()` / `postVoid()` | POST JSON（解析/不解析） |
| `put<T>()` / `putVoid()` | PUT JSON |
| `patch<T>()` | PATCH + JSON 解析 |
| `delete()` / `deleteOf<T>()` | DELETE |
| `upload<T>()` | FormData 上传 |
| `sse()` | SSE 流式响应 |
| `raw()` | 原始 Response |

## 扫描状态

- **更新时间**：2026-06-13 16:57:29
- **已扫描范围**：全部 42 个源文件（3 核心 + 39 模块），2 个配置文件
- **跳过范围**：dist/（构建产物）
- **覆盖率**：100%
- **总 API 方法数**：约 250+
