'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeTypeDefinition } from '@agent-spaces/shared';
import { Layout, Model, TabNode, IJsonModel, ITabRenderValues, Actions, Action } from 'flexlayout-react';
import type { ExecutionStep, StagedNode, WorkflowTemplate, Workflow as WorkflowType } from '@agent-spaces/shared';
import { WorkflowCanvas } from './workflow-canvas';
import { WorkflowNodeSidebar } from './workflow-node-sidebar';
import { WorkflowEditorToolbar } from './workflow-editor-toolbar';
import { WorkflowPropertiesPanel } from './workflow-properties-panel';
import { WorkflowExecutionBar } from './workflow-execution-bar';
import { WorkflowVersionPanel } from './workflow-version-panel';
import { WorkflowOperationHistory } from './workflow-operation-history';
import { WorkflowStagingPanel } from './workflow-staging-panel';
import { WorkflowTriggerDialog } from './workflow-trigger-dialog';
import { WorkflowEmbeddedEditor } from './workflow-embedded-editor';
import { WorkflowInteractionDialog } from './workflow-interaction-dialog';
import { WorkflowPluginsDialog } from './workflow-plugins-dialog';
import { WorkflowPluginPickerDialog } from './workflow-plugin-picker-dialog';
import { WorkflowNodeSelectDialog } from './workflow-node-select-dialog';
import { WorkflowVariablesForm } from './workflow-variables-form';
import { WorkflowCanvasStylePanel } from './workflow-canvas-style-panel';
import { WorkflowNodeListPanel } from './workflow-node-list-panel';
import { FloatingChatPanel } from '@/components/ui/floating-chat-widget';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResizablePanel, ResizableHandle, ResizablePanelGroup } from '@/components/ui/resizable';
import { Loader2, AlertCircle, Settings2, Trash2, Package, Braces, History, Waypoints, Workflow, Play, Palette, ListTree } from 'lucide-react';
import { useEditorShortcuts, useClipboard, parseWorkflowClipboardText, type ClipboardRecord } from '@/hooks/use-workflow-editor';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorkflowEditorState } from './use-workflow-editor-state';
import { useWorkflowEditorCanvas } from './use-workflow-editor-canvas';
import { useWorkflowEditorExecution } from './use-workflow-editor-execution';
import { useWorkflowEditorAgentChat } from './use-workflow-editor-agent-chat';
import { WORKFLOW_AGENT_FIXED_VALUES, getWorkflowAgentTimeline } from './workflow-editor-agent-utils';
import type { WorkflowAgentChatMessage, WorkflowToolCall } from './workflow-editor-agent-utils';
import { WORKFLOW_LAYOUT_KEY, WORKFLOW_LAYOUT_TEMPLATES_KEY } from './workflow-editor-types';
import type { DebugResult } from './workflow-editor-types';
import { registerPluginNodeDefinitions } from '@/lib/workflow-nodes';
import { pluginApi } from '@/lib/workflow-plugin-api';
import { stagingApi } from '@/lib/workflow-api';
import {
  JSON_PRESETS_KEY,
  SELECTED_JSON_PRESET_KEY,
  TEMP_DEBUG_PRESET_ID,
  getJsonPresets,
  isPlainObject,
  type JsonPreset,
} from './workflow-properties-utils';
import { replaceFieldKeyReferences } from './workflow-canvas-references';
import type { WorkflowFieldKeyRenameParams } from './workflow-properties-io-sections';
import { syncWorkflowReferenceEdges } from './workflow-reference-edges';

// ---- flexlayout-react default model ----

const defaultJson: IJsonModel = {
  global: {
    tabSetEnableTabStrip: true,
    borderEnableDrop: true,
    tabEnableClose: false,
    tabEnableRename: false,
    tabSetEnableMaximize: false,
  },
  borders: [
    {
      type: 'border',
      location: 'bottom',
      children: [
        { type: 'tab', name: 'Execution', component: 'execution-bar', id: 'execution-bar' },
        { type: 'tab', name: 'Staging', component: 'staging', id: 'staging' },
      ],
    },
  ],
  layout: {
    type: 'row',
    children: [
      {
        type: 'tabset',
        weight: 0.18,
        children: [
          { type: 'tab', name: 'Nodes', component: 'node-sidebar', id: 'node-sidebar' },
          { type: 'tab', name: 'Canvas Style', component: 'canvas-style', id: 'canvas-style' },
          { type: 'tab', name: 'Variables', component: 'variables', id: 'variables' },
        ],
      },
      {
        type: 'tabset',
        weight: 0.52,
        children: [
          { type: 'tab', name: 'Canvas', component: 'canvas', id: 'canvas' },
        ],
      },
      {
        type: 'tabset',
        weight: 0.30,
        children: [
          { type: 'tab', name: 'Properties', component: 'properties', id: 'properties' },
          { type: 'tab', name: 'History', component: 'history', id: 'history' },
          { type: 'tab', name: 'Node List', component: 'node-list', id: 'node-list' },
        ],
      },
    ],
  },
};

// ---- Tab icon map ----

const WORKFLOW_TAB_ICONS: Record<string, React.ReactNode> = {
  'node-sidebar': <Waypoints size={16} />,
  'canvas': <Workflow size={16} />,
  'properties': <Settings2 size={16} />,
  'canvas-style': <Palette size={16} />,
  'variables': <Braces size={16} />,
  'history': <History size={16} />,
  'node-list': <ListTree size={16} />,
  'staging': <Package size={16} />,
  'execution-bar': <Play size={16} />,
};

// ---- Inner editor (needs ReactFlow context) ----

function toPreviewDebugResult(step: ExecutionStep | undefined): DebugResult | null {
  if (!step || (step.status !== 'completed' && step.status !== 'error')) return null;
  return {
    status: step.status,
    output: step.output,
    error: step.error,
    duration: step.finishedAt ? Math.max(0, step.finishedAt - step.startedAt) : undefined,
    logs: step.logs,
  };
}

function getLastExecutionStepByNodeId(steps: ExecutionStep[] | undefined, nodeId: string | null | undefined): ExecutionStep | undefined {
  if (!steps || !nodeId) return undefined;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.nodeId === nodeId) return step;
  }
  return undefined;
}

function toPresetOutputs(output: unknown): Record<string, unknown> {
  return isPlainObject(output) ? output : { result: output };
}

function normalizeExecutionStepOutput(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { result: output };
  const record = output as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return { ...(record.data as Record<string, unknown>), ...record };
  }
  return record;
}

function getReachableNodeIds(workflow: WorkflowType, startNodeId: string): Set<string> {
  const reachable = new Set<string>([startNodeId]);
  const queue = [startNodeId];
  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    for (const edge of workflow.edges) {
      if (edge.source !== sourceId || reachable.has(edge.target)) continue;
      reachable.add(edge.target);
      queue.push(edge.target);
    }
  }
  return reachable;
}

