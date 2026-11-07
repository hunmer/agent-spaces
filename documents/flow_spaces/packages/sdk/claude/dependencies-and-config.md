# 依赖与配置

## 运行时依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| `@agent-spaces/shared` | `workspace:*` | 前后端共享类型定义 |

SDK 仅依赖 shared 包的**类型**。由于 TypeScript 编译后类型被擦除，运行时实际上零外部依赖（仅使用浏览器原生 `fetch` API）。

## 开发依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| `typescript` | `^5.8.3` | TypeScript 编译器 |

## 依赖方向

```
@agent-spaces/shared
    ↑ (类型依赖)
@agent-spaces/sdk
    ↑ (运行时消费)
@agent-spaces/web
```

SDK 是 web 包和 server 包之间的桥梁层：
- shared 提供**所有类型定义**
- SDK 提供**所有 API 调用函数**
- web 通过 SDK 调用 server 的 REST API

## 配置文件

### `package.json`

| 字段 | 值 | 说明 |
|------|------|------|
| name | `@agent-spaces/sdk` | 包名 |
| version | `0.1.0` | 当前版本 |
| type | `module` | ESM 模块 |
| main | `./dist/index.js` | 入口 |
| types | `./dist/index.d.ts` | 类型入口 |
| files | `["dist"]` | 发布包含 dist 目录 |
| scripts.build | `tsc` | 构建 |
| scripts.dev | `tsc --watch` | 开发监听 |

### `tsconfig.json`

| 选项 | 值 |
|------|------|
| target | ES2022 |
| module | ESNext |
| moduleResolution | bundler |
| declaration | true |
| declarationMap | true |
| sourceMap | true |
| outDir | ./dist |
| rootDir | ./src |
| strict | true |
| esModuleInterop | true |
| skipLibCheck | true |
| forceConsistentCasingInFileNames | true |
| resolveJsonModule | true |
| isolatedModules | true |

### 构建顺序

在 monorepo 中，SDK 的构建必须在 shared 之后、web 和 server 之前：

```
shared → sdk → web
            → server（server 不直接依赖 SDK，但共享类型）
```

### 没有的配置文件

SDK 没有以下常见配置文件（有意为之）：
- 没有 ESLint/Prettier 配置（跟随 monorepo 根配置）
- 没有测试配置（当前无测试文件）
- 没有 `.env` 文件（SDK 在浏览器运行，通过构造函数传入配置）
