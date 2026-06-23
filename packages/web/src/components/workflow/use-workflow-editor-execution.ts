'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createErrorShape, getCompositeParentId, LOOP_BODY_NODE_TYPE, type ClientNodeRequest, type ExecutionLog, type InteractionRequest, type Workflow } from '@agent-spaces/shared';
import { executionLogApi } from '@/lib/workflow-api';
import { getWS } from '@/lib/ws';
import type { DebugResult } from './workflow-editor-types';
import {
  ORIGINAL_INPUT_FIELDS_KEY,
  ORIGINAL_OUTPUTS_KEY,
} from './workflow-execution-snapshot-fields';

interface UseWorkflowEditorExecutionParams {
  workflow: Workflow | null;
  workflowId: string | null;
  workspaceId?: string;
}

type ElectronApi = {
  clientPlugins?: {
    executeNode?: (pluginId: string, nodeType: string, args: Record<string, unknown>) => Promise<unknown>;
  };
};

function withOriginalIOFieldsSnapshot(workflow: Workflow): Workflow['nodes'] {
  return workflow.nodes.map((node) => {
    if (!Array.isArray(node.data?.inputFields) && !Array.isArray(node.data?.outputs)) return node;
    return {
      ...node,
      data: {
        ...node.data,
        ...(Array.isArray(node.data?.inputFields)
          ? { [ORIGINAL_INPUT_FIELDS_KEY]: JSON.parse(JSON.stringify(node.data.inputFields)) }
          : {}),
        ...(Array.isArray(node.data?.outputs)
          ? { [ORIGINAL_OUTPUTS_KEY]: JSON.parse(JSON.stringify(node.data.outputs)) }
          : {}),
      },
    };
  });
}

function getElectronApi(): ElectronApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as typeof window & { electronAPI?: ElectronApi }).electronAPI;
}

async function executeClientPluginNode(request: ClientNodeRequest): Promise<unknown> {
  const executeNode = getElectronApi()?.clientPlugins?.executeNode;
  if (!executeNode) throw new Error('当前客户端不支持 client 插件运行时');
  return executeNode(request.pluginId, request.nodeType, request.args || {});
}