function clearPresetFromNode(node: WorkflowType['nodes'][number], presetId: string): WorkflowType['nodes'][number] {
  const presets = getJsonPresets(node.data?.[JSON_PRESETS_KEY]);
  const nextPresets = presets.filter(item => item.id !== presetId);
  const selectedPresetId = node.data?.[SELECTED_JSON_PRESET_KEY];
  if (nextPresets.length === presets.length && selectedPresetId !== presetId) return node;
  return {
    ...node,
    data: {
      ...node.data,
      [JSON_PRESETS_KEY]: nextPresets,
      ...(selectedPresetId === presetId ? { [SELECTED_JSON_PRESET_KEY]: '' } : {}),
    },
  };
}

function applyExecutionStepPresets(
  workflow: WorkflowType,
  steps: ExecutionStep[],
  currentNodeId: string,
  presetId: string,
): { workflow: WorkflowType; context: Record<string, unknown> } | null {
  const currentStepIndices = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.nodeId === currentNodeId);
  if (currentStepIndices.length === 0) return null;
  const currentStepIndex = currentStepIndices[currentStepIndices.length - 1]!.index;
  const rerunNodeIds = getReachableNodeIds(workflow, currentNodeId);
  const contextData: Record<string, unknown> = {};
  const contextInputs: Record<string, unknown> = {};

  const stepByNodeId = new Map<string, ExecutionStep>();
  for (const step of steps.slice(0, currentStepIndex + 1)) {
    if (step.status === 'completed' && step.output !== undefined) {
      stepByNodeId.set(step.nodeId, step);
      contextData[step.nodeId] = normalizeExecutionStepOutput(step.output);
      if (step.input !== undefined) contextInputs[step.nodeId] = step.input;
    }
  }

  let changed = false;
  const nodes = workflow.nodes.map((node) => {
    if (rerunNodeIds.has(node.id)) {
      const nextNode = clearPresetFromNode(node, presetId);
      if (nextNode !== node) changed = true;
      return nextNode;
    }
    if (node.data?.[SELECTED_JSON_PRESET_KEY]) return node;
    const step = stepByNodeId.get(node.id);
    if (!step) return node;

    const presets = getJsonPresets(node.data?.[JSON_PRESETS_KEY]);
    const preset: JsonPreset = {
      id: presetId,
      name: presetId,
      data: {},
      inputs: isPlainObject(step.input) ? step.input : {},
      outputs: toPresetOutputs(normalizeExecutionStepOutput(step.output)),
    };
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        [JSON_PRESETS_KEY]: [...presets.filter(item => item.id !== presetId), preset],
        [SELECTED_JSON_PRESET_KEY]: presetId,
      },
    };
  });

  return {
    workflow: changed ? { ...workflow, nodes } : workflow,
    context: {
      __data__: contextData,
      __inputs__: contextInputs,
    },
  };
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// 将一组节点的几何中心对齐到指定中心点（保留节点间相对位置）
function centerNodeGroup<T extends { position: { x: number; y: number } }>(
  nodes: T[],
  center: { x: number; y: number },
): T[] {
  if (nodes.length === 0) return nodes;
  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dx = center.x - cx;
  const dy = center.y - cy;
  return nodes.map(n => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
}

function readImageSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function getGalleryPreviewSize(imageSize: { width: number; height: number } | null) {
  if (!imageSize || imageSize.width <= 0 || imageSize.height <= 0) {
    return { width: 320, height: 220 };
  }
  const aspect = imageSize.width / imageSize.height;
  const minWidth = 220;
  const minHeight = 180;
  const maxWidth = 520;
  const maxHeight = 420;
  let width = Math.round(240 * aspect);
  let height = 240;

  if (width < minWidth) {
    width = minWidth;
    height = Math.round(width / aspect);
  }
  if (width > maxWidth) {
    width = maxWidth;
    height = Math.round(width / aspect);
  }
  if (height < minHeight) {
    height = minHeight;
    width = Math.round(height * aspect);
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * aspect);
  }

  return {
    width: Math.max(minWidth, Math.min(maxWidth, width)),
    height: Math.max(minHeight, Math.min(maxHeight, height)),
  };
}

function getCenteredNodePosition(center: { x: number; y: number }, size: { width: number; height: number }) {
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  };
}

type WorkflowCanvasViewportRef = {
  exportCanvas: (format: 'png' | 'jpeg') => void;
  getViewportCenter: () => { x: number; y: number };
  focusNode: (nodeId: string) => void;
  selectAll: () => void;
  invertSelection: () => void;
};

function collectReferencedPluginIds(workflow: WorkflowType | null, nodeTypePluginIds: Map<string, string>): string[] {
  if (!workflow) return [];
  const ids = new Set<string>(workflow.enabledPlugins || []);
  for (const node of workflow.nodes) {
    const pluginId = node.data?.pluginId;
    if (typeof pluginId === 'string' && pluginId.trim()) ids.add(pluginId.trim());
    const nodeTypePluginId = nodeTypePluginIds.get(node.type);
    if (nodeTypePluginId) ids.add(nodeTypePluginId);
  }
  return Array.from(ids);
}

