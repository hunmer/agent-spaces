import { useState, useCallback, useRef, useEffect } from 'react';
import { buildToolCall, extractMediaUrls, checkResultError } from '../utils/providers';
import { readUploadSettings, uploadToCloud } from '../utils/upload';

const CONFIG_PATH = 'generation-history.json';

const MODE_LABELS = {
  text_to_image: '文生图',
  image_to_image: '图生图',
  image_edit: '图片编辑',
  image_to_video: '图生视频',
  image_outpainting: '扩图',
  video_editing: '视频编辑',
  video_retalk: '数字人',
};

const VIDEO_MODES = new Set(['image_to_video', 'video_editing', 'video_retalk']);

/**
 * AI 生成核心逻辑 Hook（WS 事件驱动 + 服务端单一写入方）。
 *
 * - 任务队列：workflowUi.task* 事件驱动（多端同步）
 * - 结果历史：服务端 services 是唯一写入方。UI 不直接 readConfig/writeConfig，
 *   通过 getConfig 拿初始快照 + onConfigChanged 订阅增量；落库调
 *   invokeService('add_results' / 'remove_result' / 'clear_results')。
 *   服务端 writeConfig 后广播 configChanged，所有客户端同步更新，杜绝互相覆盖。
 */
export default function useGeneration() {
  const [results, setResults] = useState([]);
  const [taskQueue, setTaskQueue] = useState([]); // [{id, status, progress, provider, mode, modeLabel, prompt, executorId, error}]
  const [error, setError] = useState(null);
  const initializedRef = useRef(false);
  const myIdRef = useRef('');

  // 派生：是否有运行中的任务
  const loading = taskQueue.some(t => t.status === 'running');
  const progress = taskQueue.find(t => t.status === 'running')?.progress || '';

  // ====== 初始化：加载配置快照 + 主动拉取队列 + 订阅事件 ======
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    myIdRef.current = window.AgentSpaces.getExecutorId?.() || '';

    // 初始快照（configSnapshot 已到则有值；未到则等 onConfigChanged 推送）
    const initial = window.AgentSpaces.getConfig(CONFIG_PATH);
    if (Array.isArray(initial)) setResults(initial);

    // results 全程由服务端 configChanged 驱动
    const unsubConfig = window.AgentSpaces.onConfigChanged((path, value) => {
      if (path === CONFIG_PATH) setResults(Array.isArray(value) ? value : []);
    });

    // 主动请求当前 running 任务，按 executorId 过滤出自己发起的
    window.AgentSpaces.invokeService('get_queue')
      .then((tasks) => {
        const mine = (Array.isArray(tasks) ? tasks : [])
          .filter((t) => t.executorId === myIdRef.current)
          .map(mapBackendTask);
        setTaskQueue(mine);
      })
      .catch((e) => console.warn('get_queue failed:', e));

    const unsubscribe = window.AgentSpaces.onTaskEvent((event, data) => {
      if (event === 'workflowUi.taskSnapshot') {
        applySnapshot(data?.tasks);
      } else if (event === 'workflowUi.taskStarted') {
        onTaskStarted(data);
      } else if (event === 'workflowUi.taskFinished') {
        onTaskFinished(data);
      } else if (event === 'workflowUi.taskFailed') {
        onTaskFailed(data);
      }
    });

    return () => {
      unsubConfig();
      unsubscribe();
    };
  }, []);

  /** 更新队列中指定任务（不存在则忽略） */
  const updateTask = useCallback((taskId, updates) => {
    setTaskQueue(prev => {
      const idx = prev.findIndex(t => t.id === taskId);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  }, []);

  /** 延迟移除已完成的任务 */
  const scheduleRemoval = useCallback((taskId, delay = 3000) => {
    setTimeout(() => {
      setTaskQueue(prev => prev.filter(t => t.id !== taskId));
    }, delay);
  }, []);

  /** 后端 Task → 前端 taskQueue 项 */
  function mapBackendTask(t) {
    const meta = t.meta || {};
    return {
      id: t.taskId,
      status: t.status,
      progress: t.status === 'running'
        ? '正在生成...'
        : t.status === 'completed' ? '已完成' : (t.error || '失败'),
      provider: meta.provider || '',
      mode: meta.mode || '',
      modeLabel: meta.modeLabel || meta.mode || '',
      prompt: meta.prompt || '',
      executorId: t.executorId,
    };
  }

  /** snapshot 合并：仅保留自己发起的任务，后端权威 status，本地项保留更丰富字段 */
  const applySnapshot = useCallback((tasks) => {
    const myId = myIdRef.current;
    setTaskQueue(prev => {
      const byId = new Map();
      for (const bt of tasks || []) {
        if (bt.executorId !== myId) continue;
        byId.set(bt.taskId, mapBackendTask(bt));
      }
      for (const local of prev) {
        const remote = byId.get(local.id);
        byId.set(local.id, remote ? { ...remote, ...local, status: remote.status } : local);
      }
      return [...byId.values()];
    });
  }, []);

  const onTaskStarted = useCallback((data) => {
    if (!data || data.executorId !== myIdRef.current) return;
    const meta = data.meta || {};
    setTaskQueue(prev => {
      const idx = prev.findIndex(t => t.id === data.taskId);
      const item = {
        id: data.taskId,
        status: 'running',
        progress: '正在生成...',
        provider: meta.provider || '',
        mode: meta.mode || '',
        modeLabel: meta.modeLabel || meta.mode || '',
        prompt: meta.prompt || '',
        executorId: data.executorId,
      };
      if (idx === -1) return [...prev, item];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...item, progress: next[idx].progress || item.progress };
      return next;
    });
  }, []);

  const onTaskFinished = useCallback((data) => {
    // 仅处理自己发起的任务：自己落库 → configChanged 广播 → 所有客户端 results 同步。
    // 他人发起的 taskFinished 不处理（结果由对方的 add_results → configChanged 推来）。
    if (!data || data.executorId !== myIdRef.current) return;
    const meta = data.meta || {};
    const mode = meta.mode;

    const err = checkResultError(data.result);
    if (err) {
      updateTask(data.taskId, { status: 'failed', error: err });
      scheduleRemoval(data.taskId);
      return;
    }

    const mediaItems = extractMediaUrls(data.result, mode);
    const fallback =
      !mediaItems.length && typeof data.result === 'string' && data.result.startsWith('http')
        ? [{ type: VIDEO_MODES.has(mode) ? 'video' : 'image', url: data.result }]
        : [];
    const final = mediaItems.length ? mediaItems : fallback;

    if (final.length) {
      // 落库交给服务端 services（唯一写入方）；返回的 configChanged 会回填 results
      window.AgentSpaces.invokeService('add_results', {
        items: final,
        mode,
        provider: meta.provider,
        prompt: meta.prompt,
      }).catch((e) => console.warn('add_results failed:', e));
      updateTask(data.taskId, { status: 'completed', progress: `已完成 (${final.length}个结果)` });
      scheduleRemoval(data.taskId);
    } else {
      // 无媒体的中间态（如异步视频刚提交，仅返回 asyncTaskId）→ 保持 running 等待轮询完成
      updateTask(data.taskId, { status: 'running', progress: '处理中...' });
    }
  }, [updateTask, scheduleRemoval]);

  const onTaskFailed = useCallback((data) => {
    if (!data || data.executorId !== myIdRef.current) return;
    const msg = data.error || '生成失败';
    updateTask(data.taskId, { status: 'failed', error: msg });
    scheduleRemoval(data.taskId);
    setError(msg);
  }, [updateTask, scheduleRemoval]);

  /** 调用插件生成内容 */
  const generate = useCallback(async (providerId, modeId, formData) => {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const modeLabel = MODE_LABELS[modeId] || modeId;
    const meta = { mode: modeId, provider: providerId, modeLabel, prompt: formData.prompt || '' };

    // 乐观插入（taskStarted 事件回来前先占位）
    setTaskQueue(prev => [...prev, {
      id: taskId,
      status: 'running',
      progress: '正在提交...',
      provider: providerId,
      mode: modeId,
      modeLabel,
      prompt: meta.prompt,
    }]);
    setError(null);

    try {
      const preparedFormData = await prepareFormDataForGeneration(
        formData,
        (progress) => updateTask(taskId, { progress }),
      );
      const toolCall = buildToolCall(providerId, modeId, preparedFormData);
      if (!toolCall) {
        updateTask(taskId, { status: 'failed', error: '不支持的提供商/模式组合' });
        scheduleRemoval(taskId);
        setError('不支持的提供商/模式组合');
        return;
      }

      updateTask(taskId, { progress: '正在提交生成请求...' });
      // 同步/异步结果都由 taskFinished 事件统一落库，此处不本地处理 result
      const result = await window.AgentSpaces.callPluginTool(
        toolCall.pluginId,
        toolCall.toolName,
        toolCall.args,
        { taskId, meta },
      );

      const err = checkResultError(result);
      if (err) {
        updateTask(taskId, { status: 'failed', error: err });
        scheduleRemoval(taskId);
        setError(err);
        return;
      }

      // MiniMax 视频是异步任务，data.taskId 触发轮询；复用同一 taskId 让后端 cache 幂等
      const asyncTaskId = result?.data?.taskId;
      if (toolCall.asyncVideo && asyncTaskId) {
        updateTask(taskId, { progress: '视频生成中，请耐心等待...' });
        const videoResult = await window.AgentSpaces.callPluginTool(
          toolCall.pluginId,
          'minimax_video_async_wait',
          { taskId: asyncTaskId },
          { taskId, meta },
        );
        const vErr = checkResultError(videoResult);
        if (vErr) {
          updateTask(taskId, { status: 'failed', error: vErr });
          scheduleRemoval(taskId);
          setError(vErr);
        }
      }
    } catch (err) {
      console.error('Generation error:', err);
      const msg = err?.message || err?.toString() || '生成失败，请检查参数后重试';
      updateTask(taskId, { status: 'failed', error: msg });
      scheduleRemoval(taskId);
      setError(msg);
    }
  }, [updateTask, scheduleRemoval]);

  /** 删除指定结果（走服务端，configChanged 回填） */
  const removeResult = useCallback((id) => {
    window.AgentSpaces.invokeService('remove_result', { id }).catch((e) => console.warn('remove_result failed:', e));
  }, []);

  /** 清空所有结果（走服务端，configChanged 回填） */
  const clearResults = useCallback(() => {
    window.AgentSpaces.invokeService('clear_results').catch((e) => console.warn('clear_results failed:', e));
  }, []);

  return {
    results,
    loading,
    progress,
    error,
    taskQueue,
    generate,
    removeResult,
    clearResults,
  };
}

