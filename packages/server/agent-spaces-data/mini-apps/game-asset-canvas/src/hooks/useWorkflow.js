import { useCallback } from 'react';
import { generateImages } from '../utils/workflow';

/**
 * 执行一次图片生成工作流：调用 generateImages 取 URL。
 *
 * generateImages 内部已对非后端地址的外链图统一调用 downloadImage 落地到后端 data 目录
 * 并替换为后端 httpUrl（失败保留原地址），因此这里无需再做额外的下载。
 *
 * @returns {(workflowId: string, input: object) => Promise<{ urls: string[] }>}
 */
export default function useWorkflow() {
  return useCallback(async (workflowId, input) => {
    const urls = await generateImages(workflowId, input);
    return { urls };
  }, []);
}
