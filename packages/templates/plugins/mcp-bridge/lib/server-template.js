/**
 * server-template —— 生成一个独立的 MCP server（stdio）入口文件内容。
 *
 * 生成的 server 完全自包含：仅用 Node 内置模块，不依赖 @modelcontextprotocol/sdk。
 * 用户通过 mcp_create_server 提供 tools 列表（每个工具含
 * name / description / inputSchema / handlerSource），这里把它编译成一个可执行 .js 文件。
 *
 * 可被 Cursor / Claude Desktop 等 MCP 客户端通过
 *   "command": "node", "args": ["<生成的文件>"]
 * 连接。
 *
 * handler 设计：handlerSource 是 JS 函数体字符串（接收 args 参数），
 * 运行时用 new Function('args', source) 构造，避免正则注入与闭包序列化问题。
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const HEADER = `#!/usr/bin/env node
/* eslint-disable */
// 由 agent-spaces mcp-bridge 生成的独立 MCP server（stdio, JSON-RPC 2.0）。
'use strict';
const readline = require('readline');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: {{SERVER_NAME}}, version: '1.0.0' };

// 每个工具的元数据（JSON 安全）+ handlerSource（函数体字符串，运行时构造）
const TOOLS = {{TOOLS_JSON}};

// 把 handlerSource 编译成函数，缓存到 tool 对象上
for (const t of TOOLS) {
  if (t.handlerSource) {
    try {
      // eslint-disable-next-line no-new-func
      t._handler = new Function('args', t.handlerSource);
    } catch (e) {
      process.stderr.write('[mcp-server] handler compile error for ' + t.name + ': ' + e.message + '\\n');
      t._handler = null;
    }
  }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!msg || msg.jsonrpc !== '2.0') return;
  handle(msg).catch((err) => {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: err && err.message ? err.message : String(err) } });
  });
});

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // 通知，暂不处理

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (method === 'tools/list') {
    const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    send({ jsonrpc: '2.0', id, result: { tools } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) { send({ jsonrpc: '2.0', id, error: { code: -32602, message: '未知工具: ' + name } }); return; }
    const args = (params && params.arguments) || {};
    let result;
    if (tool._handler) {
      result = await tool._handler(args);
    } else {
      result = { content: [{ type: 'text', text: JSON.stringify(args) }] };
    }
    // 规范化：缺 content 则补
    if (!result || !result.content) {
      result = { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }], isError: false };
    }
    send({ jsonrpc: '2.0', id, result: result });
    return;
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: '未知方法: ' + method } });
}

process.stderr.write('[mcp-server] started, tools=' + TOOLS.length + '\\n');
`;

/** 生成 server 入口文件内容 */
function buildServerSource(serverName, tools) {
  const safeName = JSON.stringify(serverName || 'mcp-bridge-server');
  const toolsForTemplate = (tools || []).map((t) => ({
    name: String(t.name),
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {}, required: [] },
    // handlerSource 必须是字符串函数体；非字符串则置空（回退到 echo args）
    handlerSource:
      typeof t.handlerSource === 'string'
        ? t.handlerSource
        : typeof t.handler === 'string'
          ? t.handler
          : '',
  }));
  const toolsJson = JSON.stringify(toolsForTemplate, null, 2);
  return HEADER.replace('{{SERVER_NAME}}', safeName).replace('{{TOOLS_JSON}}', toolsJson);
}

/**
 * 将 server 写入文件。
 * @param serverName
 * @param tools
 * @param filePath 可选；默认写到 os.tmpdir()
 * @returns 文件绝对路径
 */
function writeServerFile(serverName, tools, filePath) {
  const source = buildServerSource(serverName, tools);
  const target = filePath || path.join(os.tmpdir(), `mcp-server-${Date.now()}.js`);
  fs.writeFileSync(target, source, 'utf-8');
  return target;
}

/** 内联启动生成的 server（子进程），主要用于 bridge 自测 */
function spawnServerFile(filePath) {
  const child = spawn(process.execPath, [filePath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  return {
    child,
    close: () => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    },
  };
}

module.exports = { buildServerSource, writeServerFile, spawnServerFile };
