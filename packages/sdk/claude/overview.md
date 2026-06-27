# SDK 模块 — 概述

## 架构

`createSDK(config)` → `SDK` 对象，包含 35+ API 模块。

每个模块通过 `createXxxApi(http: HttpClient)` 工厂函数创建，接收统一的 HTTP 客户端。

## API 模块列表

workspace, agent, channel, issue, task, git, editor, llm, workflow, workflowPlugin, knowledgeBase, worktree, hooks, command, subscription, notification, speech, codeFavorites, prompts, skills, mcps, npmSettings, outputStyles, tools, robotAccounts, auth, data, version, search, agentStore, font, inspector, avatar, agentCommands, chat, miniApp, sqlite

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
