# Server 模块 — Gemini CLI 运行时

> 对应源码 `src/adapters/gemini-cli-runtime.ts`（422 行）。新增于 2026-07-18 ~ 2026-07-27 期间，是本期主要的新增适配器。

## 定位

`GeminiCliRuntime` 实现 `AgentRuntime` 统一接口（见 `agent-runtime-types.ts`），以 spawn 子进程方式驱动 Google 的 `gemini-cli`，与 `grok-runtime.ts` 同属"CLI 子进程 + stdout JSON 事件流"风格。

## 关键能力

- **子进程驱动**：spawn `gemini` 命令，streaming 读取 stdout，按 JSON 事件解析（text/thought/end/error 等事件类型）。
- **附件上下文**：支持把图片/文件作为输入上下文准备给 gemini-cli。
- **权限模式**：支持 `permissionMode` 通用运行时参数。
- **会话恢复**：支持 resume 已有会话。
- **maxTurns / 通用参数**：与其它 CLI 适配器（grok/codex）对齐。

## Runtime 登记

在 `routes/runtime.ts` 的 `RUNTIME_DESCRIPTORS` 中：

| 字段 | 值 |
|---|---|
| `id` | `'gemini-cli'` |
| `label` | `'Gemini CLI'` |
| `commands` | `['gemini']` |
| `runtimeKind` | `'gemini-cli'` |
| `versionSource` | `{ type: 'npm', packageName: '@google/gemini-cli' }` |
| 安装命令 | `npm install -g @google/gemini-cli` / `npm update -g @google/gemini-cli` |

`AgentRuntimeKind` 联合类型已新增 `'gemini-cli'`（见 `agent-runtime-types.ts`）。

## 测试

`src/adapters/gemini-cli-runtime.test.ts`（位于 adapters 目录，与 `grok-runtime.test.ts` 同级，非 `test/` 顶层目录）。

## 新增/对接新 endpoint 指南

1. 修改 `adapters/gemini-cli-runtime.ts`：调整 spawn 参数、事件 schema 解析、附件准备逻辑。
2. 若需自定义 endpoint（类似 grok 的 `normalizeGrokEndpoint`），在此文件内新增归一化函数。
3. 自定义模型/config 若需持久化，参考 grok 的 `config.toml` 模式。
4. 同步更新本文件与 `ai-adapters.md`。

## 相关

- 协议风格相近的兄弟适配器：[Grok 运行时协议](grok-runtime.md)。
- 适配器整体架构与新增指南：[AI 运行时适配器](ai-adapters.md)。
