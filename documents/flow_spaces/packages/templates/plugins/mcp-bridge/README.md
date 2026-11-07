# MCP Bridge 插件

> 在 Workflow 中桥接 MCP（Model Context Protocol）服务：连接外部 MCP、列出/调用工具、把本地 JS 入口文件作为 MCP 服务启动。

## 简介

MCP 是把「为 LLM 提供上下文/工具」标准化的协议。本插件把 MCP 的客户端与服务端能力封装为一组 Workflow 动作节点，Agent / Workflow 编排时可直接拖拽使用，无需手写 MCP SDK 调用代码。

插件采用**有状态连接模型**：`mcp_connect` 建立一次连接并返回 `clientId`，后续的「列出工具」「执行工具」用 `clientId` 复用同一连接，避免重复握手和重启 stdio 子进程。

插件类型：`server`（包含工作流动作和 Agent 工具）。

## 核心能力

- **连接 MCP**：支持 stdio（子进程）与 http（Streamable HTTP）两种 transport，握手后常驻连接
- **列出工具**：用 `clientId` 获取 MCP server 暴露的全部工具及其 inputSchema
- **执行工具**：用 `clientId` 调用指定工具并规整返回（content / text / isError）
- **断开连接**：主动释放连接，回收 stdio 子进程
- **创建服务**：把一个 JS 入口文件作为 MCP 服务（stdio）启动、握手、探测工具，常驻供后续使用

## 前置准备

1. 已有或准备编写一个 MCP server（stdio 类型，从 stdin 读 JSON-RPC、写 stdout）
2. 若连接 http 类型 MCP，需知道其 endpoint URL
3. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

本插件无全局配置项，所有参数在节点入参中提供。

### 连接配置（`config`）

`mcp_connect` 的 `config` 字段为 JSON 对象，按 transport 区分：

**stdio（启动子进程）**

```json
{
  "transport": "stdio",
  "command": "node",
  "args": ["/abs/path/to/your-server.js"],
  "env": { "API_KEY": "xxx" },
  "cwd": "/opt/server"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `transport` | 否 | `stdio` 或 `http`；缺省时按是否有 `url` 推断 |
| `command` | 是 | 可执行命令，通常为 `node` |
| `args` | 否 | 命令参数，server 入口文件路径放这里 |
| `env` | 否 | 注入子进程的环境变量 |
| `cwd` | 否 | 子进程工作目录 |

**http（Streamable HTTP）**

```json
{
  "transport": "http",
  "url": "http://127.0.0.1:3101/mcp",
  "headers": { "Authorization": "Bearer xxx" }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `transport` | 否 | `http` |
| `url` | 是 | MCP server 的 HTTP endpoint |
| `headers` | 否 | 请求头，如鉴权 |

## 动作节点

| 节点名 | 用途 | 核心入参 |
| --- | --- | --- |
| `mcp_connect` | 建立连接，返回 `clientId` | `config` |
| `mcp_list_tools` | 用 `clientId` 列出工具 | `clientId` |
| `mcp_call_tool` | 用 `clientId` 调用工具 | `clientId` / `toolName` / `arguments` |
| `mcp_disconnect` | 主动关闭连接 | `clientId` |
| `mcp_create_server` | 启动 JS 文件作为 MCP 服务 | `entryFile` / `cwd` / `env` / `nodeArgs` |

所有节点共享统一的出参结构：`success`(boolean) / `message`(string) / `data`(object，`mcp_disconnect` 无)。

### 节点输入输出示例

**mcp_connect**

- 入参：`config`（连接配置，见上）
- 出参 `data`：
  - `clientId`：连接标识，后续节点用它复用连接
  - `serverInfo`：`{ name, version }`，server 自报信息
  - `protocolVersion`：协商的协议版本

```json
{
  "success": true,
  "message": "已连接: agent-spaces-mcp (clientId=db453ce4-...)",
  "data": {
    "clientId": "db453ce4-fdf8-4619-a97b-42d9665ad08c",
    "serverInfo": { "name": "agent-spaces-mcp", "version": "0.1.0" },
    "protocolVersion": "2025-06-18"
  }
}
```

**mcp_list_tools**

- 入参：`clientId`
- 出参 `data`：
  - `count`：工具数量
  - `tools`：工具数组，元素含 `name` / `description` / `inputSchema`

**mcp_call_tool**

- 入参：`clientId` / `toolName`（必填） / `arguments`（JSON 对象，可选）
- 出参 `data`：
  - `content`：MCP 标准内容数组，元素含 `type` / `text`
  - `isError`：server 标记的工具执行错误
  - `text`：所有 text 类型 content 拼接后的纯文本（便于直接引用）
  - `structuredContent`：结构化结果（若有）

**mcp_create_server**

- 入参：`entryFile`（必填，JS 文件绝对路径） / `cwd`（默认入口文件所在目录） / `env`（JSON） / `nodeArgs`（传给 node 的额外参数）
- 出参 `data`：与 `mcp_connect` 一致，并额外含 `toolsCount` / `tools`（启动后探测）/ `entryFile`

## 使用示例

### 示例一：连接并调用外部 MCP

1. 拖入「MCP 连接」节点，`config` 填 stdio 配置，执行得到 `clientId`
2. 拖入「MCP 列出工具」节点，`clientId` 引用上一步输出，查看可用工具
3. 拖入「MCP 执行工具」节点，`clientId` 引用同上，`toolName` 填工具名，`arguments` 填 JSON
4. 拖入「MCP 断开」节点，`clientId` 引用同上，释放连接

### 示例二：启动本地 MCP 服务

「MCP 创建服务」节点，`entryFile` 填 `/abs/path/server.js`，执行 → 返回 `clientId` 与工具列表，后续可直接用该 `clientId` 列工具、调工具。

### 连接仓库自带 MCP server

连接本仓库 `@agent-spaces/mcp` 包暴露的 SDK 服务：

```json
{
  "transport": "stdio",
  "command": "node",
  "args": ["G:/agent_spaces/packages/mcp/dist/src/index.js"],
  "env": { "AGENT_SPACES_TOKEN": "<你的 token>" }
}
```

## 实现说明

- **零依赖客户端**：`lib/mcp-client.js` 仅用 Node 内置模块（`child_process` / `http` / `https`）实现 JSON-RPC 2.0，不引入 `@modelcontextprotocol/sdk`，插件自包含、可移植
- **连接池**：`lib/connection-pool.js` 进程内常驻 Map，按 `clientId` 索引；插件 `deactivate` 时统一 `closeAll` 释放子进程
- **协议兼容**：默认 `protocolVersion: 2025-06-18`，兼容 `2024-11-05` / `2025-06-18`

## 常见问题

- **连接失败 / 子进程退出**：检查 `command` / `args` 路径正确，`env` 完整；stdio server 的日志输出到 stderr，会在错误信息里回显
- **`clientId 无效`**：连接已被 `mcp_disconnect` 关闭或服务重启后池被清空，需重新 `mcp_connect`
- **执行工具返回 isError**：检查 `toolName` 拼写与 `arguments` 是否符合该工具的 `inputSchema`
- **http 模式 401**：在 `headers` 里补鉴权信息
- **启动的 server 无工具**：确认入口文件是 stdio 类型的 MCP server（读 stdin / 写 stdout），而非 http server

## 依赖

- 运行时依赖：无（仅 Node 内置模块）
- 目标 MCP server：需实现 MCP 协议（stdio 或 http）
