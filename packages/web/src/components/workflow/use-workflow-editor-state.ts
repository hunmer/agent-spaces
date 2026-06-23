'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@agent-spaces/sdk';
import type { ExecutionLog, OperationEntry, Workflow, WorkflowTemplate } from '@agent-spaces/shared';
import { useWorkflowStore } from '@/stores/workflow';
import { operationHistoryApi, workflowApi, workflowVersionApi } from '@/lib/workflow-api';
import { createWorkflowEdgeId } from '@/lib/workflow-edge-id';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import {
  EXECUTION_DATA_KEY,
  EXECUTION_INPUT_FIELDS_KEY,
  EXECUTION_OUTPUTS_KEY,
  ORIGINAL_INPUT_FIELDS_KEY,
  ORIGINAL_OUTPUTS_KEY,
} from './workflow-execution-snapshot-fields';
import { JSON_PRESETS_KEY, SELECTED_JSON_PRESET_KEY, TEMP_DEBUG_PRESET_ID, getJsonPresets } from './workflow-properties-utils';

function resolveApiError(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.body) as { error?: unknown; message?: unknown };
      const msg = parsed.error ?? parsed.message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    } catch {
      // body 非 JSON，回退到 message
    }
  }
  return err instanceof Error ? err.message : '保存失败';
}

type WorkflowSnapshot = Pick<Workflow, 'nodes' | 'edges'> & {
  variables?: Workflow['variables'];
  groups?: Workflow['groups'];
};

function normalizeOperationEntries(value: unknown): OperationEntry[] {
  if (Array.isArray(value)) return value as OperationEntry[];
  if (value && typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries)) {
    return (value as { entries: OperationEntry[] }).entries;
  }
  return [];
}

function normalizeLegacySourceHandle(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  const nodesById = new Map(snapshot.nodes.map(node => [node.id, node]));

  const seen = new Set<string>();
  const edges = snapshot.edges.filter((edge) => {
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  }).map((edge) => {
    const sourceHandle = edge.sourceHandle;
    if (!sourceHandle?.startsWith('source-')) return edge;

    const sourceNode = nodesById.get(edge.source);
    const dynamicSource = sourceNode ? getNodeDefinition(sourceNode.type)?.handles?.dynamicSource : undefined;
    if (!sourceNode || !dynamicSource) return edge;

    const match = /^source-(\d+)$/.exec(sourceHandle);
    if (!match) return edge;

    const handleIndex = Number(match[1]);
    const values = sourceNode.data?.[dynamicSource.dataKey];
    const conditionCount = Array.isArray(values) ? values.length : 0;
    const hasDefaultHandle = (dynamicSource.extraCount || 0) > 0;
    const nextSourceHandle = handleIndex < conditionCount
      ? `case-${handleIndex}`
      : hasDefaultHandle && handleIndex === conditionCount ? 'default' : sourceHandle;

    if (nextSourceHandle === sourceHandle) return edge;

    return {
      ...edge,
      id: createWorkflowEdgeId({
        source: edge.source,
        target: edge.target,
        sourceHandle: nextSourceHandle,
        targetHandle: edge.targetHandle,
      }),
      sourceHandle: nextSourceHandle,
    };
  });

  return { ...snapshot, edges };
}

function findLastEndNodeId(nodes: Workflow['nodes']): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index]?.type === 'end') return nodes[index].id;
  }
  return null;
}

function stripExecutionSnapshotData(data: Workflow['nodes'][number]['data']): Workflow['nodes'][number]['data'] {
  const {
    [EXECUTION_DATA_KEY]: _executionData,
    [EXECUTION_INPUT_FIELDS_KEY]: _executionInputFields,
    [EXECUTION_OUTPUTS_KEY]: _executionOutputs,
    [ORIGINAL_INPUT_FIELDS_KEY]: _originalInputFields,
    [ORIGINAL_OUTPUTS_KEY]: _originalOutputs,
    ...rest
  } = data ?? {};
  return rest;
}

function stripExecutionSnapshotFields(workflow: Workflow): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map(node => ({
      ...node,
      data: stripExecutionSnapshotData(node.data),
    })),
  };
}

