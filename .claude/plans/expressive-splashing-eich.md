# 添加内置 `@agent-spaces/builtin` 虚拟插件，暴露 `agent_run` 工具

## Context

`agent_run` 是 workflow 内置节点类型（定义于 `packages/web/src/lib/workflow-nodes/definitions/ai.ts`），执行逻辑在 `packages/server/src/services/execution-manager.ts:773`。

`list_plugin_tools`（`packages/server/src/services/builtin-tools/mini-app-tools.ts:309`）只扫描外部插件目录（`~/.agent-spaces-data/plugins/`），`agent_run` 无法被发现。

需要：让 mini-app agent 通过 `list_plugin_tools` 发现 `agent_run`，并能通过 `execute_plugin_tool` 执行。

## 修改文件

**唯一修改文件**: `packages/server/src/services/builtin-tools/mini-app-tools.ts`

## 实现方案

### 1. 定义内置插件常量和工具列表

在文件顶部（`createMiniAppFunctionTools` 之前）添加：

```ts
const BUILTIN_PLUGIN_ID = '@agent-spaces/builtin';

interface BuiltinToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  outputs: unknown[];
  execute: (args: Record<string, any>) => Promise<any>;
}

const BUILTIN_TOOLS: BuiltinToolDefinition[] = [
  {
    name: 'agent_run',
    description: '运行 AI Agent 执行任务。支持指定 agent preset、prompt、systemPrompt、工作目录和权限模式。',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '给 Agent 的任务描述（必填）' },
        agentConfigId: { type: 'string', description: 'Agent preset ID（从 list_agent_presets 获取可选值）' },
        systemPrompt: { type: 'string', description: '系统提示词' },
        cwd: { type: 'string', description: '工作目录' },
        permissionMode: {
          type: 'string',
          enum: ['default', 'dontAsk', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
          description: '权限模式，默认 dontAsk',
        },
        extraInstructions: { type: 'string', description: '额外指令' },
      },
      required: ['prompt'],
    },
    outputs: [
      { key: 'result', type: 'string', description: 'Agent 执行结果' },
    ],
    execute: async (args) => {
      // 见步骤 2
    },
  },
];
```

### 2. `agent_run` execute 实现

execute 内部逻辑：

1. 取 `args.agentConfigId`，从 agent service 查找 preset
2. 有 preset → 用 `createAgentRuntime` 创建对应 runtime，传入 preset 的 model/provider/apiKey 等配置
3. 无 preset → 用 `createAgentRuntime` 创建默认 runtime（claude-sonnet）
4. 调用 runtime 的 `run` / `execute` 方法执行 prompt
5. 返回结果文本

关键复用：
- `createAgentRuntime` from `../../adapters/agent-runtime.js`
- `listPresets` / preset 查找 from `../agent.js`
- `normalizeAgentPermissionMode` 逻辑（内联或提取）

注意：agent service 需要 workspaceId 才能 listPresets。由于 agentConfigId 由调用方传入，execute 不需要额外 context。

### 3. 修改 `list_plugin_tools`（第 309 行）

在 `for (const pluginId of pluginIds)` 循环**之后**，追加内置工具：

```ts
// 始终包含内置工具
for (const tool of BUILTIN_TOOLS) {
  if (keyword) {
    const text = `${tool.name} ${tool.description}`.toLowerCase();
    if (!text.includes(keyword)) continue;
  }
  results.push({ pluginId: BUILTIN_PLUGIN_ID, toolName: tool.name, description: tool.description });
}
```

### 4. 修改 `get_plugin_tool_detail`（第 340 行）

在现有 `try` 块**之前**加前置判断：

```ts
if (pluginId === BUILTIN_PLUGIN_ID) {
  const tool = BUILTIN_TOOLS.find(t => t.name === toolName);
  if (!tool) return { success: false, message: `Tool "${toolName}" not found in builtin tools` };
  return { success: true, name: tool.name, description: tool.description, input_schema: tool.input_schema, outputs: tool.outputs };
}
```

### 5. 修改 `execute_plugin_tool`（第 373 行）

同理，在现有逻辑**之前**加前置判断：

```ts
if (pluginId === BUILTIN_PLUGIN_ID) {
  const tool = BUILTIN_TOOLS.find(t => t.name === toolName);
  if (!tool) return { success: false, message: `Tool "${toolName}" not found in builtin tools` };
  try {
    const result = await tool.execute(args);
    return { success: true, result };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
```

### 6. （可选）新增 `list_agent_presets` 内置工具

方便调用方发现可用的 agentConfigId：

```ts
{
  name: 'list_agent_presets',
  description: '列出可用的 Agent preset（模型配置），返回 id/name/runtimeKind/modelId 供 agent_run 使用。',
  input_schema: { type: 'object', properties: {} },
  outputs: [{ key: 'presets', type: 'array', description: 'Agent preset 列表' }],
  execute: async () => { /* 调用 agent service 列出 presets */ },
}
```

加入 `BUILTIN_TOOLS` 数组即可。

## 验证

1. `pnpm dev` 启动
2. 在 mini-app 项目中触发 agent chat
3. 让 agent 调用 `list_plugin_tools`，确认返回包含 `{ pluginId: '@agent-spaces/builtin', toolName: 'agent_run' }`
4. 调用 `get_plugin_tool_detail`（`pluginId=@agent-spaces/builtin, toolName=agent_run`）确认 schema
5. 调用 `execute_plugin_tool` 执行一个简单 prompt，确认返回结果
