/**
 * mcp-bridge actions —— MCP 客户端/服务端桥接。
 *
 * 有状态连接模型：
 *   mcp_connect         建立长连接，返回 clientId（连接池常驻）
 *   mcp_list_tools      用 clientId 列出工具
 *   mcp_call_tool       用 clientId 调用工具
 *   mcp_disconnect      用 clientId 主动关闭连接
 *   mcp_create_server   根据工具定义生成独立 MCP server 文件
 *
 * 连接复用：mcp_connect 只握手一次；后续 list/call 用 clientId 直接操作，
 * 避免重复握手和重启 stdio 子进程。
 */
'use strict';

const pool = require('./lib/connection-pool');
const { writeServerFile } = require('./lib/server-template');

/** 解析连接配置参数（兼容对象或 JSON 字符串） */
function parseConnConfig(args) {
  let cfg = args.config || args.connection;
  if (typeof cfg === 'string') {
    try {
      cfg = JSON.parse(cfg);
    } catch {
      throw new Error('config 不是合法 JSON');
    }
  }
  if (!cfg || typeof cfg !== 'object') throw new Error('缺少 config 连接配置');
  return cfg;
}

/** 从 args 里解析 tools 定义（兼容数组或 JSON 字符串） */
function parseTools(args) {
  let tools = args.tools;
  if (typeof tools === 'string') {
    try {
      tools = JSON.parse(tools);
    } catch {
      throw new Error('tools 不是合法 JSON 数组');
    }
  }
  if (!Array.isArray(tools)) throw new Error('tools 必须是数组');
  return tools;
}

/** 把 listTools 结果裁剪成精简可读结构 */
function summarizeTools(tools) {
  return (tools || []).map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || null,
  }));
}

/** 把 callTool 结果规整为 { content, isError, text } */
function summarizeCallResult(result) {
  if (!result) return { content: [], isError: false, text: '' };
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((c) => (c && c.type === 'text' ? c.text : JSON.stringify(c)))
    .join('\n');
  return {
    content,
    isError: Boolean(result.isError),
    text,
    structuredContent: result.structuredContent,
  };
}

