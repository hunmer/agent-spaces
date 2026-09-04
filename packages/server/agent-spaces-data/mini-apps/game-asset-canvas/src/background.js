const DOWNLOAD_QUEUE_CONFIG = 'download-queue.json';
const QUEUE_LIMIT = 200;

function replaceMappedUrls(value, urlMap) {
  if (typeof value === 'string') return urlMap.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => replaceMappedUrls(item, urlMap));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceMappedUrls(item, urlMap)]));
}

function hasMappedUrl(value, urlMap) {
  if (typeof value === 'string') return urlMap.has(value);
  if (Array.isArray(value)) return value.some((item) => hasMappedUrl(item, urlMap));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((item) => hasMappedUrl(item, urlMap));
}

function updateQueueTask(ctx, taskId, patch, fallback = {}) {
  ctx.updateConfig(DOWNLOAD_QUEUE_CONFIG, (prev) => {
    const list = Array.isArray(prev) ? prev : [];
    const index = list.findIndex((item) => item?.id === taskId);
    const current = index >= 0 ? list[index] : { id: taskId, ...fallback };
    const nextItem = { ...current, ...patch, updatedAt: Date.now() };
    const next = index >= 0
      ? list.map((item, itemIndex) => (itemIndex === index ? nextItem : item))
      : [nextItem, ...list];
    return next.slice(0, QUEUE_LIMIT);
  });
}

function patchCanvasState(state, task, urlMap) {
  if (!state || !Array.isArray(state.nodes)) return { state, updated: false };
  let updated = false;
  let nodes = state.nodes;
  let groups = Array.isArray(state.groups) ? state.groups : [];
  const target = task.executionTarget;

  if (target?.groupId && target?.mode && target?.runId && target?.templateNodeId) {
    groups = groups.map((group) => {
      if (group?.id !== target.groupId) return group;
      const execution = group.batchExecution;
      const section = execution?.[target.mode];
      const runs = Array.isArray(section?.runs) ? section.runs : [];
      const runIndex = runs.findIndex((run) => run?.id === target.runId
        && (!target.nodeId || run?.nodeIds?.[target.templateNodeId] === target.nodeId));
      if (runIndex < 0) return group;
      const run = runs[runIndex];
      const oldData = run.nodeStates?.[target.templateNodeId];
      if (!oldData || !hasMappedUrl(oldData, urlMap)) return group;
      const nextData = replaceMappedUrls(oldData, urlMap);
      const nextRuns = runs.map((item, index) => (index === runIndex
        ? { ...item, nodeStates: { ...(item.nodeStates || {}), [target.templateNodeId]: nextData } }
        : item));
      if (section.activeId === target.runId) {
        nodes = nodes.map((node) => (node.id === target.templateNodeId ? { ...node, data: nextData } : node));
      }
      updated = true;
      return {
        ...group,
        batchExecution: {
          ...execution,
          [target.mode]: { ...section, runs: nextRuns },
        },
      };
    });
  } else if (task.nodeId) {
    nodes = nodes.map((node) => {
      if (node.id !== task.nodeId || !hasMappedUrl(node.data, urlMap)) return node;
      updated = true;
      return { ...node, data: replaceMappedUrls(node.data || {}, urlMap) };
    });
  }

  return { state: updated ? { ...state, nodes, groups, savedAt: Date.now() } : state, updated };
}

function patchHistory(history, task, urlMap) {
  if (!Array.isArray(history)) return history;
  return history.map((item) => {
    const targetMatches = task.historyId && item?.id === task.historyId;
    const nodeMatches = task.executionTarget?.nodeId
      ? item?.nodeId === task.executionTarget.nodeId
      : task.nodeId && item?.nodeId === task.nodeId;
    return targetMatches || nodeMatches ? replaceMappedUrls(item, urlMap) : item;
  });
}

export default async function onTask(task, ctx) {
  if (task?.type !== 'persist-images') return { ignored: true };
  const taskId = String(task.taskId || 'download');
  const urls = Array.isArray(task.urls) ? task.urls.filter((url) => /^https?:\/\//i.test(String(url))) : [];
  const base = {
    workspaceId: task.workspaceId || 'default',
    nodeId: task.nodeId || null,
    executionTarget: task.executionTarget || null,
    historyId: task.historyId || null,
    label: task.label || '图片下载',
    urls: urls.map(String),
    createdAt: Number(task.createdAt) || Date.now(),
  };
  updateQueueTask(ctx, taskId, { status: 'running', completedCount: 0, totalCount: urls.length }, base);

  const mappings = [];
  const errors = [];
  for (let index = 0; index < urls.length; index += 1) {
    const originalUrl = String(urls[index]);
    try {
      const workspace = String(task.workspaceId || 'default').replace(/[^A-Za-z0-9_-]/g, '_');
      const history = String(task.historyId || taskId).replace(/[^A-Za-z0-9_-]/g, '_');
      const saved = await ctx.saveImage(originalUrl, {
        directory: task.directory || undefined,
        relativePath: task.directory
          ? `${history}/${taskId}-${index}`
          : `downloads/${workspace}/${history}/${taskId}-${index}`,
      });
      mappings.push({ originalUrl, localUrl: saved.httpUrl, filePath: saved.filePath });
    } catch (error) {
      errors.push({ url: originalUrl, error: error?.message || String(error) });
    }
    updateQueueTask(ctx, taskId, { completedCount: index + 1, mappings, errors }, base);
  }

  const urlMap = new Map(mappings.map((item) => [item.originalUrl, item.localUrl]));
  let nodeUpdated = false;
  if (urlMap.size > 0 && task.workspaceId) {
    const canvasPath = `workspaces/${task.workspaceId}/canvas.json`;
    // 画布本地状态有 1 秒防抖保存；快速下载时短暂重试，避免结果先于外链写盘。
    for (let attempt = 0; attempt < 6 && !nodeUpdated; attempt += 1) {
      ctx.updateConfig(canvasPath, (state) => {
        const patched = patchCanvasState(state, task, urlMap);
        nodeUpdated = patched.updated;
        return patched.state;
      });
      if (!nodeUpdated) await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const historyPath = `workspaces/${task.workspaceId}/generation-history.json`;
    ctx.updateConfig(historyPath, (history) => patchHistory(history, task, urlMap));
  }

  const status = errors.length ? 'error' : 'done';
  updateQueueTask(ctx, taskId, {
    status,
    completedAt: Date.now(),
    completedCount: urls.length,
    totalCount: urls.length,
    mappings,
    errors,
    nodeUpdated,
  }, base);
  if (errors.length && mappings.length === 0) throw new Error(errors.map((item) => item.error).join('; '));
  return { mappings, errors, nodeUpdated };
}
