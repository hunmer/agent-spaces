# 数据模型

SDK 本身不定义核心业务数据模型，仅使用 `@agent-spaces/shared` 中的类型和少量本地类型。

## SDK 内部类型（`src/types.ts`）

### SDKConfig

```typescript
interface SDKConfig {
  baseUrl: string;            // 服务器基础 URL
  getToken: () => string | null;  // Token 获取函数（延迟求值）
  onUnauthorized?: () => void;    // 401/403 回调
  debug?: boolean;                // 调试日志开关
}
```

### ApiError

```typescript
class ApiError extends Error {
  status: number;        // HTTP 状态码
  statusText: string;    // 状态文本
  body: string;          // 响应体
  url: string;           // 请求 URL
  method: string;        // HTTP 方法
}
```

### RequestOptions

```typescript
interface RequestOptions extends Omit<RequestInit, 'signal'> {
  noAuth?: boolean;       // 跳过 auth header
  absoluteUrl?: boolean;  // 跳过 baseUrl 拼接
  rawResponse?: boolean;  // 不抛出错误
}
```

## 模块内联类型

以下类型在各自模块文件中定义（不在 shared 包中）：

### PromptTemplate（`modules/prompts.ts`）

```typescript
interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
```

### SkillInfo（`modules/skills.ts`）

```typescript
interface SkillInfo {
  name: string;
  content: string;
  group?: string;
  favorited?: boolean;
  storeId?: string;
  [key: string]: unknown;
}
```

### SkillSyncItem（`modules/skills.ts`）

```typescript
interface SkillSyncItem {
  agentId: string;
  skillName: string;
  [key: string]: unknown;
}
```

### McpServerInfo（`modules/mcps.ts`）

```typescript
interface McpServerInfo {
  name: string;
  config: Record<string, unknown>;
  favorited?: boolean;
  [key: string]: unknown;
}
```

### NpmSettings（`modules/npm-settings.ts`）

```typescript
interface NpmSettings {
  registry: string;
  proxy?: string;
}
```

### OutputStyleTemplate（`modules/output-styles.ts`）

```typescript
interface OutputStyleTemplate {
  id: string;
  name: string;
  content: string;
  description?: string;
  storeId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### RobotAccount（`modules/robot-accounts.ts`）

```typescript
interface RobotAccount {
  id: string;
  name: string;
  provider: 'lark' | 'wechat';
  credentials: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### ChatAgent（`modules/chat.ts`）

```typescript
interface ChatAgent {
  id: string;
  name: string;
  role?: 'agent';
  runtimeKind?: 'langchain';
  avatar?: string;
  avatarUrl?: string;
  icon?: string;
  backgroundUrl?: string;
  description?: string;
  systemPrompt?: string;
  modelProvider?: string;
  modelId?: string;
  provider: string;
  model: string;
  apiKey: string;
  baseURL?: string;
  apiBase?: string;
  workingDir?: string;
  mcps?: Record<string, unknown>;
  skills?: Array<string | { name: string; content?: string }>;
  tools?: BuiltInAgentToolName[];
  outputStyle?: string;
  temperature?: number;
  maxTokens?: number;
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### ChatMessage（`modules/chat.ts`）

```typescript
interface ChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  thinking?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; };
  toolCalls?: WorkflowAgentToolCall[];
  timeline?: WorkflowAgentTimelineItem[];
}
```

### ChatWorkspace / ChatSession（`modules/chat.ts`）

```typescript
interface ChatWorkspace {
  id: string;
  name: string;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ChatSession {
  id: string;
  workspaceId: string;
  agentId: string;
  title?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### MiniAppProject（`modules/mini-app.ts`）

```typescript
interface MiniAppProject {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: 'react' | 'html';
  tags?: string[];
  enabledPlugins?: string[];
  agentConfigId?: string;
  mainFile: string;
  icon?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
  storeUrl?: string;
  storeChecksum?: string;
}
```

## 从 @agent-spaces/shared 导入的类型

SDK 从 shared 包导入了大量业务类型，以下是按模块分类的导入清单：

| 模块 | 导入的类型 |
|------|-----------|
| workspace | `Workspace`, `CreateWorkspaceInput`, `WorkspaceNotificationSettings` |
| agent | `AgentConfig`, `AgentUsageDashboard` |
| channel | `Channel`, `Message` |
| issue | `Issue`, `IssueComment`, `CreateIssueInput` |
| task | `Task` |
| git | `GitStatusResult`, `GitDiffResult`, `GitLogEntry`, `GitBranch`, `GitOperationEntry` |
| editor | `FileNode`, `CodeSearchResult` |
| llm | `LLMModel`, `LLMProvider` |
| workflow | `WorkflowTemplate`, `WorkflowNode`, `WorkflowFolder`, `WorkflowVersion`, `ExecutionLog`, `OperationEntry`, `StagedNode`, `WorkflowEdge`, `WorkflowAgentChatMessage` |
| workflow-plugin | `PluginMeta`, `NodeTypeDefinition`, `PluginWorkflowNodesResult`, `PluginConfigSaveResult` |
| kanban | `KanbanBoard` |
| database | `DatabaseMeta`, `DocNode`, `DatabaseVectorStats`, `DatabaseVectorSearchResult`, `DatabaseNodeVersion`, `DatabaseVectorIndexResult` |
| worktree | `WorktreeInfo`, `CreateWorktreeInput` |
| hooks | `HookConfig` |
| command | `QuickCommand` |
| subscription | `SubscriptionConfig`, `SubscriptionQuota` |
| notification | `AppNotification` |
| speech | `SpeechRecognitionConfig` |
| code-favorites | `CodeFavorite` |
| search | `CodeSearchResult`, `FileSearchResult` |
| chat | `BuiltInAgentToolName`, `FileNode`, `WorkflowAgentTimelineItem`, `WorkflowAgentToolCall` |
