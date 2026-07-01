# 开发约定

## 文件命名

- 类型文件使用 **kebab-case**：`code-favorites.ts`、`workflow-execution.ts`
- 目录名使用 **kebab-case**：`src/types/`
- 入口文件使用 `index.ts`

## 导出规范

- 每个类型文件独立导出其定义的类型和接口
- `src/types/index.ts` 通过 `export * from './xxx.js'` 汇总所有子模块
- `src/index.ts` 通过 `export * from './types/index.js'` 作为包的唯一入口
- 导出路径使用 `.js` 后缀（ESM 规范要求）

## 类型命名

- 接口使用 **PascalCase**：`Workspace`、`AgentConfig`、`IssueStatus`
- 类型别名使用 **PascalCase**：`TaskStatus`、`NotificationProvider`
- 常量使用 **UPPER_SNAKE_CASE**：`BUILT_IN_AGENT_TOOLS`、`PRESET_COVERS`
- 枚举使用联合字面量类型（非 TypeScript `enum`）：`type IssueStatus = 'draft' | 'in_progress' | ...`

## 状态枚举模式

所有状态字段使用联合字面量类型而非 `enum`，例如：

```typescript
export type IssueStatus = 'draft' | 'in_progress' | ...;
export type TaskStatus = 'pending' | 'running' | 'done' | ...;
```

## 时间戳格式

- **ISO 字符串**：大多数模型使用 `string` 类型（如 `createdAt: string`）
- **Unix 毫秒**：Workflow 相关模型使用 `number` 类型（如 `createdAt: number`），这是 WorkFox 统一 Workflow 类型的设计决策

## 扩展性约定

- `AgentRole` 使用 `BuiltInAgentRole | (string & {})` 模式，既提供内置值类型检查，又允许任意自定义字符串
- `WorkflowNode.data` 使用 `Record<string, unknown>` 宽松耦合，通过 `type` 字段区分节点类型
- `Composite` 元数据使用可选字段，不强制要求所有节点携带

## 导入路径

- 模块内导入使用相对路径 + `.js` 后缀：`import type { ... } from './tool.js'`
- 消费方使用包名导入：`import type { ... } from '@agent-spaces/shared'`
- 使用 `import type` 语法导入纯类型，确保编译后不产生运行时引用

## 编译选项

继承 `tsconfig.base.json`：
- `target: ES2022`
- `module: ESNext`
- `moduleResolution: bundler`
- `strict: true`
- `declaration: true` + `declarationMap: true`
- `sourceMap: true`
