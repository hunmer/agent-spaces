# 入口文件与构建流程

## 入口文件

### `src/index.ts` — SDK 主入口

这是唯一的导出入口。它完成以下职责：

1. **导出核心类型和类**
   - `HttpClient` — HTTP 客户端类
   - `ApiError` — API 错误类
   - `SDKConfig` — SDK 配置接口（类型导出）
   - `RequestOptions` — 请求选项接口（类型导出）

2. **导出所有模块工厂函数**
   - 39 个 `createXxxApi` 函数
   - 部分模块的内部类型（`PromptTemplate`、`SkillInfo`、`McpServerInfo` 等）

3. **定义 SDK 接口**
   - `SDK` 接口声明所有 39 个 API 模块属性
   - `setDebug()` 和 `updateConfig()` 方法
   - `http` 属性暴露底层 HttpClient

4. **实现 `createSDK()` 工厂函数**
   - 创建 HttpClient 实例
   - 调用所有模块工厂函数，传入 HttpClient
   - 返回完整的 SDK 对象

### `src/client.ts` — HttpClient

HTTP 客户端核心实现，所有 API 模块的唯一出口。

### `src/types.ts` — 内部类型

`SDKConfig`、`ApiError`、`RequestOptions` 定义。

## 构建流程

```bash
# 开发模式（监听变化）
pnpm dev    # → tsc --watch

# 生产构建
pnpm build  # → tsc
```

### 构建配置（tsconfig.json）

| 选项 | 值 | 说明 |
|------|------|------|
| target | ES2022 | 输出 ES2022 |
| module | ESNext | ESNext 模块 |
| moduleResolution | bundler | bundler 解析模式 |
| declaration | true | 生成 .d.ts |
| declarationMap | true | 生成 .d.ts.map |
| sourceMap | true | 生成 .js.map |
| outDir | ./dist | 输出到 dist/ |
| rootDir | ./src | 源码根目录 |
| strict | true | 严格模式 |
| isolatedModules | true | 隔离模块 |

### 构建产物

构建后 `dist/` 目录结构镜像 `src/`：
```
dist/
  index.js        + .d.ts, .js.map, .d.ts.map
  client.js       + .d.ts, .js.map, .d.ts.map
  types.js        + .d.ts, .js.map, .d.ts.map
  modules/
    workspace.js  + .d.ts, .js.map, .d.ts.map
    agent.js      + ...
    ...
```

## 消费方式

SDK 在 `packages/web` 中被单例消费：

```typescript
// packages/web/src/lib/sdk.ts
import { createSDK } from '@agent-spaces/sdk';

export const sdk = createSDK({
  baseUrl: getServerUrl(),
  getToken: () => localStorage.getItem('token'),
  onUnauthorized: () => { /* 跳转登录 */ },
  debug: import.meta.env.DEV,
});
```

组件中使用：
```typescript
const workspaces = await sdk.workspace.list();
const status = await sdk.git.status(workspaceId);
```

## package.json 导出配置

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"]
}
```

仅通过 `import { ... } from '@agent-spaces/sdk'` 导入，无子路径导出。
