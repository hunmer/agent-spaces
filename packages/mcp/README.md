# @agent-spaces/mcp

把 [`@agent-spaces/sdk`](../sdk) 的**全部能力**（36 个模块 / 339 个方法）自动暴露为 [MCP（Model Context Protocol）](https://modelcontextprotocol.io) 服务。

支持 **stdio**（Claude Desktop / Cursor 等本地客户端）与 **http**（远程访问）两种 transport。

## 核心特性

- **零维护全覆盖**：运行时反射 SDK 实例，SDK 增删方法时本包无需改动，**永不漏方法**。
- **339 个 tool 自动生成**：每个 SDK 方法 → 一个 MCP tool，命名 `模块_方法`（如 `workspace_list`、`git_commit`）。
- **双 transport**：stdio（默认）+ http。
- **红绿灯测试**：三层质量门禁，彩色报告，失败非零退出。

## 工作原理

启动时遍历 SDK 实例，把每个模块的每个方法注册为 MCP tool：

```
sdk = createSDK({ baseUrl, getToken })
for 模块 in sdk:
  for 方法 in 模块:
    tool 名 = `${模块}_${方法}`
    参数 = arg0/arg1/... 按序（arg0 必填，其余可选）
    执行 = (args) => 方法(...Object.values(args))
```

调用方传 `{ arg0: "ws-1", arg1: "fix bug" }`，按序 spread 成 `方法("ws-1", "fix bug")`。
object 参数（如 `task.create(wsId, {title})`）可传 JSON 字符串，会自动解析。

## 安装与构建

```bash
# 在仓库根目录
pnpm install
pnpm --filter @agent-spaces/mcp build
```

## 使用

### stdio（给 Claude Desktop / Cursor）

```bash
agent-spaces-mcp --baseUrl http://localhost:3100 --token <你的 token>
```

Claude Desktop 配置（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "agent-spaces": {
      "command": "node",
      "args": ["G:/agent_spaces/packages/mcp/dist/src/index.js"],
      "env": {
        "AGENT_SPACES_BASE_URL": "http://localhost:3100",
        "AGENT_SPACES_TOKEN": "你的 token"
      }
    }
  }
}
```

### http（远程）

```bash
agent-spaces-mcp --transport http --port 3101 --baseUrl http://localhost:3100 --token <token>
# → http://127.0.0.1:3101/mcp
```

### 全部参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--baseUrl` | `http://localhost:3100` | Agent Spaces 服务器地址 |
| `--token` | （或环境变量 `AGENT_SPACES_TOKEN`） | 鉴权 token |
| `--transport` | `stdio` | `stdio` 或 `http` |
| `--port` | `3101` | http 模式端口 |
| `--host` | `127.0.0.1` | http 模式监听地址 |
| `--debug` | 关 | 输出 SDK 调试日志到 stderr |

## tool 命名与调用约定

- 名 = `模块_方法`，如：
  - `workspace_list` → `sdk.workspace.list()`
  - `git_commit` → `sdk.git.commit(workspaceId, message)`
  - `task_create` → `sdk.task.create(workspaceId, data)`
  - `knowledgeBase_query` → `sdk.knowledgeBase.query(workspaceId, kbId, body)`
- 参数：`arg0`（必填，通常是主键）+ `arg1`/`arg2`/...（可选，按序）。
- object 类参数传 JSON 字符串即可自动解析。

### 特殊方法

| 类型 | 示例 | 处理 |
|---|---|---|
| SSE 流 | `workflow_execute` / `miniApp_agentChat` | 流聚合为完整文本返回 |
| 文件上传 | `avatar_upload` 等 | 传 `{ _file: [{name, type, data: base64}] }` |
| 二进制响应 | `data_exportZip` | 转 base64 返回 |

## 红绿灯测试

三层质量门禁（`node:test`，零额外依赖）：

```bash
pnpm --filter @agent-spaces/mcp test
```

```
═══════════════════════════════════════════════════════════════
  @agent-spaces/mcp 红绿灯测试报告
═══════════════════════════════════════════════════════════════
  🟢  GREEN                          4/4    PASS
  🟡  YELLOW                         8/8    PASS
  🔴  RED                            4/4    PASS
═══════════════════════════════════════════════════════════════
  ALL GREEN ✓    (16 tests passed)
═══════════════════════════════════════════════════════════════
```

- **🟢 GREEN 注册完整性**：339 个方法全部反射为 tool，名字无遗漏无重复，schema arity 正确。
- **🟡 YELLOW 调用链路**：经 mock HTTP server 验证代表性 tool（GET/POST/PUT/DELETE/上传/SSE）的请求转发与响应回传。
- **🔴 RED 错误处理**：未知 tool / 缺参 / HTTP 4xx-5xx 被正确捕获，不崩溃，会话可持续。

任一层失败 → 退出码 1。

## 目录结构

```
packages/mcp/
├── src/
│   ├── index.ts          # CLI 入口（解析参数，启动 server）
│   ├── registry.ts       # 核心：反射 SDK → MCP tools
│   ├── server.ts         # MCP Server + tools/list、tools/call handler
│   └── transport/
│       ├── stdio.ts      # StdioServerTransport
│       └── http.ts       # StreamableHTTPServerTransport
├── tests/
│   ├── redlight.test.ts  # 红绿灯测试（GREEN/YELLOW/RED）
│   └── mock-server.ts    # 测试用 mock HTTP server
├── scripts/
│   ├── fix-esm-extensions.mjs  # postbuild：补 .js 后缀
│   └── run-redlight.mjs        # 测试彩色报告 runner
└── package.json
```
