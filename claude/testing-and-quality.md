# 测试与质量

## 当前状态

项目当前以手动测试为主，自动化测试覆盖有限。Flutter 模块已有基础测试。

## 后端（server）

- 无独立单元测试或集成测试
- TypeScript 编译验证类型正确性
- zod Schema 校验 API 请求参数
- SQLite 越界保护（`mini-app-db.ts` 的 `checkSql` + `validateDbName`）
- 路径越界保护（`safeSrcPath` 等）

## 前端（web）

- ESLint：`pnpm lint`（eslint + eslint-config-next）
- 无单元测试或 E2E 测试
- TypeScript 编译验证类型正确性

## Flutter

- **冒烟测试**：`test/widget_test.dart` -- 验证 App 可构建（`AgentSpacesApp` + EasyLocalization + ProviderScope）
- **单元测试**：`test/services/file_sources/webdav_url_test.dart` -- WebDAV URL 规范化（scheme 补全 / 保留 / 空白修剪）
- flutter_lints 规则集
- 运行命令：`flutter test`

## 验证命令

```bash
# 类型检查（间接验证 shared 类型正确性）
pnpm build

# 全包 Lint
pnpm lint

# 前端 Lint
cd packages/web && pnpm lint

# Flutter 测试
cd packages/flutter && flutter test
```

## 质量工具

| 工具 | 配置文件 | 范围 |
|------|----------|------|
| TypeScript | `packages/*/tsconfig.json` | 全项目 |
| ESLint | `packages/web/eslint.config.mjs` | web |
| zod | 后端路由层 | server |
| flutter_lints | `packages/flutter/analysis_options.yaml` | flutter |

## 测试缺口

- server 无自动化测试（建议优先补：`mini-app-db.ts` SQL 校验、`pty.ts` 会话管理、`execution-manager.ts` Workflow 引擎）
- web 无组件测试（建议优先补：Workflow 编辑器、Monaco 编辑器、Chat 消息渲染）
- flutter 仅 2 个测试文件（建议补：file_source_factory、storage_service、js_bridge）