function restorePreviewIOFields(nodes: Workflow['nodes'], sourceNodes: Workflow['nodes'] = []): Workflow['nodes'] {
  const sourceNodeById = new Map(sourceNodes.map(node => [node.id, node]));
  return nodes.map((node) => {
    const sourceNode = sourceNodeById.get(node.id);
    const originalData = sourceNode?.data ? stripExecutionSnapshotData(sourceNode.data) : undefined;
    const originalInputFields = Array.isArray(sourceNode?.data?.inputFields)
      ? sourceNode.data.inputFields
      : node.data?.[ORIGINAL_INPUT_FIELDS_KEY];
    const originalOutputs = Array.isArray(sourceNode?.data?.outputs)
      ? sourceNode.data.outputs
      : node.data?.[ORIGINAL_OUTPUTS_KEY];
    if (!originalData && !Array.isArray(originalInputFields) && !Array.isArray(originalOutputs)) return node;
    return {
      ...node,
      data: {
        ...node.data,
        ...(originalData ?? {}),
        [EXECUTION_DATA_KEY]: node.data,
        ...(Array.isArray(originalInputFields)
          ? {
              [EXECUTION_INPUT_FIELDS_KEY]: node.data?.inputFields,
              inputFields: originalInputFields,
            }
          : {}),
        ...(Array.isArray(originalOutputs)
          ? {
              [EXECUTION_OUTPUTS_KEY]: node.data?.outputs,
              outputs: originalOutputs,
            }
          : {}),
      },
    };
  });
}

function stripTemporaryDebugPresets(workflow: Workflow): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      const presets = getJsonPresets(node.data?.[JSON_PRESETS_KEY]).filter(preset => preset.id !== TEMP_DEBUG_PRESET_ID);
      const selectedPresetId = node.data?.[SELECTED_JSON_PRESET_KEY];
      if (presets.length === getJsonPresets(node.data?.[JSON_PRESETS_KEY]).length && selectedPresetId !== TEMP_DEBUG_PRESET_ID) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          [JSON_PRESETS_KEY]: presets,
          ...(selectedPresetId === TEMP_DEBUG_PRESET_ID ? { [SELECTED_JSON_PRESET_KEY]: '' } : {}),
        },
      };
    }),
  };
}

