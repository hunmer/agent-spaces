/**
 * 统一抠图节点（cutout）的执行入口。
 *
 * 合并四种抠图能力，按 mode 分流：
 * - whiteKey   本地算法：把接近白色的像素置透明（复用 image-ops PROCESSORS['white-key']）
 * - chromaKey  本地算法：绿幕/蓝幕/自定义键色抠除（PROCESSORS['chroma-key']）
 * - workflow   云端工作流：调 image_enchanter 工作流 process_type=segment（多图并发）
 * - rembg      Rembg 插件：调 workflow.rembg 插件（rembg_remove/mask/alpha_matting/sam）
 *
 * 节点层（CutoutNode + Canvas.handleCutout）调 runCutout 后回填 data.output.images，
 * 与 handleProcessLocal 走同一套取消/状态机。
 *
 * @param {string} mode 抠图模式（CUTOUT_MODES 的 value）
 * @param {string[]} inputUrls 输入图 http URL（已 normalizeImageUrls 规范化）
 * @param {object} modeParams 该模式的参数（{mode} 对应 CUTOUT_PARAMS 的 key→value）
 * @param {object} ctx 注入依赖：
 *   - workflowId: image_enchanter 工作流 id（workflow 模式用）
 *   - runWorkflowFn: 调工作流的函数（workflow 模式用，签名同 utils/workflow.runWorkflow）
 * @returns {Promise<string[]>} 产出图的 http URL 数组
 */
import { runProcessor } from './image-ops';
import { WORKFLOWS } from './constants';
import { normalizeImageUrls } from './workflow';

// Rembg 插件 id（与 packages/templates/plugins/rembg/info.json 的 id 一致）
const REMBG_PLUGIN_ID = 'workflow.rembg';

// rembgMode → 插件动作名映射
const REMBG_ACTION_MAP = {
  remove: 'rembg_remove',
  mask: 'rembg_mask',
  alphaMatting: 'rembg_alpha_matting',
  sam: 'rembg_sam_segment',
};

/**
 * 抠图统一执行。返回产出图 URL 数组。
 * 多图批量：所有模式均支持，部分失败不阻塞成功的（与 enhance/compress 同款）。
 */
export async function runCutout(mode, inputUrls, modeParams = {}, ctx = {}) {
  const urls = normalizeImageUrls((inputUrls || []).filter(Boolean));
  if (!urls.length) throw new Error('抠图需要输入图');
  switch (mode) {
    case 'whiteKey':
      return runProcessor('white-key', urls, modeParams);
    case 'chromaKey':
      return runProcessor('chroma-key', urls, modeParams);
    case 'workflow':
      return runWorkflowCutout(urls, ctx);
    case 'rembg':
      return runRembgCutout(urls, modeParams, ctx);
    default:
      throw new Error(`未知抠图模式：${mode}`);
  }
}

/**
 * 工作流抠图（image_enchanter 工作流 process_type=segment）。
 * 多图并发：每张图一次工作流调用（input 是单图 image_url），合并所有产出 URL。
 * 部分失败不阻塞成功的；全部失败才抛错。
 */
async function runWorkflowCutout(urls, ctx) {
  const workflowId = ctx?.workflowId || WORKFLOWS.image_enchanter;
  const runWorkflowFn = ctx?.runWorkflowFn;
  if (typeof runWorkflowFn !== 'function') throw new Error('runWorkflowFn 未注入');
  const results = await Promise.allSettled(
    urls.map((url) =>
      runWorkflowFn(workflowId, { image_url: url, process_type: 'segment' })
        .then((out) => ({ urls: extractWorkflowImageUrls(out), summary: summarizeWorkflowOutput(out) })),
    ),
  );
  const outUrls = [];
  const emptySummaries = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const u of r.value.urls) if (u) outUrls.push(u);
      if (!r.value.urls.length) emptySummaries.push(r.value.summary);
    } else {
      failed += 1;
    }
  }
  if (!outUrls.length) {
    const detail = emptySummaries.length ? `；返回：${emptySummaries.join(' | ')}` : '';
    console.error('[cutout] workflow returned no images', {
      workflowId,
      failed,
      outputs: emptySummaries,
    });
    throw new Error(failed ? `${failed} 张图片工作流抠图全部失败${detail}` : `工作流抠图未返回图片${detail}`);
  }
  return normalizeImageUrls(outUrls);
}

