# packages/shared (`@agent-spaces/shared`)

跨前后端共享 TypeScript 类型定义。纯类型包，无运行时代码。被 `@agent-spaces/server`、`@agent-spaces/sdk`、`@agent-spaces/electron` 依赖。

## 约定

- 新增类型在 `src/types/` 创建文件，在 `src/types/index.ts` 导出。
- 仅导出类型，不引入运行时依赖。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [概述](claude/overview.md) | 类型文件列表 | 需要了解类型定义 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: package.json、src/index.ts、src/types/ 列表
