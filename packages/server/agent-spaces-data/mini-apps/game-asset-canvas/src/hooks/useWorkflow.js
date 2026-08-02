import { useCallback } from 'react';
import { generateImages } from '../utils/workflow';

/**
 * 执行一次图片生成工作流：调用 generateImages 取 URL。
 *
 * 落地策略由 directory 决定：
 * - directory 有值（工作区数据目录）：产出图落到该目录下 `{histId}/{index}` 子路径，返回指向本地文件的 httpUrl。
 * - directory 无值：维持原行为，落到后端 data 目录。
 *
 * histId 由调用方传入（与 history 记录共用，作为落地子目录名）。
 *
 * @param {string} [directory] 当前工作区数据目录（宿主机绝对路径），可选
 * @returns {(workflowId: string, input: object, histId?: string) => Promise<{ urls: string[], resources: Array<{url:string,thumb:string}> }>}
 */
export default function useWorkflow(directory) {
  return useCallback(async (workflowId, input, histId) => {
    return generateImages(workflowId, input, { directory, historyId: histId });
  }, [directory]);
}
