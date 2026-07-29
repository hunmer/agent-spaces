import { useCallback, useMemo, useRef } from 'react';
import { genId } from '../utils/canvas-id';
import { collectGroupNodeIds } from '../utils/group-helpers';
import {
  GROUP_EXECUTION_MODES,
  applyAssetToNodeStates,
  clampExecutionCount,
  cloneSerializable,
  countManualImageSlots,
  createFreshNodeStates,
  ensureGroupExecution,
  mergeRunNodeStates,
  saveActiveRun,
  snapshotNodeStates,
} from '../utils/group-execution';

export default function useGroupExecution({ groups, nodes, edges, setGroups, setNodes }) {
  const groupsRef = useRef(groups);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  groupsRef.current = groups;
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const inputSlotCounts = useMemo(() => {
    const result = new Map();
    for (const group of groups) {
      const nodeIds = collectGroupNodeIds(groups, group.id);
      result.set(group.id, countManualImageSlots(nodes, edges, nodeIds));
    }
    return result;
  }, [edges, groups, nodes]);

  const runningGroupIds = useMemo(() => {
    const result = new Set();
    for (const group of groups) {
      const nodeIds = new Set(collectGroupNodeIds(groups, group.id));
      if (nodes.some((node) => nodeIds.has(node.id)
        && (node.data?.status === 'running' || node.data?.loading))) {
        result.add(group.id);
      }
    }
    return result;
  }, [groups, nodes]);

  const protectedImageUrls = useMemo(() => groups.flatMap((group) => {
    const execution = group.batchExecution;
    if (execution?.mode !== GROUP_EXECUTION_MODES.assets) return [];
    const active = execution.assets?.runs?.find((run) => run.id === execution.assets.activeId);
    return active?.url ? [active.url] : [];
  }), [groups]);

  const commit = useCallback((groupId, execution, nodeStates = null) => {
    setGroups((prev) => prev.map((group) => (
      group.id === groupId ? { ...group, batchExecution: execution } : group
    )));
    if (!nodeStates) return;
    setNodes((prev) => prev.map((node) => (
      Object.prototype.hasOwnProperty.call(nodeStates, node.id)
        ? { ...node, data: cloneSerializable(nodeStates[node.id]) }
        : node
    )));
  }, [setGroups, setNodes]);

  const getContext = useCallback((groupId) => {
    const currentGroups = groupsRef.current;
    const currentNodes = nodesRef.current;
    const group = currentGroups.find((item) => item.id === groupId);
    if (!group) return null;
    const nodeIds = collectGroupNodeIds(currentGroups, groupId);
    const currentStates = snapshotNodeStates(currentNodes, nodeIds);
    const execution = ensureGroupExecution(group.batchExecution, currentNodes, nodeIds);
    const busy = currentNodes.some((node) => nodeIds.includes(node.id)
      && (node.data?.status === 'running' || node.data?.loading));
    return { group, nodeIds, currentNodes, currentStates, execution, busy };
  }, []);

  const setMode = useCallback((groupId, mode) => {
    if (mode !== GROUP_EXECUTION_MODES.count && mode !== GROUP_EXECUTION_MODES.assets) return;
    const context = getContext(groupId);
    if (!context || context.busy) return;
    let execution = saveActiveRun(context.execution, context.currentStates);
    let targetStates = null;
    if (mode === GROUP_EXECUTION_MODES.assets && !execution.assets.templateNodeStates) {
      execution = {
        ...execution,
        assets: { ...execution.assets, templateNodeStates: cloneSerializable(context.currentStates) },
      };
    }
    const targetSection = execution[mode];
    const active = targetSection.runs.find((run) => run.id === targetSection.activeId);
    if (active) {
      targetStates = mergeRunNodeStates(active.nodeStates, context.currentNodes, context.nodeIds);
    }
    commit(groupId, { ...execution, mode }, targetStates);
  }, [commit, getContext]);

  const setCount = useCallback((groupId, value) => {
    const context = getContext(groupId);
    if (!context || context.busy) return;
    const target = clampExecutionCount(value);
    let execution = saveActiveRun(context.execution, context.currentStates);
    const currentRuns = execution.count.runs;
    let runs = currentRuns.filter((run) => run.index <= target);
    const freshSource = createFreshNodeStates(context.currentStates);
    for (let index = runs.length + 1; index <= target; index += 1) {
      runs.push({ id: `count-${index}`, index, nodeStates: cloneSerializable(freshSource) });
    }
    let activeId = execution.count.activeId;
    if (!runs.some((run) => run.id === activeId)) activeId = runs[runs.length - 1]?.id || null;
    const active = runs.find((run) => run.id === activeId);
    execution = {
      ...execution,
      mode: GROUP_EXECUTION_MODES.count,
      count: { target, activeId, runs },
    };
    const targetStates = active
      ? mergeRunNodeStates(active.nodeStates, context.currentNodes, context.nodeIds)
      : null;
    commit(groupId, execution, targetStates);
  }, [commit, getContext]);

  const switchRun = useCallback((groupId, mode, runId) => {
    const context = getContext(groupId);
    if (!context || context.busy) return;
    let execution = saveActiveRun(context.execution, context.currentStates);
    const section = execution[mode];
    const run = section?.runs.find((item) => item.id === runId);
    if (!run) return;
    execution = {
      ...execution,
      mode,
      [mode]: { ...section, activeId: runId },
    };
    const targetStates = mergeRunNodeStates(run.nodeStates, context.currentNodes, context.nodeIds);
    commit(groupId, execution, targetStates);
  }, [commit, getContext]);

  const uploadAssets = useCallback(async (groupId, fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type?.startsWith('image/'));
    if (!files.length) return { added: 0, failed: [] };
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) throw new Error('上传能力不可用');
    const uploadedItems = [];
    const failed = [];
    for (const file of files) {
      try {
        const uploaded = await AS.uploadFile(file);
        const url = uploaded?.url || uploaded?.httpPath;
        if (!url) throw new Error('上传未返回 URL');
        uploadedItems.push({ url, name: file.name });
      } catch (error) {
        console.error('Group asset upload failed:', error);
        failed.push(file.name);
      }
    }
    if (!uploadedItems.length) return { added: 0, failed };

    const context = getContext(groupId);
    if (!context) return { added: 0, failed };
    if (context.busy) throw new Error('分组正在执行，请等待完成后再添加素材');
    let execution = saveActiveRun(context.execution, context.currentStates);
    const template = execution.assets.templateNodeStates || context.currentStates;
    const newRuns = uploadedItems.map((item) => ({
      id: genId('asset-run'),
      name: item.name,
      url: item.url,
      nodeStates: applyAssetToNodeStates(
        template,
        context.currentNodes,
        edgesRef.current,
        context.nodeIds,
        item.url,
      ),
    }));
    const activeId = newRuns[0].id;
    const runs = [...execution.assets.runs, ...newRuns];
    execution = {
      ...execution,
      mode: GROUP_EXECUTION_MODES.assets,
      assets: {
        ...execution.assets,
        templateNodeStates: cloneSerializable(template),
        activeId,
        runs,
      },
    };
    commit(groupId, execution, newRuns[0].nodeStates);
    return { added: newRuns.length, failed };
  }, [commit, getContext]);

  const removeAsset = useCallback((groupId, runId) => {
    const context = getContext(groupId);
    if (!context || context.busy) {
      console.debug('[GroupExecutionDebug] remove asset ignored', {
        groupId, runId, reason: context ? 'group-running' : 'group-missing',
      });
      return;
    }
    let execution = context.execution;
    const index = execution.assets.runs.findIndex((run) => run.id === runId);
    if (index < 0) {
      console.debug('[GroupExecutionDebug] remove asset ignored', { groupId, runId, reason: 'run-missing' });
      return;
    }
    const runs = execution.assets.runs.filter((run) => run.id !== runId);
    let activeId = execution.assets.activeId;
    let targetStates = null;
    if (activeId === runId) {
      const nextRun = runs[Math.min(index, runs.length - 1)] || null;
      activeId = nextRun?.id || null;
      targetStates = nextRun?.nodeStates || execution.assets.templateNodeStates;
    } else {
      execution = saveActiveRun(execution, context.currentStates);
    }
    execution = {
      ...execution,
      assets: { ...execution.assets, activeId, runs },
    };
    console.debug('[GroupExecutionDebug] remove asset committed', {
      groupId, runId, remaining: runs.length, activeId,
    });
    commit(groupId, execution, targetStates);
  }, [commit, getContext]);

  return {
    inputSlotCounts,
    runningGroupIds,
    protectedImageUrls,
    setMode,
    setCount,
    switchRun,
    uploadAssets,
    removeAsset,
  };
}
