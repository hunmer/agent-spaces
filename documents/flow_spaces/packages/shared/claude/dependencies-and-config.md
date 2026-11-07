# 依赖与配置

## 依赖关系

### 运行时依赖

无。本包零运行时依赖。

### 开发依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `typescript` | `^5.8.3` | TypeScript 编译器 |

### 被依赖关系

以下包依赖 `@agent-spaces/shared`：

| 消费方 | 引用方式 | 用途 |
|--------|----------|------|
| `@agent-spaces/server` | `import type { ... } from '@agent-spaces/shared'` | 后端 API 路由、WebSocket 事件、存储层、Agent 编排 |
| `@agent-spaces/sdk` | `import type { ... } from '@agent-spaces/shared'` | SDK 类型定义复用 |
| `@agent-spaces/web` | 通过 `@agent-spaces/sdk` 间接引用 | 前端状态管理、API 调用、组件 Props |
| `@agent-spaces/templates` | 无直接引用 | 通过 server 间接消费 |

## 构建配置

### package.json

```json
{
  "name": "@agent-spaces/shared",
  "version": "0.2.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

### tsconfig.json

继承 `../../tsconfig.base.json`，仅覆盖：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### 基础编译选项（tsconfig.base.json）

| 选项 | 值 | 说明 |
|------|------|------|
| `target` | `ES2022` | 编译目标 |
| `module` | `ESNext` | 模块系统 |
| `moduleResolution` | `bundler` | 模块解析策略 |
| `strict` | `true` | 严格类型检查 |
| `declaration` | `true` | 生成 `.d.ts` |
| `declarationMap` | `true` | 生成声明 source map |
| `sourceMap` | `true` | 生成 JS source map |

## 构建顺序

在 monorepo 构建管线中，`@agent-spaces/shared` 是最底层的基础包，必须最先构建：

```
shared -> sdk -> server -> web
```

## NPM 脚本

| 脚本 | 命令 | 说明 |
|------|------|------|
| `build` | `tsc` | 编译到 `dist/` |
| `dev` | `tsc --watch` | 监听模式 |
| `prepublishOnly` | `pnpm build` | 发布前自动构建 |
