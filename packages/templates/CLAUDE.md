# packages/templates (`@agent-spaces/agents`)

模板/插件/技能打包工具。提供插件模板、技能模板、Workflow UI 组件。通过 `generate-index.mjs` 生成索引，`pack-mini-apps.mjs` 打包 Mini Apps。构建后通过 Server 的 `/agents-store` 静态路由提供服务。

## 约定

- 构建后产物由 `copy-web.mjs` 间接分发（通过 Server 静态服务）。
- `plugins/` 存放插件模板，`skills/` 存放技能模板。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [概述](claude/overview.md) | 结构、构建流程 | 首次接触 |
| [文件索引](claude/file-map.md) | 目录结构 | 需要找文件 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: package.json、目录结构
