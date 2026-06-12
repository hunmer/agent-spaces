import type { MiniAppTask, MiniAppTaskStatus } from '@agent-spaces/shared';

/**
 * Workflow UI 任务状态 cache（进程内）。
 * 按 projectId 维护任务列表，供多客户端通过 WS 频道同步任务状态。
 * 终态任务保留 TTL 后清理，running 永久保留直到终态。
 */
const TTL_MS = 10 * 60 * 1000;

const store = new Map<string, Map<string, MiniAppTask>>();

function ensureProject(projectId: string): Map<string, MiniAppTask> {
  let bucket = store.get(projectId);
  if (!bucket) {
    bucket = new Map();
    store.set(projectId, bucket);
  }
  return bucket;
}

interface StartTaskInput {
  taskId: string;
  projectId: string;
  pluginId: string;
  toolName: string;
  executorId: string;
  meta?: Record<string, unknown>;
}

/**
 * 登记一个 running 任务。
 * 同 taskId 已存在时：running 保持原样（幂等，供异步视频轮询复用 taskId）；
 * 已终态则重置为 running（轮询覆盖生成阶段）。
 */
export function startTask(input: StartTaskInput): MiniAppTask {
  const bucket = ensureProject(input.projectId);
  const existing = bucket.get(input.taskId);
  if (existing && existing.status === 'running') return existing;

  const task: MiniAppTask = {
    taskId: input.taskId,
    projectId: input.projectId,
    pluginId: input.pluginId,
    toolName: input.toolName,
    executorId: input.executorId,
    status: 'running',
    startedAt: Date.now(),
    meta: input.meta ?? existing?.meta,
  };
  bucket.set(input.taskId, task);
  return task;
}

function settle(
  projectId: string,
  taskId: string,
  status: MiniAppTaskStatus,
  patch: { result?: unknown; error?: string },
): MiniAppTask | undefined {
  const bucket = store.get(projectId);
  if (!bucket) return undefined;
  const task = bucket.get(taskId);
  if (!task) return undefined;
  task.status = status;
  task.finishedAt = Date.now();
  if (patch.result !== undefined) task.result = patch.result;
  if (patch.error !== undefined) task.error = patch.error;
  return task;
}

export function finishTask(projectId: string, taskId: string, result: unknown): MiniAppTask | undefined {
  return settle(projectId, taskId, 'completed', { result });
}

export function failTask(projectId: string, taskId: string, error: string): MiniAppTask | undefined {
  return settle(projectId, taskId, 'failed', { error });
}

/** 清理超过 TTL 的终态任务。running 永不清理。 */
function prune(bucket: Map<string, MiniAppTask>): void {
  const now = Date.now();
  for (const [id, task] of bucket) {
    if (task.status !== 'running' && task.finishedAt && now - task.finishedAt > TTL_MS) {
      bucket.delete(id);
    }
  }
}

export function listTasks(projectId: string): MiniAppTask[] {
  const bucket = store.get(projectId);
  if (!bucket) return [];
  prune(bucket);
  return [...bucket.values()];
}
