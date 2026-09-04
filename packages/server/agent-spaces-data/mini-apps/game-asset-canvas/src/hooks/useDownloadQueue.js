import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAnyConfigChanged } from '../utils/storage';
import { isBackendUrl, normalizeImageUrls } from '../utils/workflow';

const DOWNLOAD_QUEUE_CONFIG = 'download-queue.json';

export default function useDownloadQueue(workspaceId, directory) {
  const [allTasks, setAllTasks] = useState([]);

  useEffect(() => {
    const apply = (value) => setAllTasks(Array.isArray(value) ? value : []);
    const agentSpaces = window.AgentSpaces;
    apply(agentSpaces?.getConfig?.(DOWNLOAD_QUEUE_CONFIG));
    const unsubReady = agentSpaces?.onConfigReady?.((configs) => apply(configs?.[DOWNLOAD_QUEUE_CONFIG]));
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === DOWNLOAD_QUEUE_CONFIG) apply(value);
    });
    return () => {
      try { unsubReady?.(); } catch {}
      try { unsub?.(); } catch {}
    };
  }, []);

  const enqueue = useCallback(({ urls, nodeId, executionTarget, historyId, label }) => {
    const externalUrls = normalizeImageUrls(Array.isArray(urls) ? urls : [])
      .filter((url) => url && !isBackendUrl(url));
    if (!externalUrls.length) return null;
    const result = window.AgentSpaces?.submitBackgroundTask?.({
      type: 'persist-images',
      workspaceId,
      directory: directory || undefined,
      nodeId: nodeId || null,
      executionTarget: executionTarget || null,
      historyId: historyId || null,
      label: label || '图片下载',
      urls: externalUrls,
      createdAt: Date.now(),
    });
    if (result?.taskId) {
      setAllTasks((prev) => [{
        id: result.taskId,
        workspaceId,
        nodeId: nodeId || null,
        executionTarget: executionTarget || null,
        historyId: historyId || null,
        label: label || '图片下载',
        urls: externalUrls,
        status: 'queued',
        completedCount: 0,
        totalCount: externalUrls.length,
        createdAt: Date.now(),
      }, ...prev.filter((item) => item?.id !== result.taskId)]);
    }
    return result?.taskId || null;
  }, [directory, workspaceId]);

  const clearFinished = useCallback(async () => {
    await window.AgentSpaces?.invokeService?.('clear_download_queue', { workspaceId });
  }, [workspaceId]);

  const tasks = useMemo(
    () => allTasks.filter((task) => task?.workspaceId === workspaceId),
    [allTasks, workspaceId],
  );
  const activeCount = tasks.filter((task) => task.status === 'queued' || task.status === 'running').length;
  return { tasks, activeCount, enqueue, clearFinished };
}
