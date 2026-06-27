/**
 * registry —— 把 @agent-spaces/sdk 的全部模块/方法，运行时反射为 MCP tools。
 *
 * 设计要点：
 * - 零维护：遍历 sdk 对象，SDK 增删方法时本文件无需改动，永不漏方法。
 * - 每个 tool 名 = `${模块}_${方法}`（如 workspace_list、git_commit）。
 * - 参数序列化：调用方传 { arg0, arg1, ... }，按序 spread 成 fn(arg0, arg1, ...)。
 *   其中 argN 若为 JSON 字符串则尝试解析为对象（兼容 SDK 的 object 参数，如 task.create(wsId, {title})）。
 * - 特殊方法（SSE 流 / 文件上传 / 原始响应）单独处理，见 SPECIAL_* 表。
 */

import type { SDK } from '@agent-spaces/sdk';

/** MCP tool 定义 */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  /** 执行器：接收解析后的 args，返回任意可序列化结果 */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** 非模块的 sdk 顶层键（跳过） */
const SDK_TOP_LEVEL_SKIP = new Set(['http', 'setDebug', 'updateConfig']);

/** 形参名 → JSON Schema 类型推断 */
function paramTypeHint(name: string): string {
  const lower = name.toLowerCase();
  if (/^(opts|options|data|body|config|updates?|state|query|settings|input|entries|nodes|messages|content|value|files?|formData)$/.test(lower)) return 'object';
  if (/^(id|wsid|workspaceid|issueid|taskid|channelid|kbid|fileid|msgid|agentid|sessionid|workflowid|pluginid|versionid|logid|worktreeid|databaseid|subscriptionid|robotid|fontid|speechid|notificationid|modelid|providerid|embeddingid|userid|favoriteid|commandid|hookname|pluginid)$/.test(lower)) return 'string';
  if (lower === 'limit' || lower === 'days') return 'number';
  if (/^(enabled|force|stage)$/.test(lower)) return 'boolean';
  return 'string';
}

/**
 * 已知需要特殊处理的方法（模块名_方法名 → 类型标记）。
 * 这些在运行时无法仅凭反射判断（返回值是流/FormData/Blob），故显式登记。
 */
const SPECIAL_STREAM = new Set([
  'miniApp_agentChat',
  'workflow_execute',
  'workspace_cloneSse',
]);
const SPECIAL_UPLOAD = new Set([
  'avatar_upload',
  'channel_uploadAttachment',
  'data_importZip',
  'data_importPreview',
  'font_upload',
  'knowledgeBase_uploadFile',
  'miniApp_uploadFiles',
]);
const SPECIAL_RAW_RESPONSE = new Set([
  'data_exportZip',
  'miniApp_exportZip',
  'worktree_diff',
]);

/** 把上传入参重构为 FormData。约定调用方传 { arg0: 主参数, _file: base64字符串 } */
function buildFormData(raw: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue; // _file 等元信息键
    fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  // _file: { name, type, data(base64) } 数组或单个
  const file = raw._file;
  const files = Array.isArray(file) ? file : file ? [file] : [];
  for (const f of files as Array<Record<string, string>>) {
    if (!f || typeof f !== 'object') continue;
    const buf = Buffer.from(f.data, 'base64');
    const blob = new Blob([buf], { type: f.type || 'application/octet-stream' });
    fd.append('file', blob, f.name || 'upload');
  }
  return fd;
}

/** 读取 SSE 流到结束，聚合为字符串 */
async function drainStream(response: unknown): Promise<string> {
  if (!(response instanceof Response)) return JSON.stringify(response);
  const reader = response.body?.getReader();
  if (!reader) return '';
  let acc = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += new TextDecoder().decode(value);
  }
  return acc;
}

/** 读取原始 Response（zip/binary）为 base64，便于在 MCP 文本通道里回传 */
async function rawToBase64(response: unknown): Promise<string> {
  if (!(response instanceof Response)) return String(response);
  const buf = Buffer.from(await response.arrayBuffer());
  return buf.toString('base64');
}

/** tool 名 → 自定义执行器（覆盖反射出的默认行为） */
export type ToolOverride = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * 从 SDK 实例反射出全部 MCP tools。
 * @param sdk 已配置好的 SDK 实例
 * @param overrides 按 tool 名覆盖执行逻辑（用于修补 SDK 与服务器契约不一致的方法）
 * @returns tool 定义数组
 */
