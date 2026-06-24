// 文案转分镜 · 工作流调用 / 结果解析 / Agent 导入
import { BUILTIN_PLUGIN } from './constants.js';

const AS = () => window.AgentSpaces;

// 层层解包 execute_workflow_sync 返回，定位到 { status, steps, ... } 这一格
export function unwrapWorkflowPayload(value) {
  let payload = value;
  for (let i = 0; i < 6; i += 1) {
    if (!payload || typeof payload !== 'object') break;
    if (Array.isArray(payload.steps) || payload.status || payload.workflow_id || payload.executionId) break;
    if (payload.result && typeof payload.result === 'object') { payload = payload.result; continue; }
    if (payload.data && typeof payload.data === 'object') { payload = payload.data; continue; }
    break;
  }
  return payload || {};
}

// 从 end 节点 output.result（string[]）提取 URL 数组
// 新版工作流可能有多个结束节点，优先取真正带 result / result_url 的那个
export function extractResultUrls(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const endSteps = steps.filter((s) =>
    String(s?.nodeId || '').endsWith('_end')
    || String(s?.nodeLabel || '').includes('结束')
    || String(s?.nodeLabel || '').toLowerCase().includes('end'),
  );
  const resultStep = endSteps.find((s) => s?.output?.result || s?.output?.result_url) || endSteps[0];
  const raw = resultStep?.output?.result ?? resultStep?.output?.result_url ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.url) return item.url;
      return null;
    })
    .filter(Boolean);
}

// 调用工作流生成（图片或视频共用）
// kind: 'image' | 'video'
export async function runGeneration({ kind, workflowId, input, label }) {
  const taskId = `sb-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const result = await AS().callPluginTool(
    BUILTIN_PLUGIN,
    'execute_workflow_sync',
    {
      workflow_id: workflowId,
      input,
      max_wait_ms: 600000,
    },
    {
      taskId,
      meta: { kind, workflowId, label: label || `${kind === 'image' ? '生成图片' : '生成视频'}` },
    },
  );
  const payload = unwrapWorkflowPayload(result);
  if (payload?.status && payload.status !== 'completed' && payload.status !== 'success') {
    throw new Error(payload.timedOut ? '工作流仍在运行，请稍后重试' : `工作流状态：${payload.status}`);
  }
  const urls = extractResultUrls(payload);
  if (!urls.length) throw new Error('工作流没有返回结果');
  return urls;
}

// 从角色列表里取「选中图」URL 列表，作为生图参考
export function selectedImageUrls(characters) {
  const urls = [];
  (Array.isArray(characters) ? characters : []).forEach((c) => {
    (Array.isArray(c?.images) ? c.images : []).forEach((img) => {
      if (img?.selected && img?.url) urls.push(img.url);
    });
  });
  return urls;
}

// 解析 FileUpload 上传项，拿到可访问 URL
export async function resolveUploadItem(item) {
  const file = item?.file || item;
  if (!file) throw new Error('文件无效');
  if (file.uploadError) throw new Error(file.uploadError);
  if (file.uploadPromise) {
    const uploaded = await file.uploadPromise;
    Object.assign(file, {
      uploadedPath: uploaded.path,
      uploadedUrl: uploaded.url,
      uploadedHttpPath: uploaded.httpPath,
      uploading: false,
      uploadError: undefined,
      uploadPromise: Promise.resolve(uploaded),
    });
  }
  const url = file.uploadedHttpPath || file.uploadedUrl || file.httpPath || file.url || '';
  if (!url) throw new Error('未能获取文件地址');
  return url;
}

// 解析 agent 返回的文本，提取分镜 JSON
export function parseStoryboardJson(text) {
  if (!text) return null;
  let raw = String(text).trim();
  // 去掉可能的 ```json ... ``` 包裹
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  // 截取第一个 { 到最后一个 }，容错 agent 多输出解释文字
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}
