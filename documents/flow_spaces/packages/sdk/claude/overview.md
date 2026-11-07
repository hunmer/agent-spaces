# SDK 模块 — 概述

## 架构

`createSDK(config)` → `SDK` 对象，包含 39 个 API 模块。

每个模块通过 `createXxxApi(http: HttpClient)` 工厂函数创建，接收统一的 HTTP 客户端。

## API 模块列表（39 个）

agent, agentCommands, agentStore, auth, avatar, channel, chat, codeFavorites, command, data, editor, externalImport, font, git, hooks, inspector, issue, knowledgeBase, llm, mcps, miniApp, notification, npmSettings, outputStyles, prompts, robotAccounts, search, skills, speech, sqlite, subscription, **team**, tools, version, workflow, workflowPlugin, workflowSettings, workspace, worktree

## 使用方式

```typescript
import { createSDK } from '@agent-spaces/sdk';
const sdk = createSDK({
  baseUrl: 'http://localhost:3100',
  getToken: () => localStorage.getItem('token'),
  onUnauthorized: () => { window.location.href = '/login'; },
});
const workspaces = await sdk.workspace.list();
```
