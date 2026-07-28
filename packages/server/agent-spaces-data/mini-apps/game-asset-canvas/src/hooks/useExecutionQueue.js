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
 * }} [opts]
 */
export default function useExecutionQueue(opts = {}) {
  const [jobs, setJobs] = useState([]);
  const onCompleteRef = useRef(opts.onComplete);
  onCompleteRef.current = opts.onComplete;
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;
  const directoryRef = useRef(opts.directory);
  directoryRef.current = opts.directory;

  const updateJob = useCallback((jobId, patch) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  }, []);

  /**
   * 提交一个生成任务到队列。
   * @param {{ nodeType:string, label:string, workflowId:string, input:object, placeholderNodeId?:string, tags?:string[] }} task
   *   placeholderNodeId: 上层预先创建的 loading 占位节点 id，完成后填充该节点而非新增
   *   tags: 透传给 onComplete 的来源标签（存入占位节点 data.tags）
   */
  const submit = useCallback(async (task) => {
    const jobId = genId();
    // 提前生成 histId：作为落地子目录名，与 history 记录共用
    const histId = genHistId('hist');
    const job = {
      id: jobId,
      label: task.label || '生成任务',
      nodeType: task.nodeType,
      workflowId: task.workflowId,
      input: task.input,
      placeholderNodeId: task.placeholderNodeId || null,
      tags: task.tags || [],
      status: 'running',
      executionId: null,
      images: [],
      error: null,
      createdAt: Date.now(),
    };
    setJobs((prev) => [job, ...prev]);

    const AS = window.AgentSpaces;
    // 监听 workflow:started，拿本次执行的 executionId（用于中断）
    let unsubStarted = null;
    if (AS?.subscribeWorkflowEvents) {
      unsubStarted = AS.subscribeWorkflowEvents((event, data) => {
        if (event === 'workflow:started' && data?.executionId && !job.executionId) {
          job.executionId = data.executionId;
          updateJob(jobId, { executionId: data.executionId });
        }
      });
    }

    try {
      const images = await generateImages(task.workflowId, task.input, { directory: directoryRef.current, historyId: histId });
      updateJob(jobId, { status: 'done', images });
      onCompleteRef.current?.(job, images, histId);
    } catch (err) {
      const msg = err?.message || String(err);
      // 中断导致的报错归为 stopped
      const finalStatus = /stop|中断|取消/i.test(msg) ? 'stopped' : 'error';
      updateJob(jobId, { status: finalStatus, error: msg });
      // 通知上层（如把占位节点标记为错误）
      onErrorRef.current?.(job, err);
    } finally {
      try { unsubStarted?.(); } catch {}
    }
  }, [updateJob]);

  /** 中断队列中正在运行的任务 */
  const cancel = useCallback((jobId) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status !== 'running') return;
    if (job.executionId && window.AgentSpaces?.stopWorkflow) {
      window.AgentSpaces.stopWorkflow(job.executionId);
    }
    updateJob(jobId, { status: 'stopped', error: '用户中断' });
  }, [jobs, updateJob]);

  /** 清除已完成/失败/中断的任务 */
  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === 'running'));
  }, []);

  // 组件卸载时清理订阅
  useEffect(() => () => {}, []);

  const runningCount = jobs.filter((j) => j.status === 'running').length;

  return { jobs, submit, cancel, clearFinished, runningCount };
}
