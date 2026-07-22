import { BUILTIN_PLUGIN, EXEC_TOOL } from './constants';

/**
 * 同步执行工作流，返回 end 节点的 output 对象。
 * @param {string} workflowId
 * @param {Record<string, unknown>} input start 节点 inputFields 的值
 * @param {{ meta?: Record<string, unknown>, signal?: AbortSignal }} [opts]
 * @returns {Promise<Record<string, unknown>>} end 节点 outputs（如 { result: [url...] }）
 */
export async function runWorkflow(workflowId, input, opts = {}) {
  const res = await window.AgentSpaces.callPluginTool(
    BUILTIN_PLUGIN,
    EXEC_TOOL,
    { workflow_id: workflowId, input, fault_tolerance: 'stop' },
    { meta: { workflowId, ...(opts.meta || {}) } },
  );

  // 兼容 { success, result } 包装
  const data = res && typeof res === 'object' && 'result' in res && typeof res.success === 'boolean'
    ? res.result
    : res;

  const status = data?.status;
  const steps = Array.isArray(data?.steps) ? data.steps : [];

  // 取最后一个 type=end 的 step 的 output；找不到则退而取最后一条 step
  const endStep = [...steps].reverse().find((s) => s?.nodeType === 'end')
    || steps[steps.length - 1]
    || null;

  if (status && status !== 'completed') {
    const errMsg = endStep?.error || data?.error || `工作流未完成: ${status}`;
    throw new Error(errMsg);
  }

  return endStep?.output || {};
}

/**
 * 执行文生图/编辑图片工作流，返回图片 URL 数组。
 * @param {string} workflowId
 * @param {object} input
 * @returns {Promise<string[]>}
 */
export async function generateImages(workflowId, input) {
  const output = await runWorkflow(workflowId, input, { meta: { mode: workflowId } });
  const result = output?.result;
  if (Array.isArray(result)) return result.filter(Boolean);
  if (typeof result === 'string' && result) return [result];
  if (output?.error) throw new Error(output.error);
  return [];
}