function extractWorkflowImageUrls(output) {
  if (Array.isArray(output)) return output.filter(Boolean);
  if (Array.isArray(output?.urls)) return output.urls.filter(Boolean);
  if (Array.isArray(output?.images)) return output.images.filter(Boolean);
  if (Array.isArray(output?.image_urls)) return output.image_urls.filter(Boolean);
  if (Array.isArray(output?.result)) return output.result.filter(Boolean);
  if (typeof output?.result === 'string' && output.result) return [output.result];
  return [];
}

function summarizeWorkflowOutput(output) {
  if (output == null) return String(output);
  if (Array.isArray(output)) return `array(${output.length})`;
  if (typeof output !== 'object') return typeof output;
  const keys = Object.keys(output).slice(0, 12);
  const resultType = Array.isArray(output.result)
    ? `array(${output.result.length})`
    : typeof output.result;
  return `keys=[${keys.join(',')}], result=${resultType}`;
}

/**
 * Rembg 插件抠图。按 modeParams.rembgMode（默认 remove）选插件动作，每张图并发调用。
 * 插件 config（baseUrl/model/timeout）由后端从插件配置注入，这里只传用户参数。
 *
 * 返回结构（单图动作）：{ success, message, data:{ imageUrl, size, model } }
 * 取 data.imageUrl 即可。多图并发合并；单张失败记录但不阻塞。
 */
async function runRembgCutout(urls, modeParams = {}, ctx = {}) {
  const AS = window.AgentSpaces;
  if (!AS?.callPluginTool) throw new Error('宿主 callPluginTool 不可用');
  const rembgMode = REMBG_ACTION_MAP[modeParams.rembgMode]
    ? modeParams.rembgMode
    : 'remove';
  const action = REMBG_ACTION_MAP[rembgMode];

  // SAM 模式：extras 必填，所有图共用同一 prompt（当前不支持逐图 prompt）
  const baseArgs = {};
  if (modeParams.model) baseArgs.model = modeParams.model;
  if (modeParams.backgroundColor) baseArgs.backgroundColor = modeParams.backgroundColor;
  // Alpha Matting 参数
  if (rembgMode === 'alphaMatting') {
    baseArgs.alphaMatting = true;
    if (modeParams.af != null) baseArgs.af = modeParams.af;
    if (modeParams.ab != null) baseArgs.ab = modeParams.ab;
    if (modeParams.ae != null) baseArgs.ae = modeParams.ae;
  }
  // 掩码后处理
  if (rembgMode === 'mask' && modeParams.postProcessMask) {
    baseArgs.postProcessMask = true;
  }
  // SAM prompt
  if (rembgMode === 'sam') {
    if (!modeParams.extras) throw new Error('SAM 模式需填写 SAM Prompt(JSON)');
    // extras 支持 JSON 字符串或对象
    baseArgs.extras = typeof modeParams.extras === 'string'
      ? tryParseJson(modeParams.extras, modeParams.extras)
      : modeParams.extras;
  }

  const results = await Promise.allSettled(
    urls.map((url) =>
      AS.callPluginTool(
        REMBG_PLUGIN_ID,
        action,
        { ...baseArgs, image: url },
        { meta: { executionTarget: ctx.executionTarget || undefined } },
      )
        .then(extractRembgImageUrl),
    ),
  );
  const outUrls = [];
  let failed = 0;
  let firstErr = '';
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      outUrls.push(r.value);
    } else {
      failed += 1;
      if (r.status === 'rejected' && !firstErr) firstErr = String(r.reason?.message || r.reason);
    }
  }
  if (!outUrls.length) {
    throw new Error(firstErr || (failed ? `${failed} 张图片 Rembg 抠图全部失败` : 'Rembg 未返回图片'));
  }
  return outUrls;
}

/**
 * 从 rembg 插件返回结构提取 imageUrl。
 * 单图动作返回 { success, message, data:{ imageUrl, size, model } }，
 * 兼容 callPluginTool 的 { success, result } 包装。
 */
function extractRembgImageUrl(ret) {
  const data = ret && typeof ret === 'object' && 'result' in ret && typeof ret.success === 'boolean'
    ? ret.result
    : ret;
  const url = data?.data?.imageUrl || data?.imageUrl || data?.data?.httpPath;
  if (!url) throw new Error(data?.message || 'Rembg 未返回 imageUrl');
  return url;
}

/** 尝试 JSON.parse，失败返回 fallback（用于 extras 字段） */
function tryParseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
