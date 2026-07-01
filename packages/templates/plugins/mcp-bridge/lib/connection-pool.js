/**
 * connection-pool —— MCP 客户端连接池（进程内常驻）。
 *
 * 背景：mcp_connect 建立连接后返回 clientId，后续 mcp_list_tools /
 * mcp_call_tool 用 clientId 复用同一连接，避免每次重复握手和重启 stdio 子进程。
 *
 * 依赖 require 缓存：本模块被 actions.js 多次 require 只初始化一次，
 * Map 状态在整个插件（server 进程）生命周期内持久。
 */
'use strict';

const crypto = require('crypto');
const { connect } = require('./mcp-client');

/** clientId -> { client, config, serverInfo, createdAt } */
const pool = new Map();

/**
 * 建立连接并握手，存入池。
 * @param {object} config 连接配置（stdio / http）
 * @returns {Promise<{clientId:string, client:object, serverInfo:object}>}
 */
async function create(config) {
  const client = connect(config);
  const serverInfo = await client.initialize(); // 失败抛出，由调用方处理
  const clientId = crypto.randomUUID();
  pool.set(clientId, {
    client,
    config,
    serverInfo,
    createdAt: Date.now(),
  });
  return { clientId, client, serverInfo };
}

/** 取连接，不存在抛错 */
function get(clientId) {
  const entry = pool.get(clientId);
  if (!entry) throw new Error(`无效或已关闭的 clientId: ${clientId || '(空)'}`);
  return entry;
}

/** 仅查询信息（不抛错，返回 undefined） */
function getInfo(clientId) {
  return pool.get(clientId);
}

/** 关闭并移除单个连接 */
function close(clientId) {
  const entry = pool.get(clientId);
  if (!entry) return false;
  try {
    entry.client.close();
  } catch {
    /* ignore */
  }
  pool.delete(clientId);
  return true;
}

/** 关闭全部连接（deactivate 时调用） */
function closeAll() {
  for (const entry of pool.values()) {
    try {
      entry.client.close();
    } catch {
      /* ignore */
    }
  }
  pool.clear();
}

/** 列出当前活跃连接（调试用） */
function list() {
  return Array.from(pool.entries()).map(([id, e]) => ({
    clientId: id,
    transport: e.client.transport,
    serverName: e.serverInfo && e.serverInfo.serverInfo && e.serverInfo.serverInfo.name,
    createdAt: e.createdAt,
  }));
}

module.exports = { create, get, getInfo, close, closeAll, list };
