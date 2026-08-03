import { NODE_TYPES, isImageProcessNodeType } from './constants.js';

export const GROUP_EXECUTION_MODES = {
  count: 'count',
  assets: 'assets',
};

export const GROUP_OUTPUT_FILTER_MODES = {
  all: 'all',
  nodes: 'nodes',
  types: 'types',
};

export const DEFAULT_GROUP_EXECUTION_COUNT = 1;
export const MAX_GROUP_EXECUTION_COUNT = 50;

const MANUAL_UPLOAD_NODE_TYPES = new Set([
  NODE_TYPES.editImage,
  NODE_TYPES.imageProcess,
  NODE_TYPES.imageEditor,
  NODE_TYPES.pixelEditor,
  NODE_TYPES.uiSplitter,
  NODE_TYPES.bboxViewer,
  NODE_TYPES.promptReverse,
  NODE_TYPES.videoGenerator,
  NODE_TYPES.cutout,
  NODE_TYPES.directorDesk,
  NODE_TYPES.photopea,
]);

export function cloneSerializable(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function snapshotNodeStates(nodes, nodeIds) {
  const idSet = new Set(nodeIds);
  const states = {};
  for (const node of nodes) {
    if (idSet.has(node.id)) states[node.id] = cloneSerializable(node.data || {});
  }
  return states;
}

export function createGroupExecution(nodes, nodeIds) {
  const states = snapshotNodeStates(nodes, nodeIds);
  return {
    mode: GROUP_EXECUTION_MODES.count,
    count: {
      target: DEFAULT_GROUP_EXECUTION_COUNT,
      activeId: 'count-1',
      runs: [{ id: 'count-1', index: 1, nodeStates: states }],
    },
    assets: {
      activeId: null,
      templateNodeStates: null,
      runs: [],
      binding: null,
      sourceSignature: null,
    },
  };
}

export function ensureGroupExecution(value, nodes, nodeIds) {
  if (!value || typeof value !== 'object') return createGroupExecution(nodes, nodeIds);
  const fallback = createGroupExecution(nodes, nodeIds);
  const countRuns = Array.isArray(value.count?.runs) && value.count.runs.length
    ? value.count.runs
    : fallback.count.runs;
  const target = clampExecutionCount(value.count?.target || countRuns.length);
  const countActiveId = countRuns.some((run) => run.id === value.count?.activeId)
    ? value.count.activeId
    : countRuns[0]?.id || null;
  const assetRuns = Array.isArray(value.assets?.runs) ? value.assets.runs : [];
  const assetActiveId = assetRuns.some((run) => run.id === value.assets?.activeId)
    ? value.assets.activeId
    : assetRuns[0]?.id || null;
  return {
    mode: value.mode === GROUP_EXECUTION_MODES.assets
      ? GROUP_EXECUTION_MODES.assets
      : GROUP_EXECUTION_MODES.count,
    count: { target, activeId: countActiveId, runs: countRuns },
    assets: {
      activeId: assetActiveId,
      templateNodeStates: value.assets?.templateNodeStates || null,
      runs: assetRuns,
      binding: normalizeGroupOutputBinding(value.assets?.binding),
      sourceSignature: value.assets?.sourceSignature || null,
    },
  };
}

export function normalizeGroupOutputBinding(value) {
  if (!value?.sourceGroupId) return null;
  const requestedMode = value.filter?.mode;
  const mode = Object.values(GROUP_OUTPUT_FILTER_MODES).includes(requestedMode)
    ? requestedMode
    : GROUP_OUTPUT_FILTER_MODES.all;
  return {
    sourceGroupId: value.sourceGroupId,
    filter: {
      mode,
      nodeIds: uniqueStrings(value.filter?.nodeIds),
      nodeTypes: uniqueStrings(value.filter?.nodeTypes),
    },
  };
}

export function resolveGroupOutputFilter(value, sourceGroupId) {
  const binding = normalizeGroupOutputBinding(value);
  if (binding && sourceGroupId && binding.sourceGroupId === sourceGroupId) return binding.filter;
  return { mode: GROUP_OUTPUT_FILTER_MODES.all, nodeIds: [], nodeTypes: [] };
}

export function collectGroupOutputAssets(nodes, sourceNodeIds, binding) {
  const normalized = normalizeGroupOutputBinding(binding);
  if (!normalized) return [];
  const sourceIds = new Set(sourceNodeIds || []);
  const selectedNodeIds = new Set(normalized.filter.nodeIds);
  const selectedTypes = new Set(normalized.filter.nodeTypes);
  const assets = [];
  for (const node of nodes || []) {
    if (!sourceIds.has(node.id)) continue;
    if (normalized.filter.mode === GROUP_OUTPUT_FILTER_MODES.nodes && !selectedNodeIds.has(node.id)) continue;
    if (normalized.filter.mode === GROUP_OUTPUT_FILTER_MODES.types && !selectedTypes.has(node.type)) continue;
    const images = Array.isArray(node.data?.output?.images) ? node.data.output.images : [];
    images.forEach((url, index) => {
      if (typeof url !== 'string' || !url) return;
      assets.push({
        id: `group-output-${node.id}-${index + 1}`,
        name: `${node.data?.label || node.id} ${index + 1}`,
        url,
        sourceNodeId: node.id,
        sourceNodeType: node.type,
      });
    });
  }
  return assets;
}

export function groupOutputAssetsSignature(binding, assets) {
  return JSON.stringify({
    binding: normalizeGroupOutputBinding(binding),
    assets: (assets || []).map((item) => [item.id, item.url]),
  });
}

export function wouldCreateGroupOutputBindingCycle(groups, sourceGroupId, targetGroupId) {
  if (!sourceGroupId || !targetGroupId) return false;
  if (sourceGroupId === targetGroupId) return true;
  const byId = new Map((groups || []).map((group) => [group.id, group]));
  const visited = new Set();
  let currentId = sourceGroupId;
  while (currentId && !visited.has(currentId)) {
    if (currentId === targetGroupId) return true;
    visited.add(currentId);
    currentId = normalizeGroupOutputBinding(
      byId.get(currentId)?.batchExecution?.assets?.binding,
    )?.sourceGroupId;
  }
  return false;
}

export function clampExecutionCount(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return DEFAULT_GROUP_EXECUTION_COUNT;
  return Math.max(1, Math.min(MAX_GROUP_EXECUTION_COUNT, number));
}

export function saveActiveRun(execution, nodeStates) {
  const section = execution[execution.mode];
  if (!section?.activeId) return execution;
  return {
    ...execution,
    [execution.mode]: {
      ...section,
      runs: section.runs.map((run) => (
        run.id === section.activeId ? { ...run, nodeStates: cloneSerializable(nodeStates) } : run
      )),
    },
  };
}

export function mergeRunNodeStates(nodeStates, nodes, nodeIds) {
  const merged = cloneSerializable(nodeStates || {}) || {};
  for (const node of nodes) {
    if (nodeIds.includes(node.id) && !merged[node.id]) {
      merged[node.id] = cloneSerializable(node.data || {});
    }
  }
  return merged;
}

export function resetNodeResults(data) {
  const next = cloneSerializable(data || {}) || {};
  next.status = 'idle';
  next.loading = false;
  next.uploading = false;
  delete next.error;
  delete next.statusMsg;
  delete next.uploadError;
  delete next.versions;
  delete next.activeVersion;
  if (next.output && typeof next.output === 'object') {
    next.output = { ...next.output };
    if ('images' in next.output) next.output.images = [];
    if ('audio' in next.output) next.output.audio = null;
    if ('video' in next.output) next.output.video = null;
    if ('text' in next.output) next.output.text = '';
  }
  return next;
}

export function createFreshNodeStates(nodeStates) {
  const next = {};
  for (const [nodeId, data] of Object.entries(nodeStates || {})) {
    next[nodeId] = resetNodeResults(data);
  }
  return next;
}

export function countManualImageSlots(nodes, edges, nodeIds) {
  const idSet = new Set(nodeIds);
  const incomingCount = countIncomingEdges(edges);
  let count = 0;
  for (const node of nodes) {
    if (!idSet.has(node.id)) continue;
    count += manualSlotCount(node, incomingCount.get(node.id) || 0);
  }
  return count;
}

export function applyAssetToNodeStates(nodeStates, nodes, edges, nodeIds, assetUrl) {
  const result = createFreshNodeStates(nodeStates);
  const idSet = new Set(nodeIds);
  const incomingCount = countIncomingEdges(edges);
  for (const node of nodes) {
    if (!idSet.has(node.id) || !result[node.id]) continue;
    delete result[node.id].groupAssetInputUrls;
    const incoming = incomingCount.get(node.id) || 0;
    if (node.type === NODE_TYPES.imageCompare) {
      if (incoming < 1) {
        result[node.id].first = { ...(result[node.id].first || {}), uploadedImages: [assetUrl] };
      }
      if (incoming < 2) {
        result[node.id].second = { ...(result[node.id].second || {}), uploadedImages: [assetUrl] };
      }
      if (incoming < 2) result[node.id].groupAssetInputUrls = [assetUrl];
      continue;
    }
    if (node.type === NODE_TYPES.imageDisplay && incoming === 0) {
      result[node.id].images = [assetUrl];
      result[node.id].source = 'upload';
      result[node.id].groupAssetInputUrls = [assetUrl];
      continue;
    }
    if (isManualUploadNode(node) && incoming === 0) {
      result[node.id].uploadedImages = [assetUrl];
      result[node.id].groupAssetInputUrls = [assetUrl];
    }
  }
  return result;
}

function isManualUploadNode(node) {
  return MANUAL_UPLOAD_NODE_TYPES.has(node.type) || isImageProcessNodeType(node.type);
}

function manualSlotCount(node, incoming) {
  if (node.type === NODE_TYPES.imageCompare) return Math.max(0, 2 - incoming);
  if (node.type === NODE_TYPES.imageDisplay) return incoming === 0 ? 1 : 0;
  return isManualUploadNode(node) && incoming === 0 ? 1 : 0;
}

function countIncomingEdges(edges) {
  const counts = new Map();
  for (const edge of edges) counts.set(edge.target, (counts.get(edge.target) || 0) + 1);
  return counts;
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter((value) => (
    typeof value === 'string' && value
  ))));
}