async function prepareFormDataForGeneration(formData, updateProgress) {
  const settings = await readUploadSettings();
  if (!settings.autoUpload) return formData;

  const next = { ...formData };
  const uploadOne = async (path, fallbackUrl, fileName) => {
    if (!path) return fallbackUrl || '';
    return uploadToCloud(path, settings.provider, fileName || path);
  };

  const hasUploadWork =
    next.imagePath ||
    next.videoPath ||
    next.audioPath ||
    next.imagePaths?.some(Boolean) ||
    next.referenceImagePaths?.some(Boolean);

  if (!hasUploadWork) return next;

  updateProgress('正在上传到云存储...');

  if (Array.isArray(next.imagePaths) && next.imagePaths.length > 0) {
    next.imageUrls = await Promise.all(
      next.imagePaths.map((path, index) => uploadOne(path, next.imageUrls?.[index])),
    );
    if (next.imagePath) {
      next.imageUrl = next.imageUrls[0] || next.imageUrl || '';
    }
  } else if (next.imagePath) {
    next.imageUrl = await uploadOne(next.imagePath, next.imageUrl);
  }

  if (Array.isArray(next.referenceImagePaths) && next.referenceImagePaths.length > 0) {
    next.referenceImageUrls = await Promise.all(
      next.referenceImagePaths.map((path, index) => uploadOne(path, next.referenceImageUrls?.[index])),
    );
  }

  if (next.videoPath) {
    next.videoUrl = await uploadOne(next.videoPath, next.videoUrl);
  }

  if (next.audioPath) {
    next.audioUrl = await uploadOne(next.audioPath, next.audioUrl);
  }

  return next;
}
