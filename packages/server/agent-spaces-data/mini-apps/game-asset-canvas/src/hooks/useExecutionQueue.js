import { useCallback, useEffect, useRef, useState } from 'react';
import { generateImages } from '../utils/workflow';
import { genId as genHistId } from '../utils/canvas-id';

let seq = 0;
function genId() {
  seq += 1;
  return `job-${Date.now().toString(36)}-${seq}`;
}

/**
 * 执行队列：管理通过表单提交的生成任务。
 * - submit: 入队，异步执行，监听 workflow:started 拿 executionId（供中断）
 * - cancel: 用 stopWorkflow 中断引擎，标记 stopped
 * - 完成后回调 onComplete(job, images, histId) 让上层把结果加到画布
 *   histId：落地子目录名（与 generateImages 落地共用），上层 addHistory 应复用该 id
 *
 * @param {{
 *   directory?: string,
 *   onComplete?: (job, images:string[], histId?:string)=>void,
 *   onError?: (job, err:unknown)=>void,
 *   onCancel?: (job)=>void,
 * }} [opts]
 */
export default function useExecutionQueue(opts = {}) {
  const [jobs, setJobs] = useState([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const tasksRef = useRef(new Map());
  const activeJobIdsRef = useRef(new Set());
  const cancelledJobIdsRef = useRef(new Set());
  const onCompleteRef = useRef(opts.onComplete);
  onCompleteRef.current = opts.onComplete;
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;
  const onCancelRef = useRef(opts.onCancel);
  onCancelRef.current = opts.onCancel;
  const directoryRef = useRef(opts.directory);
  directoryRef.current = opts.directory;
  const concurrency = Math.max(1, Math.min(10, Number(opts.concurrency) || 3));

  const updateJob = useCallback((jobId, patch) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  }, []);

  /**
   * 提交一个生成任务到队列。
   * @param {{ nodeType:string, label:string, workflowId:string, input:object, placeholderNodeId?:string, tags?:string[] }} task
   *   placeholderNodeId: 上层预先创建的 loading 占位节点 id，完成后填充该节点而非新增
   *   tags: 透传给 onComplete 的来源标签（存入占位节点 data.tags）
   */
  const submit = useCallback((task) => {
    const jobId = genId();
    // 提前生成 histId：作为落地子目录名，与 history 记录共用
    const histId = genHistId('hist');
    const job = {
      id: jobId,
      histId,
      label: task.label || '生成任务',
      nodeType: task.nodeType,
      workflowId: task.workflowId,
      input: task.input,
      placeholderNodeId: task.placeholderNodeId || null,
      tags: task.tags || [],
      status: 'queued',
      executionId: null,
      images: [],
      error: null,
      createdAt: Date.now(),
    };
    tasksRef.current.set(jobId, task);
    setJobs((prev) => [...prev, job]);
    return jobId;
  }, []);

  const runJob = useCallback(async (job) => {
    const task = tasksRef.current.get(job.id);
    if (!task) {
      activeJobIdsRef.current.delete(job.id);
      updateJob(job.id, { status: 'error', error: '队列任务数据已丢失' });
      return;
    }
    updateJob(job.id, { status: 'running' });

    const AS = window.AgentSpaces;
    // 监听 workflow:started，拿本次执行的 executionId（用于中断）
    let unsubStarted = null;
    if (!task.execute && AS?.subscribeWorkflowEvents) {
      unsubStarted = AS.subscribeWorkflowEvents((event, data) => {
        if (event === 'workflow:started' && data?.executionId) {
          job.executionId = data.executionId;
          updateJob(job.id, { executionId: data.executionId });
        }
      });
    }

    try {
      let images = [];
      if (task.execute) {
        await task.execute();
      } else {
        images = await generateImages(task.workflowId, task.input, {
          directory: directoryRef.current,
          historyId: job.histId,
        });
      }
      const current = jobsRef.current.find((item) => item.id === job.id);
      if (cancelledJobIdsRef.current.has(job.id) || current?.status === 'stopped') return;
      updateJob(job.id, { status: 'done', images });
      if (!task.execute) onCompleteRef.current?.(job, images, job.histId);
    } catch (err) {
      const msg = err?.message || String(err);
      // 中断导致的报错归为 stopped
      const current = jobsRef.current.find((item) => item.id === job.id);
      const explicitlyCancelled = cancelledJobIdsRef.current.has(job.id);
      const stopped = explicitlyCancelled
        || current?.status === 'stopped'
        || /stop|中断|取消/i.test(msg);
      const finalStatus = stopped ? 'stopped' : 'error';
      updateJob(job.id, { status: finalStatus, error: msg });
      // 主动中断已在 cancel 时完成节点收尾，不再覆盖成错误状态。
      if (stopped && !explicitlyCancelled) onCancelRef.current?.(job);
      else if (!stopped && !task.execute) onErrorRef.current?.(job, err);
    } finally {
      try { unsubStarted?.(); } catch {}
      tasksRef.current.delete(job.id);
      activeJobIdsRef.current.delete(job.id);
      cancelledJobIdsRef.current.delete(job.id);
    }
  }, [updateJob]);

  useEffect(() => {
    const available = Math.max(0, concurrency - activeJobIdsRef.current.size);
    if (!available) return;
    const nextJobs = jobs
      .filter((job) => job.status === 'queued' && !activeJobIdsRef.current.has(job.id))
      .slice(0, available);
    nextJobs.forEach((job) => activeJobIdsRef.current.add(job.id));
    nextJobs.forEach(runJob);
  }, [concurrency, jobs, runJob]);

  /** 取消等待任务，或中断正在运行的任务 */
  const cancel = useCallback((jobId) => {
    const job = jobsRef.current.find((j) => j.id === jobId);
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
    cancelledJobIdsRef.current.add(jobId);
    const task = tasksRef.current.get(jobId);
    if (job.status === 'queued') {
      tasksRef.current.delete(jobId);
      updateJob(jobId, { status: 'stopped', error: '用户取消' });
      onCancelRef.current?.(job);
      cancelledJobIdsRef.current.delete(jobId);
      return;
    }
    if (task?.cancel) task.cancel();
    if (job.executionId && window.AgentSpaces?.stopWorkflow) {
      window.AgentSpaces.stopWorkflow(job.executionId);
    }
    updateJob(jobId, { status: 'stopped', error: '用户中断' });
    onCancelRef.current?.(job);
  }, [updateJob]);

  /** 清除已完成/失败/中断的任务 */
  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === 'queued' || j.status === 'running'));
  }, []);

  // 组件卸载时清理订阅
  useEffect(() => () => {}, []);

  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;

  return { jobs, submit, cancel, clearFinished, runningCount, queuedCount };
}
