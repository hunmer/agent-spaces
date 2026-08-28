import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { genId } from '../utils/canvas-id';
import { collectGroupNodeIds } from '../utils/group-helpers';
import {
  GROUP_EXECUTION_MODES,
  applyExecutionNodePatch,
  applyNodePropertiesToAssetRuns,
  applyAssetToNodeStates,
  clampExecutionCount,
  cloneSerializable,
  collectGroupOutputAssets,
  countManualImageSlots,
  createFreshNodeStates,
  ensureGroupExecution,
  getRunExecutionTarget,
  groupOutputAssetsSignature,
  mergeRunNodeStates,
  normalizeGroupOutputBinding,
  saveActiveRun,
  snapshotNodeStates,
  updateRunNodeState,
  wouldCreateGroupOutputBindingCycle,
} from '../utils/group-execution';
import { applyCanvasCollectionUpdate } from '../utils/canvas-state-updates';

export default function useGroupExecution({ groups, nodes, edges, updateCanvasData }) {
  const [propertyApply, setPropertyApply] = useState(null);
  const [runAllStates, setRunAllStates] = useState({});
  const runAllStatesRef = useRef(runAllStates);
  const stoppedGroupIdsRef = useRef(new Set());
  const groupsRef = useRef(groups);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  groupsRef.current = groups;
  nodesRef.current = nodes;
  edgesRef.current = edges;
  runAllStatesRef.current = runAllStates;

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

  const propertyApplyNodeIds = useMemo(() => {
    const result = new Set();
    for (const group of groups) {
      const assets = group.batchExecution?.assets;
      if (group.batchExecution?.mode !== GROUP_EXECUTION_MODES.assets
        || !assets?.activeId || (assets.runs?.length || 0) < 2) continue;
      collectGroupNodeIds(groups, group.id).forEach((nodeId) => result.add(nodeId));
    }
    return result;
  }, [groups]);

  const commit = useCallback((groupId, execution, nodeStates = null) => {
    const groupRequest = {
      source: 'group-execution',
      targetType: 'group',
      targetId: groupId,
      key: 'batchExecution',
      value: execution,
      method: 'replace',
    };
    // refs 先同步，保证连续执行不会读到 React 尚未提交的旧快照。
    groupsRef.current = applyCanvasCollectionUpdate(groupsRef.current, groupRequest);
    updateCanvasData(groupRequest);
    if (!nodeStates) return;
    Object.entries(nodeStates).forEach(([nodeId, data]) => {
      const nodeRequest = {
        source: 'group-execution',
        targetType: 'node',
        targetId: nodeId,
        key: 'data',
        value: cloneSerializable(data),
        method: 'replace',
      };
      nodesRef.current = applyCanvasCollectionUpdate(nodesRef.current, nodeRequest);
      updateCanvasData(nodeRequest);
    });
  }, [updateCanvasData]);

  const getContext = useCallback((groupId) => {
    const currentGroups = groupsRef.current;
    const currentNodes = nodesRef.current;
    const group = currentGroups.find((item) => item.id === groupId);
    if (!group) return null;
    const nodeIds = collectGroupNodeIds(currentGroups, groupId);
    const currentStates = snapshotNodeStates(currentNodes, nodeIds);
    const execution = ensureGroupExecution(group.batchExecution, currentNodes, nodeIds, groupId);
    const busy = currentNodes.some((node) => nodeIds.includes(node.id)
      && (node.data?.status === 'running' || node.data?.loading));
    return { group, nodeIds, currentNodes, currentStates, execution, busy };
  }, []);

  const requestPropertyApply = useCallback((nodeId) => {
    const currentGroups = groupsRef.current;
    const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!sourceNode) return;
    const candidates = currentGroups
      .map((group) => ({
        group,
        nodeIds: collectGroupNodeIds(currentGroups, group.id),
      }))
      .filter(({ group, nodeIds }) => (
        nodeIds.includes(nodeId)
        && group.batchExecution?.mode === GROUP_EXECUTION_MODES.assets
        && group.batchExecution?.assets?.activeId
        && (group.batchExecution?.assets?.runs?.length || 0) > 1
      ))
      .sort((left, right) => left.nodeIds.length - right.nodeIds.length);
    const target = candidates[0];
    if (!target) return;
    const assets = target.group.batchExecution.assets;
    setPropertyApply({
      mode: 'asset-runs',
      groupId: target.group.id,
      nodeId,
      sourceNode,
      targetIds: assets.runs.filter((run) => run.id !== assets.activeId).map((run) => run.id),
      targetLabel: '其他素材分组实例',
    });
  }, []);

  const applyPropertiesToRuns = useCallback((propertyPaths) => {
    if (!propertyApply) return;
    const context = getContext(propertyApply.groupId);
    if (!context || context.busy) return;
    const sourceData = nodesRef.current.find((node) => node.id === propertyApply.nodeId)?.data
      || propertyApply.sourceNode.data;
    let execution = saveActiveRun(context.execution, context.currentStates);
    execution = applyNodePropertiesToAssetRuns(
      execution, propertyApply.nodeId, sourceData, propertyPaths,
    );
    commit(propertyApply.groupId, execution);
    setPropertyApply(null);
  }, [commit, getContext, propertyApply]);

  const cancelPropertyApply = useCallback(() => setPropertyApply(null), []);

  const updateRunAllState = useCallback((groupId, updater) => {
    const current = runAllStatesRef.current[groupId] || { running: false, statusByRun: {} };
    const nextGroupState = typeof updater === 'function' ? updater(current) : updater;
    const next = { ...runAllStatesRef.current, [groupId]: nextGroupState };
    runAllStatesRef.current = next;
    setRunAllStates(next);
  }, []);

  const commitRunState = useCallback((groupId, execution, nodeStates = null) => {
    commit(groupId, execution, nodeStates);
  }, [commit]);

  const runAllRuns = useCallback(async (groupId, runIds, executeCurrentRun) => {
    if (typeof executeCurrentRun !== 'function' || runAllStatesRef.current[groupId]?.running) return;
    const initialContext = getContext(groupId);
    if (!initialContext || initialContext.busy) return;
    const mode = initialContext.execution.mode;
    const section = initialContext.execution[mode];
    const selectedRunIds = new Set(runIds || []);
    const runs = (section?.runs || []).filter((run) => selectedRunIds.has(run.id));
    if (!runs.length) return;
    const initialActiveId = section.activeId;
    stoppedGroupIdsRef.current.delete(groupId);
    updateRunAllState(groupId, {
      running: true,
      mode,
      statusByRun: Object.fromEntries(runs.map((run) => [run.id, 'queued'])),
    });

    for (const run of runs) {
      if (stoppedGroupIdsRef.current.has(groupId)) break;
      updateRunAllState(groupId, (state) => ({
        ...state,
        statusByRun: { ...state.statusByRun, [run.id]: 'running' },
      }));
      try {
        const context = getContext(groupId);
        if (!context) throw new Error('分组已不存在');
        let execution = saveActiveRun(context.execution, context.currentStates);
        const currentSection = execution[mode];
        const targetRun = currentSection?.runs.find((item) => item.id === run.id);
        if (!targetRun) throw new Error('素材实例已不存在');
        execution = {
          ...execution,
          mode,
          [mode]: { ...currentSection, activeId: run.id },
        };
        const targetStates = mergeRunNodeStates(
          targetRun.nodeStates, context.currentNodes, context.nodeIds,
        );
        commitRunState(groupId, execution, targetStates);
        await waitForCanvasCommit();
        await executeCurrentRun(context.nodeIds, run.id);
        await waitForCanvasCommit();

        if (stoppedGroupIdsRef.current.has(groupId)) {
          updateRunAllState(groupId, (state) => ({
            ...state,
            statusByRun: { ...state.statusByRun, [run.id]: 'stopped' },
          }));
          break;
        }

        const completedContext = getContext(groupId);
        if (!completedContext) throw new Error('分组已不存在');
        const savedExecution = saveActiveRun(
          completedContext.execution, completedContext.currentStates,
        );
        commitRunState(groupId, savedExecution);
        updateRunAllState(groupId, (state) => ({
          ...state,
          statusByRun: { ...state.statusByRun, [run.id]: 'done' },
        }));
      } catch (error) {
        console.error('[GroupRunAll] run failed', { groupId, runId: run.id, error });
        updateRunAllState(groupId, (state) => ({
          ...state,
          statusByRun: { ...state.statusByRun, [run.id]: 'error' },
        }));
      }
    }

    if (stoppedGroupIdsRef.current.has(groupId)) {
      updateRunAllState(groupId, (state) => ({
        ...state,
        statusByRun: Object.fromEntries(Object.entries(state.statusByRun).map(([runId, status]) => [
          runId,
          status === 'queued' || status === 'running' ? 'stopped' : status,
        ])),
      }));
    }

    const finalContext = getContext(groupId);
    if (finalContext) {
      let execution = saveActiveRun(finalContext.execution, finalContext.currentStates);
      const finalSection = execution[mode];
      const restoreRun = finalSection?.runs.find((run) => run.id === initialActiveId);
      if (restoreRun) {
        execution = {
          ...execution,
          mode,
          [mode]: { ...finalSection, activeId: initialActiveId },
        };
        commitRunState(groupId, execution, mergeRunNodeStates(
          restoreRun.nodeStates, finalContext.currentNodes, finalContext.nodeIds,
        ));
      }
    }
    stoppedGroupIdsRef.current.delete(groupId);
    updateRunAllState(groupId, (state) => ({ ...state, running: false }));
  }, [commitRunState, getContext, updateRunAllState]);

  const stopAllRuns = useCallback((groupId) => {
    stoppedGroupIdsRef.current.add(groupId);
    updateRunAllState(groupId, (state) => ({
      ...state,
      running: true,
      statusByRun: Object.fromEntries(Object.entries(state.statusByRun || {}).map(([runId, status]) => [
        runId,
        status === 'queued' || status === 'running' ? 'stopped' : status,
      ])),
    }));
  }, [updateRunAllState]);

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
    if (!context) return;
    const execution = context.execution;
    const section = execution[mode];
    const run = section?.runs.find((item) => item.id === runId);
    if (!run) return;
    const nextExecution = {
      ...execution,
      mode,
      [mode]: { ...section, activeId: runId },
    };
    const targetStates = mergeRunNodeStates(run.nodeStates, context.currentNodes, context.nodeIds);
    commit(groupId, nextExecution, targetStates);
  }, [commit, getContext]);

  const getExecutionTargetForNode = useCallback((nodeId, runId = null) => {
    const currentGroups = groupsRef.current;
    const target = currentGroups
      .map((group) => ({ group, nodeIds: collectGroupNodeIds(currentGroups, group.id) }))
      .filter(({ group, nodeIds }) => (
        nodeIds.includes(nodeId)
        && group.batchExecution?.mode
      ))
      .sort((left, right) => left.nodeIds.length - right.nodeIds.length)[0];
    if (!target) return null;
    const context = getContext(target.group.id);
    if (!context) return null;
    return getRunExecutionTarget(
      context.execution,
      target.group.id,
      nodeId,
      context.execution.mode,
      runId || context.execution[context.execution.mode]?.activeId,
    );
  }, [getContext]);

  const updateExecutionNodeData = useCallback((target, patch) => {
    if (!target) return;
    const context = getContext(target.groupId);
    if (!context) return;
    const run = context.execution[target.mode]?.runs?.find((item) => item.id === target.runId);
    if (!run || run.nodeIds?.[target.templateNodeId] !== target.nodeId) return;
    const oldData = run.nodeStates?.[target.templateNodeId]
      || context.currentNodes.find((node) => node.id === target.templateNodeId)?.data
      || {};
    const nodeData = applyExecutionNodePatch(oldData, patch);
    const execution = updateRunNodeState(context.execution, target, nodeData);
    const isActive = execution[target.mode]?.activeId === target.runId;
    commitRunState(
      target.groupId,
      execution,
      isActive ? { [target.templateNodeId]: nodeData } : null,
    );
  }, [commitRunState, getContext]);

  const getExecutionNodeData = useCallback((target) => {
    if (!target) return null;
    const context = getContext(target.groupId);
    const run = context?.execution?.[target.mode]?.runs?.find((item) => item.id === target.runId);
    if (run?.nodeIds?.[target.templateNodeId] !== target.nodeId) return null;
    return run.nodeStates?.[target.templateNodeId] || null;
  }, [getContext]);

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
        binding: null,
        sourceSignature: null,
      },
    };
    commit(groupId, execution, newRuns[0].nodeStates);
    return { added: newRuns.length, failed };
  }, [commit, getContext]);

  const removeAsset = useCallback((groupId, runId) => {
    const context = getContext(groupId);
    if (!context || context.busy) {
      return;
    }
    let execution = context.execution;
    const index = execution.assets.runs.findIndex((run) => run.id === runId);
    if (index < 0) {
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
    commit(groupId, execution, targetStates);
  }, [commit, getContext]);

  const setOutputBinding = useCallback((targetGroupId, value) => {
    const binding = normalizeGroupOutputBinding(value);
    if (!binding) {
      return;
    }
    if (wouldCreateGroupOutputBindingCycle(groupsRef.current, binding.sourceGroupId, targetGroupId)) {
      return;
    }
    const context = getContext(targetGroupId);
    if (!context || context.busy) {
      return;
    }
    let execution = saveActiveRun(context.execution, context.currentStates);
    execution = {
      ...execution,
      mode: GROUP_EXECUTION_MODES.assets,
      assets: {
        ...execution.assets,
        templateNodeStates: execution.assets.templateNodeStates || cloneSerializable(context.currentStates),
        binding,
        sourceSignature: null,
      },
    };
    commit(targetGroupId, execution);
  }, [commit, getContext]);

  const disconnectOutputBinding = useCallback((targetGroupId) => {
    const context = getContext(targetGroupId);
    if (!context || context.busy || !context.execution.assets.binding) return;
    const template = context.execution.assets.templateNodeStates || context.currentStates;
    const execution = {
      ...context.execution,
      assets: {
        ...context.execution.assets,
        activeId: null,
        runs: [],
        binding: null,
        sourceSignature: null,
      },
    };
    commit(targetGroupId, execution, template);
  }, [commit, getContext]);

  useEffect(() => {
    for (const targetGroup of groups) {
      const binding = normalizeGroupOutputBinding(targetGroup.batchExecution?.assets?.binding);
      if (!binding || binding.sourceGroupId === targetGroup.id) continue;
      const sourceGroup = groups.find((group) => group.id === binding.sourceGroupId);
      if (!sourceGroup) {
        disconnectOutputBinding(targetGroup.id);
        continue;
      }
      const context = getContext(targetGroup.id);
      if (!context || context.busy) continue;
      const sourceNodeIds = collectGroupNodeIds(groups, sourceGroup.id);
      const assets = collectGroupOutputAssets(nodes, sourceNodeIds, binding, edgesRef.current);
      const sourceSignature = groupOutputAssetsSignature(binding, assets);
      if (context.execution.assets.sourceSignature === sourceSignature) continue;

      const template = context.execution.assets.templateNodeStates || context.currentStates;
      const runs = assets.map((asset) => ({
        ...asset,
        origin: 'group-output-binding',
        nodeStates: applyAssetToNodeStates(
          template,
          context.currentNodes,
          edgesRef.current,
          context.nodeIds,
          asset.url,
        ),
      }));
      const previousActiveId = context.execution.assets.activeId;
      const activeId = runs.some((run) => run.id === previousActiveId)
        ? previousActiveId
        : runs[0]?.id || null;
      const activeRun = runs.find((run) => run.id === activeId);
      const execution = {
        ...context.execution,
        mode: GROUP_EXECUTION_MODES.assets,
        assets: {
          ...context.execution.assets,
          templateNodeStates: cloneSerializable(template),
          activeId,
          runs,
          binding,
          sourceSignature,
        },
      };
      commit(targetGroup.id, execution, activeRun?.nodeStates || template);
    }
  }, [commit, disconnectOutputBinding, getContext, groups, nodes]);

  return {
    inputSlotCounts,
    runningGroupIds,
    protectedImageUrls,
    propertyApplyNodeIds,
    propertyApply,
    requestPropertyApply,
    applyPropertiesToRuns,
    cancelPropertyApply,
    runAllStates,
    runAllRuns,
    stopAllRuns,
    setMode,
    setCount,
    switchRun,
    getExecutionTargetForNode,
    getExecutionNodeData,
    updateExecutionNodeData,
    uploadAssets,
    removeAsset,
    setOutputBinding,
    disconnectOutputBinding,
  };
}

function waitForCanvasCommit() {
  return new Promise((resolve) => {
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    schedule(() => schedule(resolve));
  });
}