function WorkflowEditorInner({
  template, onBack,
}: {
  template: WorkflowTemplate | null;
  onBack: () => void;
}) {
  const t = useTranslations('workflows');
  const canvasExportRef = useRef<WorkflowCanvasViewportRef | null>(null);
  // ---- State ----
  const state = useWorkflowEditorState(template);
  const [installedWorkflowPlugins, setInstalledWorkflowPlugins] = useState<Map<string, boolean>>(new Map());
  const [installedWorkflowNodeTypePluginIds, setInstalledWorkflowNodeTypePluginIds] = useState<Map<string, string>>(new Map());
  const [pluginListLoaded, setPluginListLoaded] = useState(false);
  const autoOpenedMissingPluginsRef = useRef<string | null>(null);
  const workspaces = useWorkspaceStore((store) => store.workspaces);
  const workspaceId = workspaces[0]?.id;
  const clipboard = useClipboard();

  const execution = useWorkflowEditorExecution({
    workflow: state.workflow,
    workflowId: state.workflowId,
    workspaceId,
  });
  const { clearSelectedExecutionLog } = execution;

  const isWorkflowRunning = execution.execStatus === 'running' || execution.execStatus === 'paused';
  const isWorkflowReadOnly = isWorkflowRunning;
  const markEditorDirty = state.isPreview ? state.markPreviewDirty : state.markDirty;

  const canvas = useWorkflowEditorCanvas({
    workflow: state.workflow,
    isReadOnly: isWorkflowReadOnly,
    setWorkflow: state.setWorkflow,
    markDirty: markEditorDirty,
    pushUndo: state.pushUndo,
    selectedNodeId: state.selectedNodeId,
    setSelectedNodeId: state.setSelectedNodeId,
    selectedNodeIds: state.selectedNodeIds,
    setSelectedNodeIds: state.setSelectedNodeIds,
    onCopyNodes: (nodeIds) => {
      if (!state.workflow) return;
      const ids = new Set(nodeIds);
      const nodes = state.workflow.nodes.filter(n => ids.has(n.id));
      const edges = state.workflow.edges.filter(e => ids.has(e.source) && ids.has(e.target));
      if (nodes.length > 0) clipboard.copy(nodes, edges);
    },
    onStageNode: (nodeId) => {
      if (!state.workflow) return;
      const node = state.workflow.nodes.find(n => n.id === nodeId);
      if (!node) return;
      const staged = {
        id: `staged_${Date.now()}`,
        sourceNodeId: node.id,
        type: node.type,
        label: node.label,
        data: JSON.parse(JSON.stringify(node.data)),
        composite: node.composite ? JSON.parse(JSON.stringify(node.composite)) : undefined,
        stagedAt: Date.now(),
      };
      stagingApi.load(state.workflowId!).then(existing => {
        const updated = [...existing, staged];
        stagingApi.save(state.workflowId!, updated).catch(() => {});
        window.dispatchEvent(new CustomEvent('workflow:node-staged', { detail: { staged } }));
      }).catch(() => {});
    },
  });

  const selectedNodeIds = useMemo(() => (
    state.selectedNodeIds.length > 0
      ? state.selectedNodeIds
      : state.selectedNodeId ? [state.selectedNodeId] : []
  ), [state.selectedNodeId, state.selectedNodeIds]);
  const selectedNodeIdsKey = selectedNodeIds.join('\0');
  const selectedWorkflowAgentNodes = useMemo(() => {
    if (!state.workflow || selectedNodeIds.length === 0) return [];
    const selectedIdSet = new Set(selectedNodeIds);
    return state.workflow.nodes.filter(node => selectedIdSet.has(node.id));
  }, [state.workflow, selectedNodeIds]);
  const [workflowAgentSelectionActive, setWorkflowAgentSelectionActive] = useState(false);

  useEffect(() => {
    setWorkflowAgentSelectionActive(selectedWorkflowAgentNodes.length > 0);
  }, [selectedNodeIdsKey, selectedWorkflowAgentNodes.length]);

  const chat = useWorkflowEditorAgentChat({
    workflow: state.workflow,
    setWorkflow: state.setWorkflow,
    markDirty: markEditorDirty,
    pushUndo: state.pushUndo,
    selectedNodes: workflowAgentSelectionActive ? selectedWorkflowAgentNodes : [],
    workspaceId,
  });

  const clipboardImagePasteEnabled = state.workflow?.layoutSnapshot?.pasteClipboardImagesAsGallery !== false;
  const previewResult = useMemo(() => {
    if (!state.isPreview || !state.selectedNodeId) return null;
    const step = getLastExecutionStepByNodeId(execution.executionLog?.steps, state.selectedNodeId);
    return toPreviewDebugResult(step);
  }, [execution.executionLog, state.isPreview, state.selectedNodeId]);

  const { enterPreview, exitPreview, isPreview, markPreviewDirty, saveWorkflow, setWorkflow } = state;
  const referencedPluginIds = useMemo(() => collectReferencedPluginIds(state.workflow, installedWorkflowNodeTypePluginIds), [installedWorkflowNodeTypePluginIds, state.workflow]);
  const missingPluginIds = useMemo(() => {
    if (!pluginListLoaded) return [];
    const enabledSet = new Set(state.workflow?.enabledPlugins || []);
    return referencedPluginIds.filter(id => !installedWorkflowPlugins.has(id) || !installedWorkflowPlugins.get(id) || !enabledSet.has(id));
  }, [installedWorkflowPlugins, pluginListLoaded, referencedPluginIds, state.workflow?.enabledPlugins]);
  const missingPluginSearch = missingPluginIds.find(id => !installedWorkflowPlugins.has(id)) || '';

  const handleFieldKeyRename = useCallback((params: WorkflowFieldKeyRenameParams) => {
    if (isWorkflowReadOnly) return;
    setWorkflow((current) => {
      if (!current) return current;
      console.debug('[FIELD-KEY-RENAME][WorkflowEditor:start]', {
        params,
        nodeCount: current.nodes.length,
        edgeCount: current.edges.length,
      });
      const changedNodeIds: string[] = [];
      const nextNodes = current.nodes.map((node) => {
        const nextData = replaceFieldKeyReferences(node.data, [params]) as typeof node.data;
        if (JSON.stringify(nextData) !== JSON.stringify(node.data)) {
          changedNodeIds.push(node.id);
        }
        return {
          ...node,
          data: nextData,
        };
      });
      const nextWorkflow = {
        ...current,
        nodes: nextNodes,
        variables: current.variables
          ? replaceFieldKeyReferences(current.variables, [params]) as typeof current.variables
          : current.variables,
      };
      const syncedWorkflow = syncWorkflowReferenceEdges(nextWorkflow);
      console.debug('[FIELD-KEY-RENAME][WorkflowEditor:done]', {
        params,
        changedNodeIds,
        edgeCountBefore: current.edges.length,
        edgeCountAfter: syncedWorkflow.edges.length,
        referenceEdges: syncedWorkflow.edges
          .filter(edge => edge.edgeKind === 'reference')
          .map(edge => ({
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          })),
      });
      return syncedWorkflow;
    });
    markEditorDirty();
  }, [isWorkflowReadOnly, markEditorDirty, setWorkflow]);

  // 复用：取画布视口中心（带兜底）
  const getViewportCenter = useCallback((): { x: number; y: number } =>
    canvasExportRef.current?.getViewportCenter() ?? { x: 250, y: 250 }, []);

  // 仅粘贴工作流节点剪贴板（指定 record 时粘贴该条，否则粘贴最近一次），居中到视口
  const pasteWorkflowNodes = useCallback((record?: ClipboardRecord) => {
    const pasted = clipboard.paste(record);
    if (!pasted || !state.workflow) return;
    state.pushUndo('paste');
    const nodes = centerNodeGroup(pasted.nodes, getViewportCenter());
    state.setWorkflow(w => w ? {
      ...w,
      nodes: [...w.nodes, ...nodes],
      edges: [...w.edges, ...pasted.edges],
    } : null);
    const pastedNodeIds = nodes.map(node => node.id);
    state.setSelectedNodeIds(pastedNodeIds);
    state.setSelectedNodeId(pastedNodeIds.length === 1 ? pastedNodeIds[0] : null);
    markEditorDirty();
  }, [clipboard, getViewportCenter, markEditorDirty, state]);

  const addImageBlobsToCanvas = useCallback(async (imageBlobs: Blob[], center: { x: number; y: number }) => {
    if (imageBlobs.length === 0) return false;
    const sources = (await Promise.all(imageBlobs.map(readBlobAsDataUrl))).filter(Boolean);
    if (sources.length === 0) return false;
    const previewSize = getGalleryPreviewSize(await readImageSize(sources[0] || ''));
    const position = getCenteredNodePosition(center, previewSize);
    const createdAt = Date.now();
    canvas.handleNodeAdd('gallery_preview', position, previewSize, {
      items: sources.map((src, index) => ({
        id: `clipboard_image_${createdAt}_${index}`,
        src,
        thumb: src,
        type: 'image',
        caption: '',
      })),
    });
    return true;
  }, [canvas]);

  const pasteClipboardNodes = useCallback(async () => {
    if (clipboardImagePasteEnabled && typeof navigator !== 'undefined' && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        const imageBlobs: Blob[] = [];
        for (const item of items) {
          const imageType = item.types.find(type => type.startsWith('image/'));
          if (imageType) imageBlobs.push(await item.getType(imageType));
        }
        if (imageBlobs.length > 0) {
          if (await addImageBlobsToCanvas(imageBlobs, getViewportCenter())) return;
        }
      } catch {
        // Browser clipboard image access is optional.
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        const workflowClipboardData = parseWorkflowClipboardText(clipboardText);
        if (workflowClipboardData) {
          clipboard.copy(workflowClipboardData.nodes, workflowClipboardData.edges);
        }
      } catch {
        // Browser clipboard text access is optional.
      }
    }

    pasteWorkflowNodes();
  }, [addImageBlobsToCanvas, clipboard, getViewportCenter, pasteWorkflowNodes, clipboardImagePasteEnabled]);

  const moveClipboardNodesToStaging = useCallback(async (record?: ClipboardRecord) => {
    const copied = clipboard.getData(record);
    if (!copied || !state.workflowId) return;
    const stagedNodes: StagedNode[] = copied.nodes.map((node, index) => ({
      id: `staged_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      sourceNodeId: node.id,
      type: node.type,
      label: node.label,
      data: JSON.parse(JSON.stringify(node.data)),
      composite: node.composite ? JSON.parse(JSON.stringify(node.composite)) : undefined,
      stagedAt: Date.now(),
    }));
    if (stagedNodes.length === 0) return;

    try {
      const existing = await stagingApi.load(state.workflowId);
      await stagingApi.save(state.workflowId, [...existing, ...stagedNodes]);
      for (const staged of stagedNodes) {
        window.dispatchEvent(new CustomEvent('workflow:node-staged', { detail: { staged } }));
      }
      clipboard.clear();
    } catch {
      // Staging is optional
    }
  }, [clipboard, state.workflowId]);

  const handlePreviewNodeDataUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    if (!isPreview) return;
    setWorkflow((current) => {
      if (!current) return current;
      return {
        ...current,
        nodes: current.nodes.map((node) => node.id === nodeId ? {
          ...node,
          label: typeof data.label === 'string' ? data.label : node.label,
          data: { ...node.data, ...data },
        } : node),
      };
    });
    markPreviewDirty();
  }, [isPreview, markPreviewDirty, setWorkflow]);

  const continueFromPreviewNode = useCallback((nodeId: string, presetId: string) => {
    if (!state.isPreview || !state.workflow || !execution.executionLog) return;
    const baseWorkflow = state.workflow;
    const normalizedPresetId = presetId.trim() || TEMP_DEBUG_PRESET_ID;
    const prepared = applyExecutionStepPresets(
      baseWorkflow,
      execution.executionLog.steps,
      nodeId,
      normalizedPresetId,
    );
    if (!prepared) return;

    state.setWorkflow(prepared.workflow);
    execution.handleExecute(undefined, nodeId, undefined, prepared.workflow, prepared.context);
  }, [execution, state]);

  useEffect(() => {
    const handleContinueFromPreview = (event: Event) => {
      const detail = (event as CustomEvent).detail as { nodeId?: unknown; presetId?: unknown } | undefined;
      if (typeof detail?.nodeId !== 'string') return;
      continueFromPreviewNode(
        detail.nodeId,
        typeof detail.presetId === 'string' ? detail.presetId : TEMP_DEBUG_PRESET_ID,
      );
    };
    window.addEventListener('workflow:continue-from-preview-node', handleContinueFromPreview);
    return () => window.removeEventListener('workflow:continue-from-preview-node', handleContinueFromPreview);
  }, [continueFromPreviewNode]);

  const exitExecutionPreview = useCallback(() => {
    exitPreview();
    clearSelectedExecutionLog();
  }, [clearSelectedExecutionLog, exitPreview]);
  const autoPreviewLogIdRef = useRef<string | null>(null);

  // Auto-preview when execution finishes in the current session
  useEffect(() => {
    const log = execution.executionLog;
    const isFinished = execution.execStatus === 'completed' || execution.execStatus === 'error';
    if (!isFinished || !log?.snapshot) return;
    if (execution.selectedExecutionLogId !== log.id) return;
    if (autoPreviewLogIdRef.current === log.id) return;

    autoPreviewLogIdRef.current = log.id;
    enterPreview(log);
  }, [enterPreview, execution.execStatus, execution.executionLog, execution.selectedExecutionLogId]);

  // Restore last run result on open when the pref is enabled
  useEffect(() => {
    if (state.workflow?.layoutSnapshot?.autoPreviewLastRun !== true) return;
    if (!execution.executionLogs.length) return;
    if (execution.currentExecutionId) return; // active execution, not a restore
    const log = execution.executionLogs.find(l =>
      (l.status === 'completed' || l.status === 'error') && l.snapshot
    );
    if (!log || autoPreviewLogIdRef.current === log.id) return;
    autoPreviewLogIdRef.current = log.id;
    execution.handleSelectExecutionLog(log);
    enterPreview(log);
  }, [enterPreview, execution.executionLogs, execution.currentExecutionId, execution.handleSelectExecutionLog, state.workflow?.layoutSnapshot?.autoPreviewLastRun]);

  // ---- Load plugin node definitions at editor level ----
  // Must happen here, not in WorkflowNodeSidebar, so canvas works even when sidebar tab is closed
  const enabledPlugins = useMemo(() => state.workflow?.enabledPlugins || [], [state.workflow?.enabledPlugins]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!enabledPlugins.length) {
        registerPluginNodeDefinitions([]);
        const plugins = await pluginApi.listWorkflowPlugins();
        if (!cancelled) {
          setInstalledWorkflowPlugins(new Map(plugins.map(plugin => [plugin.id, plugin.enabled])));
          const nodeTypePluginIds = new Map<string, string>();
          await Promise.all(plugins.filter(plugin => plugin.enabled).map(async (plugin) => {
            try {
              const nodes = await pluginApi.getWorkflowNodes(plugin.id);
              for (const node of nodes) nodeTypePluginIds.set(node.type, plugin.id);
            } catch { /* best-effort */ }
          }));
          if (cancelled) return;
          setInstalledWorkflowNodeTypePluginIds(nodeTypePluginIds);
          setPluginListLoaded(true);
        }
        return;
      }
      const plugins = await pluginApi.listWorkflowPlugins();
      const enabledSet = new Set(enabledPlugins);
      const activePlugins = plugins.filter(p => enabledSet.has(p.id));
      const allNodes: NodeTypeDefinition[] = [];
      const nodeTypePluginIds = new Map<string, string>();
      await Promise.all(plugins.filter(plugin => plugin.enabled).map(async (plugin) => {
        try {
          const nodes = await pluginApi.getWorkflowNodes(plugin.id);
          for (const node of nodes) nodeTypePluginIds.set(node.type, plugin.id);
        } catch { /* best-effort */ }
      }));
      for (const plugin of activePlugins) {
        try {
          const nodes = await pluginApi.getWorkflowNodes(plugin.id);
          allNodes.push(...nodes.map(node => ({
            ...node,
            pluginId: plugin.id,
            pluginIconPath: plugin.iconPath,
          })));
        } catch (error) {
          console.warn('[WorkflowEditor] failed to load plugin nodes', plugin.id, error);
        }
      }
      if (!cancelled) {
        setInstalledWorkflowPlugins(new Map(plugins.map(plugin => [plugin.id, plugin.enabled])));
        setInstalledWorkflowNodeTypePluginIds(nodeTypePluginIds);
        setPluginListLoaded(true);
        registerPluginNodeDefinitions(allNodes);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [enabledPlugins]);

  useEffect(() => {
    if (!state.workflow || missingPluginIds.length === 0) return;
    const key = `${state.workflow.id}:${missingPluginIds.join(',')}`;
    if (autoOpenedMissingPluginsRef.current === key) return;
    autoOpenedMissingPluginsRef.current = key;
    state.setPluginsDialogOpen(true);
  }, [missingPluginIds, state.workflow, state.setPluginsDialogOpen]);

  useEffect(() => {
    if (!isWorkflowRunning || !canvas.nodeSelectOpen) return;
    canvas.handleNodeSelectOpenChange(false);
  }, [canvas, isWorkflowRunning]);

  // ---- Shortcuts ----
  useEditorShortcuts({
    onSave: state.saveWorkflow,
    onUndo: isWorkflowReadOnly ? undefined : state.handleUndo,
    onRedo: isWorkflowReadOnly ? undefined : state.handleRedo,
    onDelete: !isWorkflowReadOnly && state.selectedNodeId ? () => canvas.handleNodeDelete(state.selectedNodeId!) : undefined,
    onCopy: !isWorkflowReadOnly && selectedNodeIds.length > 0 && state.workflow ? () => {
      const selectedIds = new Set(selectedNodeIds);
      const nodes = state.workflow!.nodes.filter(node => selectedIds.has(node.id));
      const edges = state.workflow!.edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target));
      if (nodes.length > 0) clipboard.copy(nodes, edges);
    } : undefined,
    onPaste: isWorkflowReadOnly ? undefined : pasteClipboardNodes,
  });

  const addStagedNodeToCanvas = useCallback((staged: StagedNode, position: { x: number; y: number }) => {
    const workflow = state.workflow;
    if (!workflow || isWorkflowReadOnly) return;
    state.pushUndo('add from staging');
    const newNode: typeof workflow.nodes[0] = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: staged.type,
      label: staged.label || (staged.data?.label as string) || '',
      position,
      data: { ...(staged.data || {}) },
      composite: staged.composite ? JSON.parse(JSON.stringify(staged.composite)) : undefined,
    };
    state.setWorkflow(w => w ? { ...w, nodes: [...w.nodes, newNode] } : null);
    state.setSelectedNodeId(newNode.id);
    state.setSelectedNodeIds([newNode.id]);
    markEditorDirty();
  }, [isWorkflowReadOnly, markEditorDirty, state]);

  // ---- flexlayout-react model ----
  const [model, setModel] = useState(() => {
    try {
      const saved = localStorage.getItem(WORKFLOW_LAYOUT_KEY);
      if (saved) return Model.fromJson(JSON.parse(saved));
    } catch { /* ignore */ }
    return Model.fromJson(defaultJson);
  });

  // ---- Layout manager integration (save / apply / reset editor panel layout) ----
  const getEditorLayout = useCallback((): IJsonModel | null => {
    try {
      return model.toJson();
    } catch {
      return null;
    }
  }, [model]);

  const applyEditorLayout = useCallback((json: IJsonModel) => {
    try {
      localStorage.setItem(WORKFLOW_LAYOUT_KEY, JSON.stringify(json));
      setModel(Model.fromJson(json));
    } catch { /* ignore */ }
  }, []);

  const resetEditorLayout = useCallback(() => {
    localStorage.removeItem(WORKFLOW_LAYOUT_KEY);
    setModel(Model.fromJson(defaultJson));
  }, []);

  // Sync rightTab when selecting a node → switch to properties tab in flexlayout.
  // From the node-list panel we want to land on Canvas instead, so a skip flag gates it.
  const skipAutoSelectPropertiesRef = useRef(false);
  useEffect(() => {
    if (!state.selectedNodeId) return;
    if (skipAutoSelectPropertiesRef.current) {
      skipAutoSelectPropertiesRef.current = false;
      return;
    }
    const node = model.getNodeById('properties');
    if (node && node instanceof TabNode) {
      model.doAction(Actions.selectTab(node.getId()));
    }
  }, [state.selectedNodeId, model]);

  // Click a node in the node-list panel: select it and jump to Canvas (not Properties).
  const handleSelectNodeFromList = useCallback((nodeId: string) => {
    skipAutoSelectPropertiesRef.current = true;
    state.setSelectedNodeId(nodeId);
    state.setSelectedNodeIds([nodeId]);
    const canvasNode = model.getNodeById('canvas');
    if (canvasNode && canvasNode instanceof TabNode) {
      model.doAction(Actions.selectTab(canvasNode.getId()));
    }
    // 切到 Canvas tab 后等一帧再居中，确保 reactflow 节点已渲染
    setTimeout(() => canvasExportRef.current?.focusNode(nodeId), 120);
  }, [canvasExportRef, model, state]);

  const handleDeleteGroup = useCallback((nodeIds: string[]) => {
    if (isWorkflowReadOnly || nodeIds.length === 0) return;
    canvas.handleBatchDeleteNodes(nodeIds);
  }, [canvas, isWorkflowReadOnly]);

  // 节点运行：与 workflow-node.tsx handleTestNode 一致，调试/取消调试该节点
  const handleTestNodeFromList = useCallback((nodeId: string) => {
    if (isWorkflowRunning) return;
    if (execution.debugNodeId === nodeId) {
      window.dispatchEvent(new CustomEvent('workflow:cancel-debug-node', { detail: { nodeId } }));
    } else {
      window.dispatchEvent(new CustomEvent('workflow:debug-node', { detail: { nodeId } }));
    }
  }, [execution.debugNodeId, isWorkflowRunning]);

  // 分组运行：与 execution-bar 一致，从默认 start node 执行整个 workflow
  const handleExecuteWorkflowFromList = useCallback(() => {
    if (isWorkflowRunning) return;
    execution.handleExecute();
  }, [execution, isWorkflowRunning]);

  const canRunWorkflowTest = !state.isPreview
    && execution.execStatus !== 'running'
    && execution.execStatus !== 'paused'
    && !execution.executionValidationError;

  const handleRunWorkflowTest = useCallback(() => {
    if (!canRunWorkflowTest) return;
    const executionBarNode = model.getNodeById('execution-bar');
    if (executionBarNode) {
      model.doAction(Actions.selectTab(executionBarNode.getId()));
    }
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('workflow:open-execution-input'));
    }, 0);
  }, [canRunWorkflowTest, model]);

  const onModelChange = useCallback((_model: Model, action: Action) => {
    try {
      localStorage.setItem(WORKFLOW_LAYOUT_KEY, JSON.stringify(_model.toJson()));
    } catch { /* quota exceeded */ }

    if (action.type === Actions.SELECT_TAB) {
      const node = _model.getNodeById(action.data.tabNode);
      if (node && node instanceof TabNode) {
        const comp = node.getComponent();
        if (['properties', 'canvas-style', 'variables', 'history', 'node-list', 'staging'].includes(comp ?? '')) {
          state.setRightTab(comp!);
        }
      }
    }
  }, [state]);

  const onRenderTab = useCallback((node: TabNode, renderValues: ITabRenderValues) => {
    const icon = WORKFLOW_TAB_ICONS[node.getComponent() ?? ''];
    if (icon) {
      renderValues.content = <span title={node.getName()} className="flex items-center justify-center">{icon}</span>;
    }
  }, []);

  const factory = useCallback((node: TabNode) => {
    const comp = node.getComponent();
    const workflow = state.workflow;
    if (!workflow) return null;

    switch (comp) {
      case 'node-sidebar':
        return (
          <WorkflowNodeSidebar
            workflow={workflow}
            onWorkflowChange={(nextWorkflow) => {
              state.setWorkflow(nextWorkflow);
              markEditorDirty();
            }}
            onOpenPluginPicker={() => state.setPluginPickerDialogOpen(true)}
          />
        );
      case 'canvas':
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0">
              <WorkflowCanvas
                workflow={workflow}
                isPreview={state.isPreview}
                execStatus={execution.execStatus}
                isRunning={isWorkflowRunning}
                executionLog={execution.executionLog}
                selectedNodeId={state.selectedNodeId}
                selectedNodeIds={state.selectedNodeIds}
                onNodeAdd={canvas.handleNodeAdd}
                onImageFilesDrop={isWorkflowReadOnly ? undefined : (files, position) => {
                  void addImageBlobsToCanvas(files, position);
                }}
                onStagedNodeDrop={addStagedNodeToCanvas}
                onNodeDelete={canvas.handleNodeDelete}
                onNodeCopy={canvas.handleNodeCopy}
                onNodeClone={canvas.handleNodeClone}
                onNodeStage={canvas.handleNodeStage}
                onMergeNodesToWorkflow={canvas.handleMergeNodesToWorkflow}
                onMergeNodesToGroup={canvas.handleMergeNodesToGroup}
                onBatchDeleteNodes={canvas.handleBatchDeleteNodes}
                onGroupUpdate={canvas.handleUpdateGroup}
                onGroupDelete={canvas.handleUngroup}
                onGroupMove={canvas.handleMoveGroup}
                debugNodeId={execution.debugNodeId}
                debugStatus={execution.debugStatus}
                pausedNodeId={execution.pausedNodeId}
                pausedReason={execution.pausedReason}
                partialExecutionStartNodeId={execution.partialExecutionStartNodeId}
                onNodeDebug={execution.handleDebugNode}
                onCancelDebug={execution.handleCancelDebug}
                onExecuteFromNode={(nodeId) => execution.handleExecute(undefined, nodeId)}
                onResumeExecution={execution.handleResumeExecution}
                onStopExecution={execution.handleStopExecution}
                onNodeSelect={canvas.handleNodeSelect}
                onNodesSelect={canvas.handleNodesSelect}
                onNodeDataUpdate={canvas.handleNodeDataUpdate}
                onFieldKeyRename={handleFieldKeyRename}
                onEdgeDataUpdate={canvas.handleEdgeDataUpdate}
                onNodesChange={canvas.handleNodesChange}
                onNodeDragStateChange={state.setAutoSaveSuspended}
                onEdgesChange={canvas.handleEdgesChange}
                onConnect={canvas.handleConnect}
                onConnectionDrop={canvas.handleConnectionDrop}
                onRectangleDrawNodeSelect={canvas.handleRectangleDrawNodeSelect}
                onInsertExistingNodeOnEdge={canvas.handleInsertExistingNodeOnEdge}
                canUndo={state.undoStack.length > 0}
                canRedo={state.redoStack.length > 0}
                onUndo={isWorkflowReadOnly ? undefined : state.handleUndo}
                onRedo={isWorkflowReadOnly ? undefined : state.handleRedo}
                onExitPreview={exitExecutionPreview}
                onAutoLayout={canvas.handleAutoLayout}
                copiedNodeCount={clipboard.count}
                copiedRecords={isWorkflowReadOnly ? [] : clipboard.records}
                onPasteRecord={isWorkflowReadOnly ? undefined : (id) => {
                  const record = clipboard.records.find(r => r.id === id);
                  if (record) pasteWorkflowNodes(record);
                }}
                onMoveRecord={isWorkflowReadOnly ? undefined : (id) => {
                  const record = clipboard.records.find(r => r.id === id);
                  if (record) void moveClipboardNodesToStaging(record);
                }}
                onClearCopiedNodes={clipboard.clear}
                canvasExportRef={canvasExportRef}
              />
            </div>
          </div>
        );
      case 'properties':
        return (
          <WorkflowPropertiesPanel
            node={state.selectedNode}
            isPreview={state.isPreview}
            nodes={workflow.nodes}
            edges={workflow.edges}
            variableContextWorkflow={state.isPreview ? state.prePreviewWorkflow : null}
            enabledPlugins={workflow.enabledPlugins}
            variables={workflow.variables || []}
            onUpdateData={canvas.handleNodeDataUpdate}
            onPreviewUpdateData={handlePreviewNodeDataUpdate}
            onFieldKeyRename={handleFieldKeyRename}
            debugNodeId={execution.debugNodeId}
            debugStatus={execution.debugStatus}
            debugResult={execution.debugResult}
            previewResult={previewResult}
            onDebugNode={execution.handleDebugNode}
            onCancelDebug={execution.handleCancelDebug}
            executionLog={execution.executionLog}
            workspaceId={workspaceId}
          />
        );
      case 'canvas-style':
        return (
          <WorkflowCanvasStylePanel
            canvasPrefs={workflow.layoutSnapshot ?? {}}
            onCanvasPreferencesChange={(prefs) => {
              if (isWorkflowReadOnly) return;
              const updated = { ...workflow, layoutSnapshot: prefs };
              state.setWorkflow(updated);
              if (state.isPreview) markEditorDirty();
              else saveWorkflow(updated);
            }}
            onAutoLayout={isWorkflowReadOnly ? undefined : canvas.handleAutoLayout}
            isCanvasLocked={isWorkflowReadOnly}
          />
        );
      case 'variables':
        return (
          <WorkflowVariablesForm
            value={workflow.variables || []}
            nodes={workflow.nodes}
            edges={workflow.edges}
            currentNodeId={state.selectedNodeId}
            enabledPlugins={workflow.enabledPlugins}
            variables={workflow.variables || []}
            onFieldKeyRename={handleFieldKeyRename}
            onChange={(variables) => {
              if (isWorkflowReadOnly) return;
              state.pushUndo('update variables');
              state.setWorkflow(w => w ? { ...w, variables } : null);
              markEditorDirty();
            }}
          />
        );
      case 'history':
        return (
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel id="history-versions" defaultSize="50%" minSize="20%">
              <WorkflowVersionPanel
                workflowId={workflow.id}
                nodes={workflow.nodes}
                edges={workflow.edges}
                onRestore={(version) => {
                  if (isWorkflowReadOnly) return;
                  state.pushUndo('restore version');
                  state.setWorkflow(w => w ? {
                    ...w,
                    nodes: version.snapshot?.nodes || [],
                    edges: (version.snapshot?.edges || []) as typeof workflow.edges,
                  } : null);
                  markEditorDirty();
                }}
                onPreview={(version) => {
                  if (isWorkflowReadOnly) return;
                  state.enterSnapshotPreview(version.snapshot);
                }}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="history-operations" defaultSize="50%" minSize="20%">
              <WorkflowOperationHistory
                entries={state.operationLog}
                currentEntryIndex={isWorkflowReadOnly ? -1 : state.undoStack.length - 1}
                currentUndoCount={isWorkflowReadOnly ? 0 : state.undoStack.length}
                currentRedoCount={isWorkflowReadOnly ? 0 : state.redoStack.length}
                onUndo={isWorkflowReadOnly ? () => {} : state.handleUndo}
                onRedo={isWorkflowReadOnly ? () => {} : state.handleRedo}
                onClear={state.clearOperationHistory}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        );
      case 'node-list':
        return (
          <WorkflowNodeListPanel
            nodes={workflow.nodes}
            edges={workflow.edges}
            groups={workflow.groups || []}
            selectedNodeId={state.selectedNodeId}
            isReadOnly={isWorkflowReadOnly}
            isCanvasLocked={isWorkflowReadOnly}
            onSelectNode={handleSelectNodeFromList}
            onDeleteGroup={isWorkflowReadOnly ? undefined : handleDeleteGroup}
            onTestNode={handleTestNodeFromList}
            onExecuteWorkflow={handleExecuteWorkflowFromList}
            isExecuting={isWorkflowRunning}
            onRenameGroup={canvas.handleRenameGroup}
            onUngroup={canvas.handleUngroup}
            onBatchUngroup={canvas.handleBatchUngroup}
            onFocusGroup={canvas.handleFocusGroup}
          />
        );
      case 'staging':
        return (
          <WorkflowStagingPanel
            workflowId={workflow.id}
            onAddFromStaging={(staged) => addStagedNodeToCanvas(staged, { x: 250 + Math.random() * 100, y: 250 + Math.random() * 100 })}
          />
        );
      case 'execution-bar':
        return (
          <WorkflowExecutionBar
            status={execution.execStatus}
            log={execution.executionLog}
            logs={execution.executionLogs}
            selectedLogId={execution.selectedExecutionLogId}
            workflowErrorMessage={execution.workflowErrorMessage}
            startNodes={execution.startNodes}
            variables={workflow.variables || []}
            validationError={execution.executionValidationError}
            workflowId={state.workflowId}
            isPreview={state.isPreview}
            onExecute={execution.handleExecute}
            onPause={execution.handlePauseExecution}
            onResume={execution.handleResumeExecution}
            onStop={execution.handleStopExecution}
            onSelectLog={(log) => {
              execution.handleSelectExecutionLog(log);
              state.enterPreview(log);
            }}
            onDeleteLog={execution.handleDeleteExecutionLog}
            onClearLogs={execution.handleClearExecutionLogs}
            onUpdateNodeData={canvas.handleNodeDataUpdate}
          />
        );
      default:
        return null;
    }
  }, [
    state,
    execution,
    canvas,
    isWorkflowRunning,
    isWorkflowReadOnly,
    addImageBlobsToCanvas,
    addStagedNodeToCanvas,
    handleSelectNodeFromList,
    handleDeleteGroup,
    handleTestNodeFromList,
    handleExecuteWorkflowFromList,
    clipboard.clear,
    clipboard.count,
    exitExecutionPreview,
    handleFieldKeyRename,
    handlePreviewNodeDataUpdate,
    markEditorDirty,
    moveClipboardNodesToStaging,
    pasteWorkflowNodes,
    previewResult,
    saveWorkflow,
    workspaceId,
    clipboard.records,
  ]);

  // ---- Render ----
  if (state.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('editor.loading')}</span>
      </div>
    );
  }

  if (state.loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <span className="text-sm text-destructive">{state.loadError}</span>
        <Button variant="outline" size="sm" onClick={onBack}>{t('editor.back')}</Button>
      </div>
    );
  }

  if (!state.workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('editor.noWorkflow')}</span>
        <Button variant="outline" size="sm" onClick={onBack}>{t('editor.back')}</Button>
      </div>
    );
  }

  const workflow = state.workflow;

  return (
    <div className="flex flex-col h-full bg-muted/30 p-1.5 gap-1.5" tabIndex={0}>
      <WorkflowEditorToolbar
        workflow={workflow}
        isDirty={state.isDirty}
        isPreview={state.isPreview}
        isPreviewDirty={state.isPreviewDirty}
        onBack={onBack}
        onExitPreview={exitExecutionPreview}
        onSave={isWorkflowReadOnly || state.isPreview ? () => {} : state.saveWorkflow}
        canRunTest={canRunWorkflowTest}
        onRunTest={handleRunWorkflowTest}
        onSavePreviewEdits={state.savePreviewEdits}
        onExport={(format) => canvasExportRef.current?.exportCanvas(format)}
        isExporting={false}
        canUndo={state.undoStack.length > 0}
        canRedo={state.redoStack.length > 0}
        onUndo={isWorkflowReadOnly ? undefined : state.handleUndo}
        onRedo={isWorkflowReadOnly ? undefined : state.handleRedo}
        onAutoLayout={isWorkflowReadOnly ? undefined : (direction) => canvas.handleAutoLayout(direction)}
        onSelectAll={() => canvasExportRef.current?.selectAll()}
        onInvertSelection={() => canvasExportRef.current?.invertSelection()}
        onExportWorkflow={state.handleExport}
        onImport={isWorkflowReadOnly ? () => {} : state.handleImport}
        onOpenPluginManager={() => state.setPluginsDialogOpen(true)}
        onOpenTriggerDialog={() => state.setTriggerDialogOpen(true)}
        missingPluginCount={missingPluginIds.length}
        workflowErrorMessage={execution.workflowErrorMessage}
        onOpenWorkflowLocation={() => {
          if (workflow?.id) {
            fetch(`/api/folder/reveal?path=${encodeURIComponent(`workflows/${workflow.id}`)}`, { method: 'POST' });
          }
        }}
        onClearNodes={() => {
          if (!workflow || isWorkflowReadOnly) return;
          const nodes = workflow.nodes
            .filter(n => n.type === 'start' || n.type === 'end')
            .map(n => (n.type === 'start' ? { ...n, data: { inputFields: [] } } : { ...n, data: {} }));
          const updated = { ...workflow, nodes, edges: [], variables: [] };
          state.setWorkflow(updated);
          if (state.isPreview) markEditorDirty();
          else saveWorkflow(updated);
        }}
        onWorkflowInfoChange={(updates) => {
          if (workflow && !isWorkflowReadOnly) {
            const updated = { ...workflow, ...updates };
            state.setWorkflow(updated);
            if (state.isPreview) markEditorDirty();
            else saveWorkflow(updated);
          }
        }}
        layoutManager={{
          title: '编辑器布局管理',
          description: '保存、切换或管理工作流编辑器面板布局',
          templatesStorageKey: WORKFLOW_LAYOUT_TEMPLATES_KEY,
          getCurrentLayout: getEditorLayout,
          onApply: applyEditorLayout,
          onReset: resetEditorLayout,
        }}
      />

      <div className="flex-1 min-h-0 relative">
        <Layout model={model} factory={factory} onRenderTab={onRenderTab} onModelChange={onModelChange} />
      </div>

      {/* Trigger settings dialog */}
      <WorkflowTriggerDialog
        open={state.triggerDialogOpen}
        triggers={workflow?.triggers || []}
        workflowId={workflow?.id || ''}
        onSave={(triggers) => {
          if (isWorkflowReadOnly) return;
          state.setWorkflow(w => w ? { ...w, triggers } : null);
          markEditorDirty();
        }}
        onClose={() => state.setTriggerDialogOpen(false)}
      />

      {/* Embedded sub-workflow editor */}
      <WorkflowEmbeddedEditor
        open={state.embeddedEditorOpen}
        parentWorkflowId={workflow?.id || ''}
        subWorkflowId={state.embeddedSubWorkflowId}
        onClose={() => state.setEmbeddedEditorOpen(false)}
        onSave={(subId) => {
          if (state.selectedNodeId && workflow && !isWorkflowReadOnly) {
            canvas.handleNodeDataUpdate(state.selectedNodeId, { workflowId: subId });
          }
          state.setEmbeddedEditorOpen(false);
        }}
      />

      <WorkflowInteractionDialog
        request={execution.pendingInteraction}
        onResolve={execution.handleResolveInteraction}
        onCancel={execution.handleCancelInteraction}
      />

      <WorkflowPluginsDialog
        open={state.pluginsDialogOpen}
        onOpenChange={state.setPluginsDialogOpen}
        workflow={workflow}
        missingPluginIds={missingPluginIds}
        initialSearch={missingPluginSearch}
        onWorkflowChange={(nextWorkflow) => {
          state.setWorkflow(nextWorkflow);
          markEditorDirty();
        }}
      />

      <WorkflowPluginPickerDialog
        open={state.pluginPickerDialogOpen}
        onOpenChange={state.setPluginPickerDialogOpen}
        workflow={workflow}
        onWorkflowChange={(nextWorkflow) => {
          state.setWorkflow(nextWorkflow);
          markEditorDirty();
        }}
      />

      <WorkflowNodeSelectDialog
        open={canvas.nodeSelectOpen && !isWorkflowReadOnly}
        workflow={workflow}
        onOpenChange={canvas.handleNodeSelectOpenChange}
        onSelect={isWorkflowReadOnly ? () => {} : canvas.handleNodeSelectFromDialog}
      />

      <FloatingChatPanel
        isOpen={chat.agentOpen}
        onClose={() => chat.setAgentOpen(false)}
        onToggle={() => chat.setAgentOpen((open) => !open)}
        agent={{ name: t('editor.agentName'), role: 'LangChain', status: chat.agentSending ? 'busy' : 'online' }}
        messages={chat.agentMessages}
        sending={chat.agentSending}
        input={chat.agentInput}
        onInputChange={chat.setAgentInput}
        onSend={chat.sendWorkflowAgentMessage}
        onStop={chat.stopWorkflowAgentMessage}
        onDeleteMessage={chat.deleteAgentMessage}
        onRerunTool={(message, item) => chat.rerunWorkflowAgentTool(message.id, item)}
        inputPlaceholder={t('editor.inputPlaceholder')}
        inputContext={selectedWorkflowAgentNodes.length > 0 ? (
          <button
            type="button"
            onClick={() => setWorkflowAgentSelectionActive(active => !active)}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-colors ${
              workflowAgentSelectionActive
                ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                : 'border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/60'
            }`}
            title={workflowAgentSelectionActive ? '点击停用节点上下文' : '点击启用节点上下文'}
          >
            <span className="font-medium">选中了 {selectedWorkflowAgentNodes.length} 个节点</span>
            <span>{workflowAgentSelectionActive ? '已激活' : '未激活'}</span>
          </button>
        ) : null}
        headerActions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-background/50"
              onClick={chat.openAgentSettings}
              title={t('editor.modelSettings')}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-background/50"
              onClick={chat.clearWorkflowAgentMessages}
              title={t('editor.clearMessages')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
        width={440}
        height={420}
        renderMessageContent={(message) => (
          message.content.trim()
            ? <span className="whitespace-pre-wrap break-words">{message.content}</span>
            : null
        )}
        serializeForCopy={(message) => {
          const m = message as WorkflowAgentChatMessage;
          const thinkMatch = m.content.match(/^<think\s*>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
          const text = thinkMatch ? thinkMatch[2].trim() : m.content;
          const timeline = getWorkflowAgentTimeline(m);
          if (!timeline.length) return text;
          const lines: string[] = [];
          for (const item of timeline) {
            if (item.type === 'message') {
              lines.push(`[消息] ${item.content}`);
            } else if (item.type === 'tool') {
              const tool = item as WorkflowToolCall;
              const input = tool.input != null ? `\n  输入: ${JSON.stringify(tool.input, null, 2)}` : '';
              const result = tool.result != null ? `\n  结果: ${JSON.stringify(tool.result, null, 2)}` : '';
              lines.push(`[${tool.status === 'success' ? '✓' : tool.status === 'error' ? '✗' : '…'}] ${tool.name}${input}${result}`);
            }
          }
          return lines.length ? `${text}\n\n---\n${lines.join('\n')}` : text;
        }}
      />

      <Dialog open={chat.agentSettingsOpen} onOpenChange={chat.setAgentSettingsOpen}>
        <DialogContent className="flex max-h-[86vh] min-w-[60vw] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{t('editor.agentSettingsTitle')}</DialogTitle>
          </DialogHeader>
          {chat.agentSettingsLoading || !chat.agentSettingsDraft ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('editor.loadingShort')}
            </div>
          ) : (
            <AgentEditor
              agent={chat.agentSettingsDraft}
              onSaved={(saved) => {
                chat.setAgentSettingsDraft(saved);
                chat.setAgentSettingsOpen(false);
              }}
              onBack={() => chat.setAgentSettingsOpen(false)}
              fixedValues={WORKFLOW_AGENT_FIXED_VALUES}
              lockedFields={{
                role: true,
                runtimeKind: true,
                workingDir: true,
                systemPrompt: true,
                mcps: true,
                tools: true,
                skills: true,
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Main export (with ReactFlowProvider) ----

export function WorkflowEditor({
  template, onBack,
}: {
  template: WorkflowTemplate | null;
  onBack: () => void;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner template={template} onBack={onBack} />
    </ReactFlowProvider>
  );
}
