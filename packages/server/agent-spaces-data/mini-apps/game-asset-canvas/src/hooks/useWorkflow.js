import { useCallback } from 'react';
import { generateImages } from '../utils/workflow';
import { downloadImages } from '../utils/storage';

/**
 * 执行一次图片生成工作流：调用 -> 取 URL -> 下载到 data。
 * @returns {(workflowId: string, input: object, nodeId: string) => Promise<{ urls: string[], local: string[] }>}
 */
export default function useWorkflow() {
  return useCallback(async (workflowId, input, nodeId) => {
    const urls = await generateImages(workflowId, input);
    // 下载到 data/ 目录（失败不影响展示）
    let local = [];
    try {
      local = await downloadImages(urls, nodeId);
    } catch (err) {
      console.warn('downloadImages failed:', err);
    }
    return { urls, local };
  }, []);
}
