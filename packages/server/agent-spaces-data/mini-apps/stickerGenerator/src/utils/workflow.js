// 工作流 ID 与结果解析工具

// 默认工作流 ID（设置对话框未配置时的兜底）
export const DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID = 'd88dcb7c-7f5f-47c8-962c-89217a2c0ad6';
export const DEFAULT_EDIT_IMAGE_WORKFLOW_ID = '19f5f8a9-305d-43a6-9b05-584597213a8f';

// 调用工作流的统一入口：根据是否有参考图自动选择文生图 / 图生图工作流
// workflowIds: { textToImage, editImage } 来自设置，缺省用默认 ID
// 返回 { workflowId, kind, images: [{ url }] }
export async function runStickerWorkflow({
  AS,
  prompt,
  model,
  aspect,
  size,
  references = [],
  workflowIds = {},
  faultTolerance = 'ignore',
}) {
  const finalPrompt = prompt;
  const modelId = model;
  if (!finalPrompt) throw new Error('请输入贴图描述');
  if (!modelId) throw new Error('请选择模型');

  const hasRefs = Array.isArray(references) && references.length > 0;
  const workflowId = hasRefs
    ? (workflowIds.editImage || DEFAULT_EDIT_IMAGE_WORKFLOW_ID)
    : (workflowIds.textToImage || DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID);
  const kind = hasRefs ? 'edit_image' : 'text_to_image';

  // 图生图需要把参考图解析成 { name, path, url }
  const images = hasRefs ? await Promise.all(references.map(resolveUploadItem)) : [];

  const input = {
    prompt: finalPrompt,
    model: modelId,
    aspect: aspect || '1:1',
    size: size || '1k',
  };
  if (hasRefs) input.images = images;

  const taskId = `sticker-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const result = await AS.callPluginTool(
    '@agent-spaces/builtin',
    'execute_workflow_sync',
    { workflow_id: workflowId, input, max_wait_ms: 600000, fault_tolerance: faultTolerance },
    { taskId, meta: { workflowId, kind, prompt: finalPrompt, model: modelId, label: '贴图生成' } },
  );

  const payload = unwrapWorkflowPayload(result);
  if (payload?.status && payload.status !== 'completed' && payload.status !== 'success') {
    throw new Error(payload.timedOut ? '工作流仍在运行，请稍后查看历史' : `工作流状态：${payload.status}`);
  }
  const imagesOut = extractImages(payload);
  if (!imagesOut.length) throw new Error('工作流没有返回图片结果');
  return { workflowId, kind, prompt: finalPrompt, images: imagesOut };
}

// 解析 FileUpload 上传项为 { name, path, url }（与 cover-generator 一致）
export async function resolveUploadItem(item) {
  const file = item?.file || item;
  if (!file) throw new Error('参考图无效');
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
  return {
    name: file.name || file.uploadedPath || 'reference.png',
    path: file.uploadedPath || file.path || url,
    url,
  };
}

// 把 FileUpload 值序列化为可持久化的结构（不含 File 对象）
export function persistableReferences(references) {
  return (Array.isArray(references) ? references : [])
    .map((item) => {
      const file = item?.file || item;
      const url = file?.uploadedHttpPath || file?.uploadedUrl || file?.httpPath || file?.url || '';
      if (!url) return null;
      return {
        id: item?.id || `ref-${Math.random().toString(36).slice(2)}`,
        file: {
          name: file.name || 'reference.png',
          size: file.size || 0,
          type: file.type || 'image/png',
          url,
          httpPath: url,
          uploadedUrl: file.uploadedUrl || url,
          uploadedHttpPath: file.uploadedHttpPath || url,
          uploadedPath: file.uploadedPath || file.path || '',
        },
      };
    })
    .filter(Boolean);
}

// unwrap: { success, result } / { data } / 直接 payload 多层穿透
export function unwrapWorkflowPayload(value) {
  let payload = value;
  for (let i = 0; i < 5; i += 1) {
    if (!payload || typeof payload !== 'object') break;
    if (Array.isArray(payload.steps) || payload.status || payload.workflow_id || payload.executionId) break;
    if (payload.result && typeof payload.result === 'object') { payload = payload.result; continue; }
    if (payload.data && typeof payload.data === 'object') { payload = payload.data; continue; }
    break;
  }
  return payload;
}

// 从工作流结果里抽取图片列表
export function extractImages(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const endStep = steps.find((step) =>
    step?.nodeId === 'node_1782272191524_rvv1lk'
    || step?.nodeId === 'node_1781681576137_end'
    || String(step?.nodeId || '').endsWith('_end')
    || String(step?.nodeLabel || '').includes('结束'),
  );
  const result = endStep?.output?.result
    || payload?.result
    || steps.find((step) => Array.isArray(step?.output?.data?.images))?.output?.data?.images
    || steps.find((step) => Array.isArray(step?.output?.images))?.output?.images
    || [];
  const images = Array.isArray(result) ? result : [result];
  return images
    .map((item) => {
      if (typeof item === 'string') return { url: item };
      if (item?.url) return { url: item.url };
      if (item?.imageUrl) return { url: item.imageUrl };
      return null;
    })
    .filter((item) => item && item.url);
}