export function buildToolRegistry(sdk: SDK, overrides: Record<string, ToolOverride> = {}): McpToolDef[] {
  const tools: McpToolDef[] = [];

  for (const [moduleName, mod] of Object.entries(sdk)) {
    if (SDK_TOP_LEVEL_SKIP.has(moduleName)) continue;
    if (typeof mod !== 'object' || mod === null) continue;

    for (const [methodName, fn] of Object.entries(mod)) {
      if (typeof fn !== 'function') continue;

      const toolName = `${moduleName}_${methodName}`;
      const arity = fn.length;

      // ---- 构建 inputSchema ----
      // required 策略：仅 arg0（主键）必填，arg1+ 视为可选。
      // 原因：SDK 大量方法有可选尾部参数（如 workflow.execute(id, body?)），
      // 运行时无法可靠区分，但 arg0 几乎总是 workspaceId/appId 等主键，必填合理。
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];
      for (let i = 0; i < arity; i++) {
        const key = `arg${i}`;
        const paramName = tryGetParamName(fn, i) || key;
        properties[key] = {
          type: paramTypeHint(paramName),
          description: `参数 ${i + 1}（SDK 原参名: ${paramName}）${i === 0 ? ' · 必填' : ''}`,
        };
        if (i === 0) required.push(key);
      }

      const isStream = SPECIAL_STREAM.has(toolName);
      const isUpload = SPECIAL_UPLOAD.has(toolName);
      const isRaw = SPECIAL_RAW_RESPONSE.has(toolName);

      let description = `[${moduleName}.${methodName}] 调用 @agent-spaces/sdk`;
      if (isStream) description += '（流式响应，已聚合为完整文本）';
      if (isUpload) description += '（文件上传：传 _file=[{name,type,data:base64}]）';
      if (isRaw) description += '（二进制响应，已转 base64）';

      tools.push({
        name: toolName,
        description,
        inputSchema: {
          type: 'object',
          properties,
          required,
        },
        execute: async (args) => {
          // ---- 优先使用 override（修补 SDK/服务器契约不一致的方法） ----
          if (overrides[toolName]) {
            return overrides[toolName](args);
          }
          // ---- 按序提取位置参数 ----
          const positional: unknown[] = [];
          for (let i = 0; i < arity; i++) {
            const key = `arg${i}`;
            let v = args[key];
            // 字符串形式的 object 参数尝试 JSON 解析（task.create(wsId, "{...}") 的情况）
            if (typeof v === 'string' && v.trim().startsWith('{')) {
              try {
                v = JSON.parse(v);
              } catch {
                /* 保留原字符串 */
              }
            } else if (typeof v === 'string' && v.trim().startsWith('[')) {
              try {
                v = JSON.parse(v);
              } catch {
                /* 保留原字符串 */
              }
            }
            positional.push(v);
          }

          // ---- 调用 ----
          let result: unknown;
          if (isUpload) {
            // 上传方法：最后一个 FormData 参数由 buildFormData 重建
            const formDataIdx = positional.length - 1;
            positional[formDataIdx] = buildFormData(args);
            result = await (fn as (...a: unknown[]) => unknown)(...positional);
          } else {
            result = await (fn as (...a: unknown[]) => unknown)(...positional);
          }

          // ---- 后处理 ----
          if (isStream) return drainStream(result);
          if (isRaw) return rawToBase64(result);
          return result;
        },
      });
    }
  }

  return tools;
}

/**
 * 尝试从函数源码读取第 idx 个形参名（用于描述/类型推断）。
 * 利用 Function.prototype.toString 解析；失败返回 ''。
 */
function tryGetParamName(fn: Function, idx: number): string {
  try {
    const src = fn.toString();
    // 匹配参数列表：箭头函数 (a, b) => 或 function name(a, b) {
    const m = src.match(/\(([^)]*)\)/);
    if (!m) return '';
    const params = m[1]
      .split(',')
      .map((p) => p.trim().split(/[:=]/)[0].trim()) // 去类型注解与默认值
      .filter(Boolean);
    return params[idx] || '';
  } catch {
    return '';
  }
}

/** 仅用于测试：返回期望的 tool 名集合（基线），便于红绿灯测试比对 */
export function listExpectedToolNames(sdk: SDK): string[] {
  const names: string[] = [];
  for (const [moduleName, mod] of Object.entries(sdk)) {
    if (SDK_TOP_LEVEL_SKIP.has(moduleName)) continue;
    if (typeof mod !== 'object' || mod === null) continue;
    for (const [methodName, fn] of Object.entries(mod)) {
      if (typeof fn === 'function') names.push(`${moduleName}_${methodName}`);
    }
  }
  return names.sort();
}