module.exports = (t) => [
  {
    name: 'mcp_connect',
    label: t('action.connect.label', 'MCP Connect'),
    category: t('category', 'MCP Bridge'),
    icon: 'Plug',
    description: t(
      'action.connect.description',
      'Connect to an MCP server (stdio or http) and return a clientId for reuse.',
    ),
    properties: [
      {
        key: 'config',
        label: t('field.config.label', 'Connection Config'),
        type: 'textarea',
        dataType: 'object',
        required: true,
        tooltip: t(
          'field.config.tooltip',
          'JSON object. stdio: {transport:"stdio",command,args,env}. http: {transport:"http",url,headers}.',
        ),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object' },
    ],
    run: async (ctx, args) => {
      const cfg = parseConnConfig(args);
      ctx.logger.info(`mcp_connect: transport=${cfg.transport || (cfg.url ? 'http' : 'stdio')}`);
      try {
        const { clientId, serverInfo } = await pool.create(cfg);
        const serverName = (serverInfo && serverInfo.serverInfo && serverInfo.serverInfo.name) || 'mcp-server';
        return {
          success: true,
          message: t('message.connected', 'Connected: {name} (clientId={clientId})')
            .replace('{name}', serverName)
            .replace('{clientId}', clientId),
          data: {
            clientId,
            serverInfo: serverInfo && serverInfo.serverInfo,
            protocolVersion: serverInfo && serverInfo.protocolVersion,
          },
        };
      } catch (err) {
        return { success: false, message: `连接失败: ${err.message}` };
      }
    },
  },

  {
    name: 'mcp_list_tools',
    label: t('action.listTools.label', 'MCP List Tools'),
    category: t('category', 'MCP Bridge'),
    icon: 'List',
    description: t(
      'action.listTools.description',
      'List tools of a connected MCP server by clientId.',
    ),
    properties: [
      {
        key: 'clientId',
        label: t('field.clientId.label', 'Client ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.clientId.tooltip', 'Returned by mcp_connect.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object' },
    ],
    run: async (ctx, args) => {
      const clientId = args.clientId;
      ctx.logger.info(`mcp_list_tools: clientId=${clientId}`);
      try {
        const { client } = pool.get(clientId);
        const tools = await client.listTools();
        return {
          success: true,
          message: t('message.toolsCount', 'Found {count} tools.').replace('{count}', tools.length),
          data: { count: tools.length, tools: summarizeTools(tools) },
        };
      } catch (err) {
        return { success: false, message: `列出工具失败: ${err.message}` };
      }
    },
  },

  {
    name: 'mcp_call_tool',
    label: t('action.callTool.label', 'MCP Call Tool'),
    category: t('category', 'MCP Bridge'),
    icon: 'Wrench',
    description: t(
      'action.callTool.description',
      'Call a tool of a connected MCP server by clientId.',
    ),
    properties: [
      {
        key: 'clientId',
        label: t('field.clientId.label', 'Client ID'),
        type: 'text',
        dataType: 'string',
        required: true,
      },
      {
        key: 'toolName',
        label: t('field.toolName.label', 'Tool Name'),
        type: 'text',
        dataType: 'string',
        required: true,
      },
      {
        key: 'arguments',
        label: t('field.arguments.label', 'Tool Arguments'),
        type: 'textarea',
        dataType: 'object',
        tooltip: t('field.arguments.tooltip', 'JSON object of arguments, e.g. {"key":"value"}.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object' },
    ],
    run: async (ctx, args) => {
      const clientId = args.clientId;
      const toolName = args.toolName;
      if (!toolName) return { success: false, message: '缺少 toolName' };
      let toolArgs = args.arguments;
      if (typeof toolArgs === 'string') {
        try {
          toolArgs = JSON.parse(toolArgs);
        } catch {
          return { success: false, message: 'arguments 不是合法 JSON' };
        }
      }
      toolArgs = toolArgs || {};

      ctx.logger.info(`mcp_call_tool: clientId=${clientId} tool=${toolName}`);
      try {
        const { client } = pool.get(clientId);
        const result = await client.callTool(toolName, toolArgs);
        const summary = summarizeCallResult(result);
        return {
          success: !summary.isError,
          message: summary.isError
            ? t('message.toolError', 'Tool returned error.')
            : t('message.toolDone', 'Tool call succeeded.'),
          data: summary,
        };
      } catch (err) {
        return { success: false, message: `调用工具失败: ${err.message}` };
      }
    },
  },

  {
    name: 'mcp_disconnect',
    label: t('action.disconnect.label', 'MCP Disconnect'),
    category: t('category', 'MCP Bridge'),
    icon: 'Unplug',
    description: t(
      'action.disconnect.description',
      'Close and release an MCP connection by clientId.',
    ),
    properties: [
      {
        key: 'clientId',
        label: t('field.clientId.label', 'Client ID'),
        type: 'text',
        dataType: 'string',
        required: true,
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      const clientId = args.clientId;
      ctx.logger.info(`mcp_disconnect: clientId=${clientId}`);
      const ok = pool.close(clientId);
      return {
        success: ok,
        message: ok
          ? t('message.disconnected', 'Disconnected: {clientId}').replace('{clientId}', clientId)
          : t('message.notConnected', 'No such clientId or already closed.'),
      };
    },
  },

  {
    name: 'mcp_create_server',
    label: t('action.createServer.label', 'MCP Create Server'),
    category: t('category', 'MCP Bridge'),
    icon: 'Server',
    description: t(
      'action.createServer.description',
      'Generate a standalone MCP server file from tool definitions. Resulting file can be launched with `node <file>`.',
    ),
    properties: [
      {
        key: 'serverName',
        label: t('field.serverName.label', 'Server Name'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.serverName.tooltip', 'MCP serverInfo.name. Default: mcp-bridge-server.'),
      },
      {
        key: 'tools',
        label: t('field.tools.label', 'Tool Definitions'),
        type: 'textarea',
        dataType: 'object[]',
        required: true,
        tooltip: t(
          'field.tools.tooltip',
          'JSON array. Each tool: {name, description, inputSchema, handlerSource}. handlerSource is a JS function body that receives `args`.',
        ),
      },
      {
        key: 'filePath',
        label: t('field.filePath.label', 'Output File Path'),
        type: 'text',
        dataType: 'string',
        tooltip: t(
          'field.filePath.tooltip',
          'Absolute path to write the server file. If empty, writes to temp dir.',
        ),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object' },
    ],
    run: async (ctx, args) => {
      const serverName = args.serverName || 'mcp-bridge-server';
      const tools = parseTools(args);
      ctx.logger.info(`mcp_create_server: ${serverName}, tools=${tools.length}`);

      try {
        const filePath = writeServerFile(serverName, tools, args.filePath || '');
        return {
          success: true,
          message: t('message.serverCreated', 'Server file created: {path}').replace('{path}', filePath),
          data: {
            filePath,
            serverName,
            toolsCount: tools.length,
            // 给 Claude Desktop / Cursor 用的连接配置示例
            connectHint: {
              command: 'node',
              args: [filePath],
            },
          },
        };
      } catch (err) {
        return { success: false, message: `创建 server 失败: ${err.message}` };
      }
    },
  },
];
