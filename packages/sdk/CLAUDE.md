# packages/sdk (`@agent-spaces/sdk`)

前端统一 API SDK。封装所有后端 HTTP 调用，提供 `createSDK()` 工厂函数返回 35+ API 模块。依赖 `@agent-spaces/shared` 类型。纯逻辑层，无 UI 依赖。

## 约定

- 新增 API：在 `src/modules/` 创建模块，在 `src/index.ts` 注册。
- 每个模块接收 `HttpClient`，返回 API 方法对象。
- Token 通过 `getToken` 回调延迟获取。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [概述](claude/overview.md) | SDK 架构、模块列表 | 首次接触 |
| [文件索引](claude/file-map.md) | 模块文件清单 | 需要找模块 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: package.json、src/index.ts、src/modules/ 列表
