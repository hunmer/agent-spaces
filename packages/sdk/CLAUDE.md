# packages/sdk (`@agent-spaces/sdk`)

前端统一 API SDK。封装所有后端 HTTP 调用，提供 `createSDK()` 工厂函数返回 40 个 API 模块、200+ 方法。依赖 `@agent-spaces/shared` 类型。纯逻辑层，无 UI 依赖。

## 约定

- 新增 API：在 `src/modules/` 创建模块，在 `src/index.ts` 注册。
- 每个模块接收 `HttpClient`，返回 API 方法对象。
- Token 通过 `getToken` 回调延迟获取。
- 模块覆盖域：workspace / agent / channel / issue / chat / **team** / workflow / workflow-plugin / git / editor / llm / mini-apps / database / hooks / knowledge-base / worktree / notification / subscription / speech / search / skills / mcps / prompts / output-styles / tools / robot-accounts / agent-commands / version / font / avatar / data / auth / inspector / agent-store / npm-settings / code-favorites / command / external-import / sqlite / model-catalog 等。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [概述](claude/overview.md) | SDK 架构、模块列表 | 首次接触 |
| [文件索引](claude/file-map.md) | 模块文件清单 | 需要找模块 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-07-10
- **已扫描**: package.json、src/index.ts、src/modules/（40 模块，含 team）
