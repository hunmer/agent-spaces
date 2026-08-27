/**
 * 提取深度图节点（depthExtract）的执行入口。
 *
 * 调用 workflow.depth-anything 插件的 depth_batch_predict 动作：
 *   - 一次请求把所有图打包上传（最多 16 张/批，插件内部自动切片）
 *   - 服务端 GPU 并行推理（POST /predict/batch），结果以 ZIP 返回后由插件解包落盘
 *   - 插件返回 { success, data: { results: [{ input, success, imageUrl, ... }] } }
 *
 * 节点层（DepthExtractNode + Canvas.handleDepth）调 runDepth 后回填 data.output.images，
 * 与 handleProcessLocal 走同一套取消/状态机。
 *
 * @param {string[]} inputUrls 输入图 http URL（已 normalizeImageUrls 规范化）
 * @param {object} params 深度图参数：{ grayscale: 'true'|'false', predOnly: 'true'|'false' }
 * @returns {Promise<string[]>} 产出深度图的 http URL 数组
 */
import { normalizeImageUrls } from './workflow';

// Depth Anything 插件 id（与 packages/templates/plugins/depth-anything/info.json 的 id 一致）
const DEPTH_PLUGIN_ID = 'workflow.depth-anything';
const DEPTH_BATCH_ACTION = 'depth_batch_predict';

/**
 * 提取深度图。返回产出图 URL 数组。
 * 多图走插件批量接口（GPU 并行），部分失败不阻塞成功的。
 */
export async function runDepth(inputUrls, params = {}, opts = {}) {
  const urls = normalizeImageUrls((inputUrls || []).filter(Boolean));
  if (!urls.length) throw new Error('提取深度图需要输入图');

  const AS = window.AgentSpaces;
  if (!AS?.callPluginTool) throw new Error('宿主 callPluginTool 不可用');

  // 插件 actions.js 的入参：images(JSON 数组)、grayscale、pred_only 均为字符串
  const args = {
    images: urls,
    grayscale: params.grayscale === 'false' ? 'false' : 'true',
    pred_only: params.predOnly === 'false' ? 'false' : 'true',
  };

  const ret = await AS.callPluginTool(
    DEPTH_PLUGIN_ID,
    DEPTH_BATCH_ACTION,
    args,
    { meta: { executionTarget: opts.executionTarget || undefined } },
  );
  const results = extractDepthResults(ret);
  const outUrls = [];
  for (const r of results) {
    if (r && r.success && r.imageUrl) outUrls.push(r.imageUrl);
  }
  if (!outUrls.length) {
    throw new Error('深度图提取未返回图片（插件可能未安装或服务未启动）');
  }
  return outUrls;
}

/**
 * 从 depth_batch_predict 插件返回结构提取 results 数组。
 * 返回结构：{ success, data: { results: [{ input, success, imageUrl, ... }] } }，
 * 兼容 callPluginTool 的 { success, result } 包装。
 */
function extractDepthResults(ret) {
  const data =
    ret && typeof ret === 'object' && 'result' in ret && typeof ret.success === 'boolean'
      ? ret.result
      : ret;
  const results = data?.data?.results;
  if (Array.isArray(results)) return results;
  // 兜底：单图动作直接返回 imageUrl
  if (data?.data?.imageUrl) return [{ success: true, imageUrl: data.data.imageUrl }];
  if (data?.imageUrl) return [{ success: true, imageUrl: data.imageUrl }];
  return [];
}
