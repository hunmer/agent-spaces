'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createErrorShape, getCompositeParentId, LOOP_BODY_NODE_TYPE, type ClientNodeRequest, type ExecutionLog, type InteractionRequest, type Workflow } from '@agent-spaces/shared';
import { executionLogApi } from '@/lib/workflow-api';
import { getWS } from '@/lib/ws';
import type { DebugResult } from './workflow-editor-types';

interface UseWorkflowEditorExecutionParams {
  workflow: Workflow | null;
  workflowId: string | null;
}

type DesktopNativeApi = {
  readClipboardText?: () => Promise<string>;
  writeClipboardText?: (text: string) => Promise<void>;
  readClipboardImage?: () => Promise<string>;
  writeClipboardImage?: (dataUrl: string) => Promise<void>;
  clearClipboard?: () => Promise<void>;
  showNotification?: (opts: { title: string; body?: string; silent?: boolean }) => Promise<void>;
  showItemInFolder?: (fullPath: string) => Promise<void>;
  openPath?: (path: string) => Promise<void>;
  openExternal?: (url: string) => Promise<void>;
  beep?: () => Promise<void>;
  showOpenDialogSync?: (opts: unknown) => Promise<string[] | undefined>;
  showSaveDialogSync?: (opts: unknown) => Promise<string | undefined>;
  showMessageBoxSync?: (opts: unknown) => Promise<number>;
  showErrorBox?: (title: string, content: string) => Promise<void>;
};

type ElectronApi = {
  desktopNative?: DesktopNativeApi;
  shell?: { openExternal?: (url: string) => Promise<void> };
  fs?: { openInExplorer?: (targetPath: string) => Promise<void> };
};

function getElectronApi(): ElectronApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as typeof window & { electronAPI?: ElectronApi }).electronAPI;
}

async function executeDesktopNativeClientNode(nodeType: string, args: Record<string, unknown>): Promise<unknown> {
  const desktopNative = getElectronApi()?.desktopNative;
  switch (nodeType) {
    case 'read_clipboard': {
      const text = desktopNative?.readClipboardText
        ? await desktopNative.readClipboardText()
        : await navigator.clipboard.readText();
      return { success: true, data: { text } };
    }
    case 'write_clipboard':
      if (desktopNative?.writeClipboardText) await desktopNative.writeClipboardText(String(args.text ?? ''));
      else await navigator.clipboard.writeText(String(args.text ?? ''));
      return { success: true };
    case 'read_clipboard_image':
      if (!desktopNative?.readClipboardImage) throw new Error('当前客户端不支持读取剪贴板图片');
      return { success: true, data: { dataUrl: await desktopNative.readClipboardImage() } };
    case 'write_clipboard_image':
      if (!desktopNative?.writeClipboardImage) throw new Error('当前客户端不支持写入剪贴板图片');
      await desktopNative.writeClipboardImage(String(args.dataUrl ?? ''));
      return { success: true };
    case 'clear_clipboard':
      if (desktopNative?.clearClipboard) await desktopNative.clearClipboard();
      else await navigator.clipboard.writeText('');
      return { success: true };
    case 'show_notification':
      if (desktopNative?.showNotification) {
        await desktopNative.showNotification({
          title: String(args.title ?? ''),
          body: args.body == null ? undefined : String(args.body),
          silent: Boolean(args.silent),
        });
      } else {
        if (Notification.permission === 'default') await Notification.requestPermission();
        if (Notification.permission !== 'granted') throw new Error('通知权限未授予');
        new Notification(String(args.title ?? ''), {
          body: args.body == null ? undefined : String(args.body),
          silent: Boolean(args.silent),
        });
      }
      return { success: true };
    case 'show_item_in_folder':
      if (!desktopNative?.showItemInFolder) throw new Error('当前客户端不支持在文件夹中显示');
      await desktopNative.showItemInFolder(String(args.fullPath ?? ''));
      return { success: true };
    case 'open_path':
      if (!desktopNative?.openPath) throw new Error('当前客户端不支持打开本地路径');
      await desktopNative.openPath(String(args.path ?? ''));
      return { success: true };
    case 'open_external':
      if (desktopNative?.openExternal) await desktopNative.openExternal(String(args.url ?? ''));
      else window.open(String(args.url ?? ''), '_blank', 'noopener,noreferrer');
      return { success: true };
    case 'beep':
      if (!desktopNative?.beep) throw new Error('当前客户端不支持系统蜂鸣');
      await desktopNative.beep();
      return { success: true };
    case 'show_open_dialog': {
      if (!desktopNative?.showOpenDialogSync) throw new Error('当前客户端不支持文件选择对话框');
      const filePaths = await desktopNative.showOpenDialogSync(parseDialogOptions(args));
      return { success: true, data: { filePaths: filePaths || [] } };
    }
    case 'show_save_dialog': {
      if (!desktopNative?.showSaveDialogSync) throw new Error('当前客户端不支持保存对话框');
      const filePath = await desktopNative.showSaveDialogSync(parseDialogOptions(args));
      return { success: true, data: { filePath: filePath || '' } };
    }
    case 'show_message_box': {
      if (!desktopNative?.showMessageBoxSync) throw new Error('当前客户端不支持消息对话框');
      const response = await desktopNative.showMessageBoxSync(parseMessageBoxOptions(args));
      return { success: true, data: { response } };
    }
    case 'show_error_box':
      if (!desktopNative?.showErrorBox) throw new Error('当前客户端不支持错误对话框');
      await desktopNative.showErrorBox(String(args.title ?? ''), String(args.content ?? args.message ?? ''));
      return { success: true };
    default:
      throw new Error(`Unsupported client node type: ${nodeType}`);
  }
}

