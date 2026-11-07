// WS execution channel handlers — register workflow execution control events

import type { WebSocket } from 'ws';
import { getClientId } from './connection-manager.js';
import type { ExecutionManager } from '../services/execution-manager.js';
import { registerHandler } from './handler.js';

export function registerExecutionChannels(executionManager: ExecutionManager): void {
  registerHandler('workflow:execute', async (ws, workspaceId, data) => {
    const clientId = getClientId(ws);
    if (!clientId) return;
    try {
      const result = await executionManager.execute(data as any, clientId, (channel, payload) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ event: channel, data: payload }));
        }
      }, workspaceId);
      ws.send(JSON.stringify({
        event: 'workflow:execute:result',
        data: result,
      }));
    } catch (err: any) {
      ws.send(JSON.stringify({
        event: 'workflow:execute:error',
        data: { error: err.message || String(err) },
      }));
    }
  });

  registerHandler('workflow:pause', (ws, _workspaceId, data) => {
    const { executionId } = data as { executionId: string };
    if (!executionId) return;
    try {
      const result = executionManager.pause(executionId);
      ws.send(JSON.stringify({ event: 'workflow:pause:result', data: result }));
    } catch (err: any) {
      ws.send(JSON.stringify({ event: 'workflow:pause:error', data: { error: err.message } }));
    }
  });

  registerHandler('workflow:resume', async (ws, _workspaceId, data) => {
    const { executionId } = data as { executionId: string };
    if (!executionId) return;
    try {
      const result = await executionManager.resume(executionId);
      ws.send(JSON.stringify({ event: 'workflow:resume:result', data: result }));
    } catch (err: any) {
      ws.send(JSON.stringify({ event: 'workflow:resume:error', data: { error: err.message } }));
    }
  });

  registerHandler('workflow:stop', (ws, _workspaceId, data) => {
    const { executionId } = data as { executionId: string };
    if (!executionId) return;
    try {
      const result = executionManager.stop(executionId);
      ws.send(JSON.stringify({ event: 'workflow:stop:result', data: result }));
    } catch (err: any) {
      ws.send(JSON.stringify({ event: 'workflow:stop:error', data: { error: err.message } }));
    }
  });

  registerHandler('workflow:debug-node', async (ws, workspaceId, data) => {
    const clientId = getClientId(ws);
    if (!clientId) return;
    try {
      const payload = data as {
        workflowId?: string;
        nodeId?: string;
        embeddedNode?: { data?: { knowledgeBase?: unknown } };
        snapshot?: { nodes?: Array<{ id?: string; data?: { knowledgeBase?: unknown } }> };
      };
      const snapshotNode = payload.snapshot?.nodes?.find((node) => node.id === payload.nodeId);
      const kbId = payload.embeddedNode?.data?.knowledgeBase ?? snapshotNode?.data?.knowledgeBase ?? '';
      console.info(
        `[workflow:debug-node] workspaceId=${workspaceId} workflowId=${payload.workflowId ?? ''} nodeId=${payload.nodeId ?? ''} kbId=${String(kbId)}`,
      );
      const result = await executionManager.debugNode(data as any, clientId, workspaceId);
      ws.send(JSON.stringify({ event: 'workflow:debug-node:result', data: result }));
    } catch (err: any) {
      ws.send(JSON.stringify({ event: 'workflow:debug-node:error', data: { error: err.message } }));
    }
  });

  registerHandler('workflow:get-execution-recovery', (ws, _workspaceId, data) => {
    const clientId = getClientId(ws);
    if (!clientId) return;
    try {
      const result = executionManager.getExecutionRecovery(data as any, clientId);
      ws.send(JSON.stringify({ event: 'workflow:get-execution-recovery:result', data: result }));
    } catch (err: any) {
      ws.send(JSON.stringify({ event: 'workflow:get-execution-recovery:error', data: { error: err.message } }));
    }
  });
}
