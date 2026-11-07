# 入口文件

## 包入口

- **文件**：`src/index.ts`
- **内容**：`export * from './types/index.js'`
- **用途**：包的唯一入口，汇总导出所有类型和常量

## 类型汇总入口

- **文件**：`src/types/index.ts`
- **内容**：从 27 个子模块 `export *`
- **用途**：将所有类型文件聚合到单一导出点

## 构建命令

```bash
# 编译 TypeScript 到 dist/
pnpm --filter @agent-spaces/shared build
# 等价于 tsc

# 监听模式
pnpm --filter @agent-spaces/shared dev
# 等价于 tsc --watch
```

## 构建产物

- `dist/index.js` -- ESM 入口（由于纯类型包，实际内容仅为 re-export）
- `dist/index.d.ts` -- 类型声明入口
- `dist/types/*.js` + `dist/types/*.d.ts` -- 各子模块的编译产物和声明文件
- 每个文件均附带 `.js.map` 和 `.d.ts.map` source map

## 消费方式

```typescript
// server 或 web 中引用类型
import type { Workspace, AgentConfig, Issue } from '@agent-spaces/shared';

// 引用常量或函数（非 type-only）
import { BUILT_IN_AGENT_TOOLS, isBuiltinAgent } from '@agent-spaces/shared';
```

## 发布配置

- `"files": ["dist"]` -- 仅发布编译产物
- `"publishConfig": { "access": "public" }` -- 公开发布
- `"prepublishOnly": "pnpm build"` -- 发布前自动构建