export function useWorkflowEditorExecution({
  workflow, workflowId, workspaceId,
}: UseWorkflowEditorExecutionParams) {
  // ---- Execution state ----
  const [execStatus, setExecStatus] = useState('idle');
  const [executionLog, setExecutionLog] = useState<ExecutionLog | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [selectedExecutionLogId, setSelectedExecutionLogId] = useState<string | null>(null);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [pausedNodeId, setPausedNodeId] = useState<string | null>(null);
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [partialExecutionStartNodeId, setPartialExecutionStartNodeId] = useState<string | null>(null);
  const executionCleanupRef = useRef<(() => void)[]>([]);

  // ---- Debug state ----
  const [debugNodeId, setDebugNodeId] = useState<string | null>(null);
  const [debugStatus, setDebugStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<InteractionRequest | null>(null);
  const debugCleanupRef = useRef<(() => void)[]>([]);
  const getWorkflowWS = useCallback(() => workspaceId ? getWS(workspaceId) : null, [workspaceId]);

  // ---- Cleanup refs on unmount ----
  useEffect(() => {
    return () => {
      for (const cleanup of debugCleanupRef.current) cleanup();
      debugCleanupRef.current = [];
      for (const cleanup of executionCleanupRef.current) cleanup();
      executionCleanupRef.current = [];
    };
  }, []);

  // ---- Execution logs ----
  const loadExecutionLogs = useCallback(async () => {
    if (!workflowId) return;
    try {
      const logs = await executionLogApi.list(workflowId);
      setExecutionLogs(logs);
    } catch {
      setExecutionLogs([]);
    }
  }, [workflowId]);

  useEffect(() => {
    setExecutionLog(null);
    setExecutionLogs([]);
    setSelectedExecutionLogId(null);
    setCurrentExecutionId(null);
    setPausedNodeId(null);
    setPausedReason(null);
    setPartialExecutionStartNodeId(null);
    void loadExecutionLogs();
  }, [workflowId, loadExecutionLogs]);

  // ---- Debug ----
  const cleanupDebugListeners = useCallback(() => {
    for (const cleanup of debugCleanupRef.current) cleanup();
    debugCleanupRef.current = [];
  }, []);

  const cleanupExecutionListeners = useCallback(() => {
    for (const cleanup of executionCleanupRef.current) cleanup();
    executionCleanupRef.current = [];
  }, []);

  const sendInteractionResponse = useCallback((request: InteractionRequest, data: unknown, cancelled = false) => {
    const ws = getWorkflowWS();
    if (!ws) return;
    ws.send('workflow:interaction', {
      id: request.id,
      channel: 'workflow:interaction',
      type: 'interaction_response',
      executionId: request.executionId,
      workflowId: request.workflowId,
      nodeId: request.nodeId,
      data,
      cancelled,
    });
    setPendingInteraction(null);
  }, [getWorkflowWS]);

  const handleClientNodeRequest = useCallback(async (request: ClientNodeRequest) => {
    if (request.type !== 'client_node_request') return;
    const ws = getWorkflowWS();
    if (!ws) return;
    try {
      const data = await executeClientPluginNode(request);
      ws.send('workflow:client-node', {
        id: request.id,
        channel: 'workflow:client-node',
        type: 'client_node_response',
        executionId: request.executionId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        data,
      });
    } catch (error) {
      ws.send('workflow:client-node', {
        id: request.id,
        channel: 'workflow:client-node',
        type: 'client_node_response',
        executionId: request.executionId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        error: createErrorShape('WORKFLOW_ERROR', error instanceof Error ? error.message : String(error)),
      });
    }
  }, [getWorkflowWS]);

  const handleResolveInteraction = useCallback((request: InteractionRequest, data: unknown) => {
    sendInteractionResponse(request, data, false);
  }, [sendInteractionResponse]);

  const handleCancelInteraction = useCallback((request: InteractionRequest) => {
    sendInteractionResponse(request, null, true);
  }, [sendInteractionResponse]);

  const handleCancelDebug = useCallback(() => {
    cleanupDebugListeners();
    setPendingInteraction(null);
    setDebugStatus('idle');
    setDebugResult(null);
    setDebugNodeId(null);
  }, [cleanupDebugListeners]);

  const handleDebugNode = useCallback((nodeId: string, inputs?: Record<string, unknown>, properties?: Record<string, unknown>) => {
    if (!workflow) return;
    const ws = getWorkflowWS();
    if (!ws) {
      setDebugNodeId(nodeId);
      setDebugResult({ status: 'error', error: '未加载工作区，无法调试节点' });
      setDebugStatus('error');
      return;
    }
    cleanupDebugListeners();
    setDebugNodeId(nodeId);
    setDebugStatus('running');
    setDebugResult(null);

    const targetNode = workflow.nodes.find(item => item.id === nodeId);
    const embeddedNode = targetNode && properties
      ? { ...targetNode, data: { ...targetNode.data, ...properties } }
      : undefined;
    const sendDebugRequest = () => {
      ws.send('workflow:debug-node', {
        workflowId: workflow.id,
        nodeId,
        input: inputs,
        embeddedNode,
        snapshot: {
          nodes: withOriginalIOFieldsSnapshot(workflow),
          edges: workflow.edges,
          groups: workflow.groups || [],
          variables: workflow.variables || [],
        },
      });
    };

    const offResult = ws.on('workflow:debug-node:result', (data) => {
      const result = data as DebugResult;
      cleanupDebugListeners();
      setDebugNodeId(nodeId);
      setDebugResult(result);
      setDebugStatus(result.status === 'error' ? 'error' : 'completed');
    });
    const offError = ws.on('workflow:debug-node:error', (data) => {
      const payload = data as { error?: string };
      cleanupDebugListeners();
      setPendingInteraction(null);
      setDebugNodeId(nodeId);
      setDebugResult({ status: 'error', error: payload.error || '测试失败' });
      setDebugStatus('error');
    });
    const offInteraction = ws.on('workflow:interaction', (data) => {
      const request = data as InteractionRequest;
      if (request.type !== 'interaction_required' || request.nodeId !== nodeId) return;
      setPendingInteraction(request);
    });
    const offClientNode = ws.on('workflow:client-node', (data) => {
      const request = data as ClientNodeRequest;
      if (request.type !== 'client_node_request' || request.nodeId !== nodeId) return;
      void handleClientNodeRequest(request);
    });
    debugCleanupRef.current = [offResult, offError, offInteraction, offClientNode];

    if (ws.connected) {
      sendDebugRequest();
    } else {
      const offConnected = ws.on('connected', () => {
        offConnected();
        debugCleanupRef.current = debugCleanupRef.current.filter(cleanup => cleanup !== offConnected);
        sendDebugRequest();
      });
      debugCleanupRef.current.push(offConnected);
    }
  }, [workflow, cleanupDebugListeners, handleClientNodeRequest, getWorkflowWS]);

  // ---- Execution ----
  const handleExecute = useCallback((input?: Record<string, unknown>, startNodeId?: string, env?: Record<string, unknown>, workflowOverride?: Workflow) => {
    const activeWorkflow = workflowOverride ?? workflow;
    if (!activeWorkflow) return;
    const ws = getWorkflowWS();
    if (!ws) {
      setExecStatus('error');
      return;
    }
    cleanupExecutionListeners();
    setExecStatus('running');
    setExecutionLog(null);
    setSelectedExecutionLogId(null);
    setCurrentExecutionId(null);
    setPausedNodeId(null);
    setPausedReason(null);
    setPartialExecutionStartNodeId(startNodeId ?? null);

    const sendExecuteRequest = () => {
      ws.send('workflow:execute', {
        workflowId: activeWorkflow.id,
        input,
        env,
        startNodeId,
        snapshot: {
          nodes: withOriginalIOFieldsSnapshot(activeWorkflow),
          edges: activeWorkflow.edges,
          groups: activeWorkflow.groups || [],
          variables: activeWorkflow.variables || [],
        },
      });
    };

    const offResult = ws.on('workflow:execute:result', (data) => {
      const result = data as { executionId?: string; status?: string };
      if (result.executionId) {
        setCurrentExecutionId(result.executionId);
        setSelectedExecutionLogId(result.executionId);
      }
      if (result.status) setExecStatus(result.status);
    });
    const offError = ws.on('workflow:execute:error', () => {
      setPartialExecutionStartNodeId(null);
      setExecStatus('error');
    });
    const offLog = ws.on('execution:log', (data) => {
      const event = data as { workflowId?: string; executionId?: string; log?: ExecutionLog };
      if (event.workflowId !== activeWorkflow.id || !event.log) return;
      setCurrentExecutionId(event.executionId || event.log.id);
      setExecutionLog(event.log);
      setSelectedExecutionLogId(event.log.id);
      setExecutionLogs(prev => [event.log!, ...prev.filter(item => item.id !== event.log!.id)]);
      setExecStatus(event.log.status);
    });
    const offProgress = ws.on('node:progress', (data) => {
      const event = data as { workflowId?: string; nodeLabel?: string; message?: string; data?: { level?: string } };
      if (event.workflowId !== activeWorkflow.id || !event.message) return;
      const prefix = event.nodeLabel ? `[Workflow:${event.nodeLabel}]` : '[Workflow]';
      if (event.data?.level === 'error') console.error(prefix, event.message);
      else if (event.data?.level === 'warning') console.warn(prefix, event.message);
      else console.log(prefix, event.message);
    });
    const offPaused = ws.on('workflow:paused', (data) => {
      const event = data as { workflowId?: string; executionId?: string; currentNodeId?: string; reason?: string };
      if (event.workflowId !== activeWorkflow.id) return;
      if (event.executionId) setCurrentExecutionId(event.executionId);
      setPausedNodeId(event.currentNodeId ?? null);
      setPausedReason(event.reason ?? null);
      setExecStatus('paused');
    });
    const offResumed = ws.on('workflow:resumed', (data) => {
      const event = data as { workflowId?: string; executionId?: string };
      if (event.workflowId !== activeWorkflow.id) return;
      if (event.executionId) setCurrentExecutionId(event.executionId);
      setPausedNodeId(null);
      setPausedReason(null);
      setExecStatus('running');
    });
    const offCompleted = ws.on('workflow:completed', (data) => {
      const event = data as { workflowId?: string; executionId?: string; log?: ExecutionLog };
      if (event.workflowId !== activeWorkflow.id) return;
      if (event.executionId) setCurrentExecutionId(event.executionId);
      if (event.log) setExecutionLog(event.log);
      if (event.log) {
        setSelectedExecutionLogId(event.log.id);
        setExecutionLogs(prev => [event.log!, ...prev.filter(item => item.id !== event.log!.id)]);
      }
      setPausedNodeId(null);
      setPausedReason(null);
      setPartialExecutionStartNodeId(null);
      setExecStatus('completed');
      void loadExecutionLogs();
    });
    const offFailed = ws.on('workflow:error', (data) => {
      const event = data as { workflowId?: string; executionId?: string; log?: ExecutionLog };
      if (event.workflowId !== activeWorkflow.id) return;
      if (event.executionId) setCurrentExecutionId(event.executionId);
      if (event.log) setExecutionLog(event.log);
      if (event.log) {
        setSelectedExecutionLogId(event.log.id);
        setExecutionLogs(prev => [event.log!, ...prev.filter(item => item.id !== event.log!.id)]);
      }
      setPausedNodeId(null);
      setPausedReason(null);
      setPartialExecutionStartNodeId(null);
      setExecStatus('error');
      void loadExecutionLogs();
    });
    const offClientNode = ws.on('workflow:client-node', (data) => {
      const request = data as ClientNodeRequest;
      if (request.type !== 'client_node_request' || request.workflowId !== activeWorkflow.id) return;
      void handleClientNodeRequest(request);
    });
    executionCleanupRef.current = [offResult, offError, offLog, offProgress, offPaused, offResumed, offCompleted, offFailed, offClientNode];

    if (ws.connected) {
      sendExecuteRequest();
    } else {
      const offConnected = ws.on('connected', () => {
        offConnected();
        executionCleanupRef.current = executionCleanupRef.current.filter(cleanup => cleanup !== offConnected);
        sendExecuteRequest();
      });
      executionCleanupRef.current.push(offConnected);
    }
  }, [workflow, cleanupExecutionListeners, handleClientNodeRequest, loadExecutionLogs, getWorkflowWS]);

  const handlePauseExecution = useCallback(() => {
    if (!currentExecutionId) return;
    getWorkflowWS()?.send('workflow:pause', { executionId: currentExecutionId });
    setExecStatus('paused');
  }, [currentExecutionId, getWorkflowWS]);

  const handleResumeExecution = useCallback(() => {
    if (!currentExecutionId) return;
    getWorkflowWS()?.send('workflow:resume', { executionId: currentExecutionId });
    setPausedNodeId(null);
    setPausedReason(null);
    setExecStatus('running');
  }, [currentExecutionId, getWorkflowWS]);

  const handleStopExecution = useCallback(() => {
    if (!currentExecutionId) return;
    getWorkflowWS()?.send('workflow:stop', { executionId: currentExecutionId });
    setPausedNodeId(null);
    setPausedReason(null);
    setPartialExecutionStartNodeId(null);
    setExecStatus('stopped');
  }, [currentExecutionId, getWorkflowWS]);

  const handleSelectExecutionLog = useCallback((selectedLog: ExecutionLog) => {
    setExecutionLog(selectedLog);
    setSelectedExecutionLogId(selectedLog.id);
    setExecStatus(selectedLog.status);
  }, []);

  const clearSelectedExecutionLog = useCallback(() => {
    setExecutionLog(null);
    setSelectedExecutionLogId(null);
  }, []);

  const handleDeleteExecutionLog = useCallback(async (logId: string) => {
    if (!workflow) return;
    await executionLogApi.delete(workflow.id, logId);
    setExecutionLogs(prev => prev.filter(item => item.id !== logId));
    if (selectedExecutionLogId === logId) {
      const nextLog = executionLogs.find(item => item.id !== logId) ?? null;
      setExecutionLog(nextLog);
      setSelectedExecutionLogId(nextLog?.id ?? null);
    }
  }, [workflow, selectedExecutionLogId, executionLogs]);

  const handleClearExecutionLogs = useCallback(async () => {
    if (!workflow) return;
    await executionLogApi.clear(workflow.id);
    setExecutionLogs([]);
    setExecutionLog(null);
    setSelectedExecutionLogId(null);
  }, [workflow]);

  // ---- Computed ----
  const startNodes = useMemo(() => {
    const nodes = workflow?.nodes || [];
    const nodeById = new Map(nodes.map(node => [node.id, node]));

    return nodes.filter(node => {
      if (node.type !== 'start') return false;
      const parentId = getCompositeParentId(node);
      if (!parentId) return true;
      return nodeById.get(parentId)?.type !== LOOP_BODY_NODE_TYPE;
    });
  }, [workflow]);

  const executionValidationError = useMemo(() => {
    if (!workflow) return '未加载工作流';
    if (startNodes.length === 0) return '缺少开始节点';
    return null;
  }, [workflow, startNodes]);

  return {
    // Execution state
    execStatus,
    executionLog,
    executionLogs,
    selectedExecutionLogId,
    currentExecutionId,
    pausedNodeId,
    pausedReason,
    partialExecutionStartNodeId,
    startNodes,
    executionValidationError,

    // Execution actions
    handleExecute,
    handlePauseExecution,
    handleResumeExecution,
    handleStopExecution,
    handleSelectExecutionLog,
    clearSelectedExecutionLog,
    handleDeleteExecutionLog,
    handleClearExecutionLogs,

    // Debug state
    debugNodeId,
    debugStatus,
    debugResult,
    pendingInteraction,

    // Debug actions
    handleDebugNode,
    handleCancelDebug,
    handleResolveInteraction,
    handleCancelInteraction,
  };
}
