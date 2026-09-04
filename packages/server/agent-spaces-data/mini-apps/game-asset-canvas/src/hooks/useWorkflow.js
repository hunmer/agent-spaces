import { useCallback } from 'react';
import { generateImages } from '../utils/workflow';

/**
 * 执行一次节点图片生成工作流。先返回工作流 URL，节点写回后再由下载队列后台落地。
 * histId 由调用方传入，与生成历史和后台下载目录共用。
 *
 * @param {string} [directory] 当前工作区数据目录（宿主机绝对路径），可选
 * @returns {(workflowId: string, input: object, histId?: string, executionTarget?: object) => Promise<{ urls: string[], resources: Array<{url:string,thumb:string}>, workflowExecution: {workflowId:string,logId:string}|null }>}
 */
export default function useWorkflow(directory) {
  return useCallback(async (workflowId, input, histId, executionTarget = null) => {
    return generateImages(workflowId, input, {
      directory,
      historyId: histId,
      executionTarget,
      deferPersistence: true,
    });
  }, [directory]);
}
