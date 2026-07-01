/**
 * mcp-bridge actions —— MCP 客户端/服务端桥接。
 *
 * 4 个 action，一一对应需求：
 *   mcp_connect         连接一个 MCP（stdio 或 http），返回握手信息
 *   mcp_list_tools      连接 MCP 并列出工具
 *   mcp_call_tool       连接 MCP 并调用指定工具
 *   mcp_create_server   根据工具定义生成一个独立 MCP server 文件
 *
 * 设计：每次调用即时建立连接并关闭，不在插件进程长期持有 client。
 * 原因：MCP server 多为 stdio 子进程，长驻会占用资源；按需连接更稳。
 */
'use strict';

const { connect } = require('./lib/mcp-client');
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
      'Connect to an MCP server (stdio or http) and return the handshake info.',
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
      const client = connect(cfg);
      try {
        const info = await client.initialize();
        return {
          success: true,
          message: t('message.connected', 'Connected: {name}').replace(
            '{name}',
            (info && info.serverInfo && info.serverInfo.name) || 'mcp-server',
          ),
          data: {
            serverInfo: info && info.serverInfo,
            protocolVersion: info && info.protocolVersion,
            transport: client.transport,
          },
        };
      } catch (err) {
        return { success: false, message: `连接失败: ${err.message}` };
      } finally {
        client.close();
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
      'Connect to an MCP server and list its available tools.',
    ),
    properties: [
      {
        key: 'config',
        label: t('field.config.label', 'Connection Config'),
        type: 'textarea',
        dataType: 'object',
        required: true,
        tooltip: t('field.config.tooltip', 'Same as mcp_connect.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object' },
    ],
    run: async (ctx, args) => {
      const cfg = parseConnConfig(args);
      ctx.logger.info('mcp_list_tools: connecting');
      const client = connect(cfg);
      try {
        await client.initialize();
        const tools = await client.listTools();
        return {
          success: true,
          message: t('message.toolsCount', 'Found {count} tools.').replace(
            '{count}',
            tools.length,
          ),
          data: { count: tools.length, tools: summarizeTools(tools) },
        };
      } catch (err) {
        return { success: false, message: `列出工具失败: ${err.message}` };
      } finally {
        client.close();
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
      'Connect to an MCP server and call a specific tool with arguments.',
    ),
    properties: [
      {
        key: 'config',
        label: t('field.config.label', 'Connection Config'),
        type: 'textarea',
        dataType: 'object',
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
      const cfg = parseConnConfig(args);
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

      ctx.logger.info(`mcp_call_tool: ${toolName}`);
      const client = connect(cfg);
      try {
        await client.initialize();
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
      } finally {
        client.close();
      }
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
          message: t('message.serverCreated', 'Server file created: {path}').replace(
            '{path}',
            filePath,
          ),
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
