import { BUILTIN_PLUGIN, EXEC_TOOL } from './constants';

// 同步等待上限 10 分钟（execute_workflow_sync 的 MAX_WORKFLOW_SYNC_TIMEOUT_MS）
// jimeng/可灵等异步图片生成往往超过默认 120s，必须给足等待时间
const MAX_WAIT_MS = 600_000;

/**
 * 规范化图片 URL：相对路径（如 /static/uploads/xxx.png）补全为完整 http URL。
 * 工作流返回的可能是相对路径，浏览器同源能展示，但提交给工作流后端下载时需要完整 URL。
 * data: URI / 已是 http(s) 的原样返回。
 */
export function normalizeImageUrl(url) {
  if (!url) return url;
  const s = String(url);
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return `${window.location.origin}${s}`;
  return s;
}

export function normalizeImageUrls(urls) {
  if (!Array.isArray(urls)) return urls;
  return urls.map(normalizeImageUrl);
}

/**
 * 把提示词条目的 references（相对 src 目录的路径数组，如 ['assets/references/<id>/ref1.png']）
 * 解析为可直接用于 <img>/提交给工作流的 http URL 数组。
 * 走 host 暴露的 window.AgentSpaces.srcFileUrl（对应 /api/mini-apps/<id>/src/file 路由）。
 * references 为空/缺省时返回空数组。
 */
export function resolveReferenceImages(references) {
  if (!Array.isArray(references) || references.length === 0) return [];
  const srcFileUrl = window?.AgentSpaces?.srcFileUrl;
  if (typeof srcFileUrl !== 'function') return [];
  return references.map((rel) => srcFileUrl(rel)).filter(Boolean);
}

/**
 * 同步执行工作流，返回 end 节点的 output 对象。
 * @param {string} workflowId
 * @param {Record<string, unknown>} input start 节点 inputFields 的值
 * @param {{ meta?: Record<string, unknown> }} [opts]
 * @returns {Promise<Record<string, unknown>>} end 节点 outputs（如 { result: [url...] }）
 */
export async function runWorkflow(workflowId, input, opts = {}) {
  const res = await window.AgentSpaces.callPluginTool(
    BUILTIN_PLUGIN,
    EXEC_TOOL,
    { workflow_id: workflowId, input, fault_tolerance: 'stop', max_wait_ms: MAX_WAIT_MS },
    { meta: { workflowId, ...(opts.meta || {}) } },
  );

  // 兼容 { success, result } 包装
  const data = res && typeof res === 'object' && 'result' in res && typeof res.success === 'boolean'
    ? res.result
    : res;

  const status = data?.status;
  const timedOut = !!data?.timedOut;
  const steps = Array.isArray(data?.steps) ? data.steps : [];

  // 先尝试从 steps 提取结果（即便超时，生成节点可能已产出图片）
  const output = extractOutput(steps);
  if (output) return output;

  // 没提取到结果，按状态报错
  if (timedOut) {
    throw new Error('工作流执行超时（>10分钟），未返回结果');
  }
  if (status && status !== 'completed') {
    // 从 steps 找错误信息
    const errStep = [...steps].reverse().find((s) => s?.error && s.status !== 'skipped');
    throw new Error(errStep?.error || `工作流未完成: ${status}`);
  }
  // status=completed 但无 output，返回空让调用方处理
  return {};
}

/**
 * 从执行 steps 里提取图片结果（多路径兜底）：
 * 1. 最后一个 type=end 且 status=completed 的 output.result / output.images
 * 2. 生成节点 output.data.images（如 jimeng/aliyun 节点结构）
 * 3. 任意 completed 节点 output.result / output.images
 * 返回 output 对象（{ result: string[] } 形式）或 null
 */
function extractOutput(steps) {
  if (!steps.length) return null;

  // 1. 优先：end 节点且已完成
  const endStep = [...steps].reverse().find(
    (s) => s?.nodeType === 'end' && s?.status === 'completed',
  );
  if (endStep?.output) {
    const out = endStep.output;
    if (hasImages(out)) return out;
  }

  // 2. 生成节点的 output.data.images（jimeng_text_to_image / aliyun_text_to_image 等）
  for (const s of [...steps].reverse()) {
    if (s?.status !== 'completed') continue;
    const out = s.output;
    if (!out) continue;
    // data.images 结构
    if (out.data?.images && Array.isArray(out.data.images)) {
      return { result: out.data.images };
    }
    // 直接 images 结构
    if (hasImages(out)) return out;
  }

  return null;
}

function hasImages(out) {
  return Array.isArray(out?.result) || Array.isArray(out?.images) || Array.isArray(out?.image_urls);
}

/**
 * 执行文生图/编辑图片工作流，返回图片 URL 数组。
 * 兼容多种 output 字段名：result / images / image_urls（image_enchanter 工作流 end 节点用 image_urls）。
 * @param {string} workflowId
 * @param {object} input
 * @returns {Promise<string[]>}
 */
export async function generateImages(workflowId, input) {
  const output = await runWorkflow(workflowId, input, { meta: { mode: workflowId } });
  const result = output?.result;
  let urls;
  if (Array.isArray(result)) urls = result.filter(Boolean);
  else if (Array.isArray(output?.images)) urls = output.images.filter(Boolean);
  else if (Array.isArray(output?.image_urls)) urls = output.image_urls.filter(Boolean);
  else if (typeof result === 'string' && result) urls = [result];
  else if (output?.error) throw new Error(output.error);
  else urls = [];
  // 规范化：相对路径补全为完整 http URL
  return normalizeImageUrls(urls);
}