function parseDialogOptions(args: Record<string, unknown>) {
  const opts: Record<string, unknown> = {};
  if (args.title) opts.title = String(args.title);
  if (args.defaultPath) opts.defaultPath = String(args.defaultPath);
  if (args.filters) opts.filters = JSON.parse(String(args.filters));
  if (args.properties) opts.properties = JSON.parse(String(args.properties));
  return opts;
}

function parseMessageBoxOptions(args: Record<string, unknown>) {
  const opts: Record<string, unknown> = {
    title: String(args.title ?? ''),
    message: String(args.message ?? ''),
    type: String(args.type || 'none'),
  };
  if (args.buttons) opts.buttons = JSON.parse(String(args.buttons));
  return opts;
}

export function useWorkflowEditorExecution({
  workflow, workflowId,
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
    const ws = getWS('workflows');
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
  }, []);

  const handleClientNodeRequest = useCallback(async (request: ClientNodeRequest) => {
    if (request.type !== 'client_node_request') return;
    const ws = getWS('workflows');
    try {
      const data = await executeDesktopNativeClientNode(request.nodeType, request.args || {});
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
  }, []);

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
    cleanupDebugListeners();
    setDebugNodeId(nodeId);
    setDebugStatus('running');
    setDebugResult(null);

    const targetNode = workflow.nodes.find(item => item.id === nodeId);
    const embeddedNode = targetNode && properties
      ? { ...targetNode, data: { ...targetNode.data, ...properties } }
      : undefined;
    const ws = getWS('workflows');
    const sendDebugRequest = () => {
      ws.send('workflow:debug-node', {
        workflowId: workflow.id,
        nodeId,
        input: inputs,
        embeddedNode,
        snapshot: {
          nodes: workflow.nodes,
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
  }, [workflow, cleanupDebugListeners, handleClientNodeRequest]);

  // ---- Execution ----
  const handleExecute = useCallback((input?: Record<string, unknown>, startNodeId?: string, env?: Record<string, unknown>) => {
    if (!workflow) return;
    cleanupExecutionListeners();
    setExecStatus('running');
    setExecutionLog(null);
    setSelectedExecutionLogId(null);
    setCurrentExecutionId(null);
    setPausedNodeId(null);
    setPausedReason(null);
    setPartialExecutionStartNodeId(startNodeId ?? null);

    const ws = getWS('workflows');
    const sendExecuteRequest = () => {
      ws.send('workflow:execute', {
        workflowId: workflow.id,
        input,
        env,
        startNodeId,
        snapshot: {
          nodes: workflow.nodes,
          edges: workflow.edges,
          groups: workflow.groups || [],
          variables: workflow.variables || [],
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
      if (event.workflowId !== workflow.id || !event.log) return;
      setCurrentExecutionId(event.executionId || event.log.id);
      setExecutionLog(event.log);
      setSelectedExecutionLogId(event.log.id);
      setExecutionLogs(prev => [event.log!, ...prev.filter(item => item.id !== event.log!.id)]);
      setExecStatus(event.log.status);
    });
    const offProgress = ws.on('node:progress', (data) => {
      const event = data as { workflowId?: string; nodeLabel?: string; message?: string; data?: { level?: string } };
      if (event.workflowId !== workflow.id || !event.message) return;
      const prefix = event.nodeLabel ? `[Workflow:${event.nodeLabel}]` : '[Workflow]';
      if (event.data?.level === 'error') console.error(prefix, event.message);
      else if (event.data?.level === 'warning') console.warn(prefix, event.message);
      else console.log(prefix, event.message);
    });
    const offPaused = ws.on('workflow:paused', (data) => {
      const event = data as { workflowId?: string; executionId?: string; currentNodeId?: string; reason?: string };
      if (event.workflowId !== workflow.id) return;
      if (event.executionId) setCurrentExecutionId(event.executionId);
      setPausedNodeId(event.currentNodeId ?? null);
      setPausedReason(event.reason ?? null);
      setExecStatus('paused');
    });
    const offResumed = ws.on('workflow:resumed', (data) => {
      const event = data as { workflowId?: string; executionId?: string };
      if (event.workflowId !== workflow.id) return;
      if (event.executionId) setCurrentExecutionId(event.executionId);
      setPausedNodeId(null);
      setPausedReason(null);
      setExecStatus('running');
    });
    const offCompleted = ws.on('workflow:completed', (data) => {
      const event = data as { workflowId?: string; executionId?: string; log?: ExecutionLog };
      if (event.workflowId !== workflow.id) return;
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
      if (event.workflowId !== workflow.id) return;
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
      if (request.type !== 'client_node_request' || request.workflowId !== workflow.id) return;
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
  }, [workflow, cleanupExecutionListeners, handleClientNodeRequest, loadExecutionLogs]);

  const handlePauseExecution = useCallback(() => {
    if (!currentExecutionId) return;
    getWS('workflows').send('workflow:pause', { executionId: currentExecutionId });
    setExecStatus('paused');
  }, [currentExecutionId]);

  const handleResumeExecution = useCallback(() => {
    if (!currentExecutionId) return;
    getWS('workflows').send('workflow:resume', { executionId: currentExecutionId });
    setPausedNodeId(null);
    setPausedReason(null);
    setExecStatus('running');
  }, [currentExecutionId]);

  const handleStopExecution = useCallback(() => {
    if (!currentExecutionId) return;
    getWS('workflows').send('workflow:stop', { executionId: currentExecutionId });
    setPausedNodeId(null);
    setPausedReason(null);
    setPartialExecutionStartNodeId(null);
    setExecStatus('stopped');
  }, [currentExecutionId]);

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
