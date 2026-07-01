/**
 * mcp-client —— 轻量 MCP（Model Context Protocol）客户端，零外部依赖。
 *
 * 仅使用 Node 内置模块（child_process / net / http / https），不引入
 * @modelcontextprotocol/sdk，保证插件可移植、自包含。
 *
 * 协议：JSON-RPC 2.0 over stdio（按行分隔）或 Streamable HTTP。
 * 兼容 2024-11-05 / 2025-06-18 两个常见 protocolVersion。
 *
 * 对外接口：
 *   connect(options)        建立连接（stdio | http），返回 client 实例
 *   client.listTools()      返回工具列表
 *   client.callTool(name, args)
 *   client.close()          断开
 */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'agent-spaces-mcp-bridge', version: '1.0.0' };

let _idCounter = 0;
function nextId() {
  return ++_idCounter;
}

/** 解析 JSON-RPC 响应，返回 { result } 或抛出 { message, code, data } */
function parseJsonRpc(msg) {
  if (msg && msg.error) {
    const err = new Error(msg.error.message || 'JSON-RPC error');
    err.code = msg.error.code;
    err.data = msg.error.data;
    throw err;
  }
  if (msg && typeof msg === 'object' && 'result' in msg) return msg.result;
  // 通知或无 id 的消息
  return msg;
}

/** stdio transport：spawn 一个 MCP server 子进程，通过 stdin/stdout 收发 JSON-RPC */
function createStdioClient(config) {
  const { command, args = [], env = {}, cwd } = config;
  if (!command) throw new Error('stdio 连接需要 command 参数');

  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    cwd: cwd || undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const pending = new Map(); // id -> { resolve, reject }
  let buf = '';
  let initialized = false;
  let closed = false;
  let stderrBuf = '';

  function handleLine(line) {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // 非 JSON 行忽略（server 日志等）
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      try {
        resolve(parseJsonRpc(msg));
      } catch (err) {
        reject(err);
      }
    }
    // 无 id 的通知（notifications/*）当前不处理
  }

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      handleLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });

  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk;
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
  });

  child.on('error', (err) => {
    closed = true;
    const e = new Error(`启动 MCP server 失败: ${err.message}`);
    for (const { reject } of pending.values()) reject(e);
    pending.clear();
  });

  child.on('close', (code) => {
    closed = true;
    if (!initialized || code !== 0) {
      const e = new Error(
        `MCP server 进程退出 (code=${code})。stderr:\n${stderrBuf.slice(-2048)}`,
      );
      for (const { reject } of pending.values()) reject(e);
      pending.clear();
    }
  });

  function send(request) {
    return new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error('连接已关闭'));
        return;
      }
      const id = nextId();
      const payload = JSON.stringify({ jsonrpc: '2.0', id, ...request });
      pending.set(id, { resolve, reject });
      try {
        child.stdin.write(payload + '\n');
      } catch (err) {
        pending.delete(id);
        reject(new Error(`写入失败: ${err.message}`));
      }
    });
  }

  async function initialize() {
    const result = await send({
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    });
    // 发送 initialized 通知（无 id）
    if (!closed) {
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
      );
    }
    initialized = true;
    return result;
  }

  async function listTools() {
    const result = await send({ method: 'tools/list', params: {} });
    return (result && result.tools) || [];
  }

  async function callTool(name, toolArgs = {}) {
    const result = await send({
      method: 'tools/call',
      params: { name, arguments: toolArgs },
    });
    return result;
  }

  function close() {
    closed = true;
    try {
      child.stdin.end();
    } catch {
      /* ignore */
    }
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }

  return { initialize, listTools, callTool, close, transport: 'stdio' };
}

/** http / Streamable HTTP transport：单 endpoint POST JSON-RPC */
function createHttpClient(config) {
  const { url, headers = {} } = config;
  if (!url) throw new Error('http 连接需要 url 参数');

  const lib = url.startsWith('https:') ? https : http;
  const baseHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers };

  function post(body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = lib.request(
        url,
        { method: 'POST', headers: { ...baseHeaders, 'Content-Length': Buffer.byteLength(data) } },
        (res) => {
          let raw = '';
          res.setEncoding('utf-8');
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 512)}`));
              return;
            }
            resolve(parseResponseBody(raw, body.id));
          });
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // 兼容普通 JSON 与 SSE（event-stream）两种返回
  function parseResponseBody(raw, expectedId) {
    const ct = raw.trim();
    if (!ct) return null;
    // SSE：逐 data: 行
    if (/^data:\s/m.test(raw) || raw.startsWith('event:')) {
      const lines = raw.split('\n');
      const dataLines = [];
      for (const ln of lines) {
        const m = ln.match(/^data:\s?(.*)$/);
        if (m) dataLines.push(m[1]);
      }
      if (!dataLines.length) return null;
      // 取第一个匹配 id 的 JSON-RPC 响应
      for (const dl of dataLines) {
        try {
          const msg = JSON.parse(dl);
          if (msg.id === expectedId) return parseJsonRpc(msg);
        } catch {
          /* skip */
        }
      }
      try {
        return parseJsonRpc(JSON.parse(dataLines[dataLines.length - 1]));
      } catch {
        return null;
      }
    }
    try {
      return parseJsonRpc(JSON.parse(raw));
    } catch {
      return raw;
    }
  }

  async function initialize() {
    return post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    });
  }

  async function listTools() {
    const result = await post({ jsonrpc: '2.0', id: nextId(), method: 'tools/list', params: {} });
    return (result && result.tools) || [];
  }

  async function callTool(name, toolArgs = {}) {
    return post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/call',
      params: { name, arguments: toolArgs },
    });
  }

  function close() {
    /* http 无状态，无需关闭 */
  }

  return { initialize, listTools, callTool, close, transport: 'http' };
}

/**
 * 建立连接。config 形如：
 *   stdio: { transport: 'stdio', command, args, env, cwd }
 *   http : { transport: 'http', url, headers }
 */
function connect(config) {
  const transport = (config.transport || (config.url ? 'http' : 'stdio')).toLowerCase();
  if (transport === 'http') return createHttpClient(config);
  return createStdioClient(config);
}

module.exports = { connect, PROTOCOL_VERSION };
