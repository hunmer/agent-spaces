// 上传/解析图片、调用工作流、解析工作流输出等通用工具

export async function resolveUploadItem(item) {
  const file = item?.file || item;
  if (!file) throw new Error('图片无效');
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
    name: file.name || file.uploadedPath || 'image.png',
    path: file.uploadedPath || file.path || url,
    url,
  };
}

export function persistableFiles(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const file = item?.file || item;
      const url = file?.uploadedHttpPath || file?.uploadedUrl || file?.httpPath || file?.url || '';
      if (!url) return null;
      return {
        id: item?.id || `img-${Math.random().toString(36).slice(2)}`,
        file: {
          name: file.name || 'image.png',
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

export function normalizeWorkflow(workflow) {
  return {
    ...workflow,
    id: workflow.id || workflow.workflow_id,
    name: workflow.name || workflow.title || '未命名工作流',
    updatedAt: workflow.updatedAt || 0,
    nodes: workflow.nodes || [],
  };
}

// 多层 unwrap：拿到真正承载 steps/status 的那层 payload
export function unwrapWorkflowPayload(value) {
  let payload = value;
  for (let i = 0; i < 5; i += 1) {
    if (!payload || typeof payload !== 'object') break;
    if (Array.isArray(payload.steps) || payload.status || payload.workflow_id || payload.executionId) break;
    if (payload.result && typeof payload.result === 'object') {
      payload = payload.result;
      continue;
    }
    if (payload.data && typeof payload.data === 'object') {
      payload = payload.data;
      continue;
    }
    break;
  }
  return payload;
}

// 只从实际执行到的结束节点提取最终图片，避免误取中间节点产物。
export function extractImages(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const endSteps = steps.filter((step) => step?.nodeType === 'end' && step?.status === 'completed');
  const result = endSteps.find((step) => Array.isArray(step?.output?.result))?.output.result || [];
  const error = endSteps.find((step) => typeof step?.output?.error === 'string')?.output.error;
  if (!result.length && error) throw new Error(error);
  const images = Array.isArray(result) ? result : [result];
  return images
    .map((item) => {
      if (typeof item === 'string') return { type: 'image', url: item };
      if (item?.url) return { type: 'image', url: item.url };
      if (item?.imageUrl) return { type: 'image', url: item.imageUrl };
      return null;
    })
    .filter((item) => item?.url);
}

// 执行图生图工作流（同步等待 + 任务跟踪）
export async function runImageToImage({
  AS,
  workflowId,
  sourceImage,        // { url, path, name }
  references,         // [{ url, path, name }]
  prompt,
  model,
  aspect = '1:1',
  size = '1k',
  taskIdPrefix = 'fitting',
  label = '试衣间',
}) {
  if (!workflowId) throw new Error('请先选择工作流');
  if (!sourceImage?.url) throw new Error('请选择一张形象图');
  const normalizedPrompt = prompt?.trim() || '';

  const images = [
    sourceImage.url,
    ...(Array.isArray(references) ? references.map((ref) => ref.url) : []),
  ].filter(Boolean);

  const taskId = `${taskIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const result = await AS.callPluginTool(
    '@agent-spaces/builtin',
    'execute_workflow_sync',
    {
      workflow_id: workflowId,
      input: {
        images,
        prompt: normalizedPrompt,
        model: model || 'gpt-image-2',
        aspect,
        size,
      },
      max_wait_ms: 1200000,
    },
    {
      taskId,
      meta: {
        workflowId,
        prompt: normalizedPrompt,
        model,
        aspect,
        size,
        label,
        sourceImage: sourceImage.url,
      },
    },
  );

  const payload = unwrapWorkflowPayload(result);
  if (payload?.status && payload.status !== 'completed' && payload.status !== 'success') {
    throw new Error(payload.timedOut ? '工作流仍在运行，请稍后查看历史' : `工作流状态：${payload.status}`);
  }
  const imagesOut = extractImages(payload);
  if (!imagesOut.length) throw new Error('工作流没有返回图片结果');
  return imagesOut;
}
