/**
 * workflow-executor —— 通过 WebSocket 真实执行工作流。
 *
 * 背景：SDK 的 workflow.execute 打到 /api/workflows/:id/execute（SSE），
 * 但服务器未实现该路由（被 Next.js 兜底返回 HTML）。
 * 服务器真实执行入口是 WebSocket 的 workflow:execute 事件（ws/execution-channels.ts）。
 * 本模块补齐这个缺口，让 MCP 的 workflow_execute 能真实跑工作流。
 *
 * 协议：
 *   连接：ws://host/ws?workspaceId=xxx&token=xxx
 *   发送：{ event: 'workflow:execute', data: { workflowId, input, ... } }
 *   接收：流式 { event: <channel>, data: <payload> } ... 直到 { event: 'workflow:execute:result', data }
 */

import WebSocket from 'ws';

export interface WorkflowExecConfig {
  /** WebSocket 基地址，如 ws://127.0.0.1:3100/ws（若给 http(s):// 会自动转 ws(s)://） */
  baseUrl: string;
  /** 鉴权 token（服务器 secret；secret 未设置时传空串） */
  token: string;
  /**
   * 工作区 ID —— 仅用于建立 WS 连接握手（服务器 /ws 端点要求）。
   * 与工作流执行本身无关：工作流不绑定 workspace，执行只依赖 workflowId。
   */
  workspaceId: string;
}

export interface WorkflowExecInput {
  workflowId: string;
  /** 工作流开始节点的输入 */
  input?: Record<string, unknown>;
  /** 可选：从指定节点开始 */
  startNodeId?: string;
  /** 可选：快照覆盖 */
  snapshot?: { nodes: unknown[]; edges: unknown[]; groups?: unknown[] };
}

export interface WorkflowExecResult {
  success: boolean;
  /** 聚合的流式事件（节点进度等） */
  events: Array<{ event: string; data: unknown }>;
  /** 最终执行结果（workflow:execute:result 的 data） */
  result?: unknown;
  /** 执行错误 */
  error?: string;
  /** 耗时 ms */
  durationMs: number;
}

function toWsUrl(baseUrl: string): string {
  let url = baseUrl.replace(/\/$/, '');
  if (url.startsWith('http://')) url = 'ws://' + url.slice(7);
  else if (url.startsWith('https://')) url = 'wss://' + url.slice(8);
  else if (!url.startsWith('ws://') && !url.startsWith('wss://')) url = 'ws://' + url;
  // 确保以 /ws 结尾
  if (!url.endsWith('/ws')) url = url + '/ws';
  return url;
}

/**
 * 执行工作流并等待完成（聚合流式事件）。
 * 超时默认 120s（与服务器 SSE 超时对齐）。
 */
export function executeWorkflowViaWs(
  config: WorkflowExecConfig,
  input: WorkflowExecInput,
  timeoutMs = 120_000,
): Promise<WorkflowExecResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const events: Array<{ event: string; data: unknown }> = [];
    const wsUrl = `${toWsUrl(config.baseUrl)}?workspaceId=${encodeURIComponent(config.workspaceId)}&token=${encodeURIComponent(config.token)}`;

    let settled = false;
    const finish = (r: WorkflowExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    const timer = setTimeout(() => {
      finish({
        success: false,
        events,
        error: `执行超时（${timeoutMs}ms）`,
        durationMs: Date.now() - startedAt,
      });
    }, timeoutMs);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      finish({
        success: false,
        events,
        error: `WS 连接失败: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    ws.on('error', (err) => {
      finish({
        success: false,
        events,
        error: `WS 错误: ${err.message}`,
        durationMs: Date.now() - startedAt,
      });
    });

    ws.on('close', (code, reason) => {
      // 非正常关闭且未收到 result
      if (!settled && code !== 1000) {
        finish({
          success: false,
          events,
          error: `WS 关闭: ${code} ${reason?.toString() || ''}`,
          durationMs: Date.now() - startedAt,
        });
      }
    });

    ws.on('message', (raw) => {
      let msg: { event?: string; data?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const { event, data } = msg;

      // 收到 connected 后发送执行请求
      if (event === 'connected') {
        ws.send(
          JSON.stringify({
            event: 'workflow:execute',
            data: {
              workflowId: input.workflowId,
              input: input.input || {},
              ...(input.startNodeId ? { startNodeId: input.startNodeId } : {}),
              ...(input.snapshot ? { snapshot: input.snapshot } : {}),
            },
          }),
        );
        return;
      }

      // workflow:execute:result 在 status=running 时就发，仅记录不结束
      if (event === 'workflow:execute:result') {
        events.push({ event, data });
        return;
      }

      // 真正的执行完成（ExecutionManager 发出）
      if (event === 'workflow:completed') {
        finish({
          success: true,
          events,
          result: data,
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      // 执行错误
      if (event === 'workflow:error' || event === 'workflow:execute:error') {
        finish({
          success: false,
          events,
          error:
            typeof data === 'object' && data && 'error' in data
              ? String((data as { error: unknown }).error)
              : typeof data === 'string'
                ? data
                : '执行错误',
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      // 其余事件作为进度记录
      events.push({ event: event || 'unknown', data });
    });
  });
}