export function useWorkflowEditorState(template: WorkflowTemplate | null) {
  const store = useWorkflowStore();

  // ---- Core state ----
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveSuspended, setAutoSaveSuspended] = useState(false);
  const [isLoading, setIsLoading] = useState(!!template);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [rightTab, setRightTab] = useState('properties');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isPreviewDirty, setIsPreviewDirty] = useState(false);
  const [prePreviewWorkflow, setPrePreviewWorkflow] = useState<Workflow | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [operationLog, setOperationLog] = useState<OperationEntry[]>([]);
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [pluginsDialogOpen, setPluginsDialogOpen] = useState(false);
  const [pluginPickerDialogOpen, setPluginPickerDialogOpen] = useState(false);
  const [embeddedEditorOpen, setEmbeddedEditorOpen] = useState(false);
  const [embeddedSubWorkflowId, setEmbeddedSubWorkflowId] = useState<string | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prePreviewWorkflowRef = useRef<Workflow | null>(null);


  // Auto-switch to properties tab when selecting a node
  useEffect(() => {
    if (selectedNodeId) setRightTab('properties');
  }, [selectedNodeId]);

  // ---- Load workflow ----
  useEffect(() => {
    if (!template) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    prePreviewWorkflowRef.current = null;
    setPrePreviewWorkflow(null);
    const normalized = normalizeLegacySourceHandle(template);
    setWorkflow({ ...template, nodes: normalized.nodes, edges: normalized.edges });
    setOperationLog([]);
    setIsPreview(false);
    setIsLoading(false);
  }, [template]);

  // ---- Dirty tracking ----
  const markDirty = useCallback(() => setIsDirty(true), []);
  const markPreviewDirty = useCallback(() => setIsPreviewDirty(true), []);

  const cloneWorkflow = useCallback((value: Workflow): Workflow => JSON.parse(JSON.stringify(value)) as Workflow, []);

  const enterSnapshotPreview = useCallback((snapshot: WorkflowSnapshot) => {
    const normalized = normalizeLegacySourceHandle(snapshot);
    const snapshotNodes = JSON.parse(JSON.stringify(normalized.nodes)) as Workflow['nodes'];
    const previewEdges = JSON.parse(JSON.stringify(normalized.edges)) as Workflow['edges'];
    const previewGroups = normalized.groups
      ? JSON.parse(JSON.stringify(normalized.groups)) as Workflow['groups']
      : [];
    const lastEndNodeId = findLastEndNodeId(snapshotNodes);

    setWorkflow((current) => {
      if (!current) return current;
      const sourceNodes = current.nodes;
      if (!prePreviewWorkflowRef.current) {
        const snapshot = cloneWorkflow(current);
        prePreviewWorkflowRef.current = snapshot;
        setPrePreviewWorkflow(snapshot);
      }

      const previewNodes = restorePreviewIOFields(snapshotNodes, sourceNodes);

      return {
        ...current,
        nodes: previewNodes,
        edges: previewEdges,
        groups: previewGroups,
      };
    });
    setSelectedNodeId(lastEndNodeId);
    setSelectedNodeIds(lastEndNodeId ? [lastEndNodeId] : []);
    setIsPreviewDirty(false);
    setIsPreview(true);
  }, [cloneWorkflow]);

  const enterPreview = useCallback((log: ExecutionLog) => {
    if (!log.snapshot) return;
    enterSnapshotPreview(log.snapshot);
  }, [enterSnapshotPreview]);

  const exitPreview = useCallback(() => {
    setWorkflow((current) => {
      const restored = prePreviewWorkflowRef.current;
      prePreviewWorkflowRef.current = null;
      return restored ? cloneWorkflow(restored) : current;
    });
    setPrePreviewWorkflow(null);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setIsPreviewDirty(false);
    setIsPreview(false);
  }, [cloneWorkflow]);

  const savePreviewEdits = useCallback(async (options?: { createVersion?: boolean; versionName?: string }) => {
    if (!isPreview || !workflow) return;
    const workflowToSave = stripExecutionSnapshotFields(stripTemporaryDebugPresets(cloneWorkflow(workflow)));
    if (options?.createVersion) {
      const name = options.versionName?.trim() || `Preview edit ${new Date().toLocaleString()}`;
      await workflowVersionApi.add(workflowToSave.id, name, workflowToSave.nodes, workflowToSave.edges);
    }

    const saved = await workflowApi.update(workflowToSave.id, {
      ...workflowToSave,
      updatedAt: Date.now(),
    });
    prePreviewWorkflowRef.current = null;
    setPrePreviewWorkflow(null);
    setIsPreviewDirty(false);
    setIsPreview(false);
    setWorkflow(saved);
    setIsDirty(false);
    store.upsertWorkflow(saved);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, [cloneWorkflow, isPreview, store, workflow]);

  // ---- Undo / Redo ----
  const workflowId = workflow?.id ?? null;

  useEffect(() => {
    if (!workflowId) {
      setOperationLog([]);
      return;
    }

    let cancelled = false;
    operationHistoryApi.load(workflowId)
      .then((entries) => {
        if (!cancelled) setOperationLog(normalizeOperationEntries(entries));
      })
      .catch(() => {
        // Operation history is optional.
      });

    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  const pushUndo = useCallback((description?: string) => {
    if (!workflow) return;
    const snapshot = JSON.stringify({
      nodes: workflow.nodes,
      edges: workflow.edges,
      variables: workflow.variables || [],
      groups: workflow.groups || [],
    });
    const entry: OperationEntry = {
      description: description || 'edit',
      timestamp: Date.now(),
      snapshot,
    };
    setUndoStack(prev => [...prev, snapshot]);
    setRedoStack([]);
    setOperationLog((prev) => {
      const entries = normalizeOperationEntries(prev);
      const next = [...entries.slice(0, undoStack.length), entry];
      void operationHistoryApi.save(workflow.id, next).catch(() => {});
      return next;
    });
  }, [workflow, undoStack.length]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !workflow) return;
    const currentSnapshot = JSON.stringify({
      nodes: workflow.nodes,
      edges: workflow.edges,
      variables: workflow.variables || [],
      groups: workflow.groups || [],
    });
    const prevSnapshot = undoStack[undoStack.length - 1];
    const prev = normalizeLegacySourceHandle(JSON.parse(prevSnapshot) as WorkflowSnapshot);
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(s => [...s, currentSnapshot]);
    setWorkflow(w => w ? { ...w, nodes: prev.nodes, edges: prev.edges, variables: prev.variables || [], groups: prev.groups || [] } : null);
    markDirty();
  }, [undoStack, workflow, markDirty]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !workflow) return;
    const currentSnapshot = JSON.stringify({
      nodes: workflow.nodes,
      edges: workflow.edges,
      variables: workflow.variables || [],
      groups: workflow.groups || [],
    });
    const nextSnapshot = redoStack[redoStack.length - 1];
    const next = normalizeLegacySourceHandle(JSON.parse(nextSnapshot) as WorkflowSnapshot);
    setUndoStack(s => [...s, currentSnapshot]);
    setRedoStack(s => s.slice(0, -1));
    setWorkflow(w => w ? { ...w, nodes: next.nodes, edges: next.edges, variables: next.variables || [], groups: next.groups || [] } : null);
    markDirty();
  }, [redoStack, workflow, markDirty]);

  // ---- Save ----
  const saveWorkflow = useCallback(async (workflowToSave?: Workflow): Promise<boolean> => {
    if (isPreview) return false;
    const nextWorkflow = workflowToSave ?? workflow;
    if (!nextWorkflow) return false;
    const workflowForSave = stripExecutionSnapshotFields(stripTemporaryDebugPresets(cloneWorkflow(nextWorkflow)));
    setIsSaving(true);
    try {
      const saved = await workflowApi.update(workflowForSave.id, {
        ...workflowForSave,
        updatedAt: Date.now(),
      });
      setWorkflow(saved);
      setIsDirty(false);
      store.upsertWorkflow(saved);
      return true;
    } catch (err) {
      toast.error('保存工作流失败', { description: resolveApiError(err) });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [cloneWorkflow, isPreview, workflow, store]);

  // ---- Auto-save ----
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (isDirty && workflow && !isPreview) {
        if (autoSaveSuspended) return;
        saveWorkflow();
      }
    }, 10_000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [autoSaveSuspended, isDirty, isPreview, workflow, saveWorkflow]);

  // ---- Name editing ----
  const startEditName = useCallback(() => {
    if (workflow) {
      setEditingName(workflow.name || '');
      setIsEditingName(true);
    }
  }, [workflow]);

  const finishEditName = useCallback(() => {
    setIsEditingName(false);
    if (workflow && editingName !== workflow.name) {
      setWorkflow(w => w ? { ...w, name: editingName } : null);
      markDirty();
    }
  }, [workflow, editingName, markDirty]);

  // ---- Export / Import ----
  const handleExport = useCallback(() => {
    if (!workflow) return;
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(workflow.name || 'workflow').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workflow]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Workflow;
        if (data.nodes && data.edges) {
          setWorkflow(data);
          setIsDirty(true);
        }
      } catch {}
    };
    input.click();
  }, []);

  const clearOperationHistory = useCallback(async () => {
    if (!workflow) return;
    await operationHistoryApi.clear(workflow.id);
    setUndoStack([]);
    setRedoStack([]);
    setOperationLog([]);
  }, [workflow]);

  // ---- Computed ----
  const selectedNode = useMemo(
    () => workflow?.nodes.find(n => n.id === selectedNodeId) ?? null,
    [workflow, selectedNodeId],
  );

  return {
    // State
    workflow, setWorkflow,
    isDirty, isSaving, autoSaveSuspended, setAutoSaveSuspended, isLoading, loadError,
    selectedNodeId, setSelectedNodeId,
    selectedNodeIds, setSelectedNodeIds,
    rightTab, setRightTab,
    isEditingName, setIsEditingName,
    editingName, setEditingName,
    isPreview, setIsPreview,
    isPreviewDirty,
    prePreviewWorkflow,
    undoStack, redoStack, operationLog,
    triggerDialogOpen, setTriggerDialogOpen,
    pluginsDialogOpen, setPluginsDialogOpen,
    pluginPickerDialogOpen, setPluginPickerDialogOpen,
    embeddedEditorOpen, setEmbeddedEditorOpen,
    embeddedSubWorkflowId, setEmbeddedSubWorkflowId,

    // Actions
    markDirty, markPreviewDirty, pushUndo, handleUndo, handleRedo, clearOperationHistory,
    enterPreview, enterSnapshotPreview, exitPreview, savePreviewEdits,
    saveWorkflow,
    startEditName, finishEditName,
    handleExport, handleImport,
    handleWorkflowMetaChange: useCallback((nextWorkflow: Workflow) => {
      setWorkflow(nextWorkflow);
      markDirty();
    }, [markDirty]),

    // Computed
    selectedNode,
    workflowId,
  };
}
