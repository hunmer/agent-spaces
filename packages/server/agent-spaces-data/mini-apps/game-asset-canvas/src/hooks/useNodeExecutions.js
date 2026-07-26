import { useCallback } from 'react';
import { NODE_TYPES, IMAGE_TAGS, WORKFLOWS, defaultCutoutParams } from '../utils/constants';
import { generateAudio, generateVideo, normalizeImageUrls, runAgentVisionText } from '../utils/workflow';
import { runProcessor } from '../utils/image-ops';
import { runCutout } from '../utils/cutout';
import { genId } from '../utils/canvas-id';
import { registerController, clearController, abortController } from '../utils/processing-controllers';

/**
 * 节点执行类回调（工作流生成 / 媒体 / 本地算法 / 抠图 / 反推提示词）。
 * 从 Canvas.jsx 抽出（原 B4 handleGenerate/handleGenerateMedia/handlePromptReverse + B14 handleProcessImage/handleProcessLocal/handleCutout/handleCutoutCreate/handleCancelProcess）。
 *
 * 共用 processing-controllers 单例管理取消（同节点不会同时跑两个本地任务）。
 *
 * @param {object} deps
 * @param {Function} deps.runWorkflow       useWorkflow() 返回值
 * @param {Function} deps.updateNodeData
 * @param {Function} deps.addHistory
 * @param {object} deps.settings
 * @param {Function} deps.createNodeAt
 * @param {Function} deps.saveLastParams  useLastParams().saveLastParams —— 提交时存参数子集（按工作区+nodeType）
 */
export default function useNodeExecutions({ runWorkflow, updateNodeData, addHistory, settings, createNodeAt, saveLastParams }) {
  // 节点内部更新 data 的回调（注入到 data.onUpdate）—— 留在 Canvas 也可，但与执行强相关放这里
  const makeOnUpdate = useCallback((nodeId) => (patch) => {
    updateNodeData(nodeId, patch);
  }, [updateNodeData]);

  // 节点点击"生成"：优先用设置页配置的工作流 ID，fallback 到节点传的 workflowId
  const handleGenerate = useCallback(async (nodeId, nodeType, { workflowId, input }) => {
    // 记忆上次提交参数（剥离图片，按工作区+nodeType 隔离）—— 失败不阻塞执行
    try {
      const { prompt, model, aspect, size } = input || {};
      saveLastParams?.(nodeType, { prompt, model, aspect, size });
    } catch (e) { console.error('saveLastParams failed:', e); }
    const settingId = nodeType === NODE_TYPES.textToImage
      ? settings.textToImageWorkflowId
      : nodeType === NODE_TYPES.editImage
        ? settings.editImageWorkflowId
        : workflowId;
    const finalWorkflowId = settingId || workflowId;
    updateNodeData(nodeId, { status: 'running', error: undefined });
    try {
      const { urls } = await runWorkflow(finalWorkflowId, input, nodeId);
      if (!urls.length) throw new Error('未返回图片');
      updateNodeData(nodeId, { status: 'done', output: { images: urls } });
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType,
        prompt: input?.prompt || '',
        model: input?.model || '',
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('addHistory failed:', e));
    } catch (err) {
      console.error('generate failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    }
  }, [runWorkflow, updateNodeData, addHistory, settings, saveLastParams]);

  // 媒体节点（音频/视频）生成：与 handleGenerate 同款，但产出写 output.audio / output.video
  const handleGenerateMedia = useCallback(async (nodeId, nodeType, kind, { workflowId, input }) => {
    // 记忆上次提交参数（按 nodeType 存对应字段，剥离图片）—— 失败不阻塞
    try {
      if (nodeType === NODE_TYPES.videoGenerator) {
        const { prompt, model, aspect, quality, duration } = input || {};
        saveLastParams?.(nodeType, { prompt, model, aspect, quality, duration });
      } else if (nodeType === NODE_TYPES.textToVoice) {
        const { prompt, model, voiceId } = input || {};
        saveLastParams?.(nodeType, { prompt, model, voiceId });
      }
    } catch (e) { console.error('saveLastParams failed:', e); }
    const settingId = nodeType === NODE_TYPES.textToVoice
      ? settings.textToVoiceWorkflowId
      : nodeType === NODE_TYPES.videoGenerator
        ? settings.videoGeneratorWorkflowId
        : workflowId;
    const finalWorkflowId = settingId || workflowId;
    const isAudio = kind === 'audio';
    const runMedia = isAudio ? generateAudio : generateVideo;
    updateNodeData(nodeId, { status: 'running', error: undefined });
    try {
      const { url } = await runMedia(finalWorkflowId, input);
      if (!url) throw new Error(isAudio ? '未返回音频' : '未返回视频');
      updateNodeData(nodeId, { status: 'done', output: { [isAudio ? 'audio' : 'video']: url } });
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType,
        prompt: input?.prompt || '',
        model: input?.model || '',
        images: [url],
        mediaType: isAudio ? 'audio' : 'video',
        createdAt: Date.now(),
      }).catch((e) => console.error('addHistory(media) failed:', e));
    } catch (err) {
      console.error('generateMedia failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    }
  }, [generateAudio, generateVideo, updateNodeData, addHistory, settings, saveLastParams]);

  // 反推提示词节点「执行」：调视觉 AI（agent_run + 多图附件）→ 写文本产出 + 历史。
  // 取消机制与 handleProcessLocal 共用 processingControllers 注册表。
  const handlePromptReverse = useCallback(async (nodeId, inputImages) => {
    const agentConfig = {
      id: settings.promptReverseAgentConfigId || '',
      userPrompt: settings.promptReverseUserPrompt || '',
    };
    if (!agentConfig.id) {
      updateNodeData(nodeId, {
        status: 'error',
        error: '未配置 AI 模型，请先到「设置 → 反推提示词 AI」配置',
      });
      return;
    }
    if (!inputImages?.length) return;
    const controller = new AbortController();
    registerController(nodeId, controller);

    updateNodeData(nodeId, {
      status: 'running',
      error: undefined,
      output: { text: '' },
      statusMsg: '压缩图片中…',
    });
    try {
      const text = await runAgentVisionText(agentConfig, inputImages, {
        signal: controller.signal,
        stripThink: true,
        onCompressProgress: (done, total) => {
          updateNodeData(nodeId, { statusMsg: `压缩图片 ${done}/${total}…` });
        },
      });
      if (controller.signal.aborted) return;
      if (!text || !text.trim()) throw new Error('AI 未返回内容');
      updateNodeData(nodeId, {
        status: 'done',
        output: { text },
        statusMsg: '',
      });
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType: NODE_TYPES.promptReverse,
        prompt: '反推提示词',
        model: 'agent_run',
        images: inputImages.slice(0, 4),
        mediaType: 'text',
        text: text.slice(0, 5000),
        createdAt: Date.now(),
      }).catch((e) => console.error('promptReverse addHistory failed:', e));
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('promptReverse failed:', err);
      updateNodeData(nodeId, {
        status: 'error',
        error: err?.message || String(err),
        statusMsg: '',
      });
    } finally {
      clearController(nodeId, controller);
    }
  }, [settings, updateNodeData, addHistory]);

  // 节点工具栏「抠图」「放大」：调用抠图和放大工作流（image_enchanter），产出独立图片节点。
  // processType: 'segment'(抠图) | 'enhance'(放大)
  const handleProcessImage = useCallback(async (sourceImages, processType) => {
    if (!sourceImages?.length) return;
    const workflowId = settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter;
    const tag = processType === 'segment' ? IMAGE_TAGS.segment : IMAGE_TAGS.enhance;
    const normalized = normalizeImageUrls(sourceImages.filter(Boolean));
    const resultId = createNodeAt(NODE_TYPES.imageDisplay, null);
    updateNodeData(resultId, { images: [], source: 'processing', loading: true, error: undefined, tags: [tag] });
    try {
      const results = await Promise.allSettled(
        normalized.map((url) =>
          runWorkflow(workflowId, { image_url: url, process_type: processType }, resultId)
            .then(({ urls }) => urls || []),
        ),
      );
      const allUrls = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value)
        .filter(Boolean);
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (!allUrls.length) throw new Error(failed ? `${failed} 张图片处理全部失败` : '未返回图片');
      updateNodeData(resultId, {
        images: allUrls,
        source: processType === 'segment' ? 'segment' : 'enhance',
        loading: false,
        error: failed ? `${failed} 张失败` : undefined,
        tags: [tag],
      });
      addHistory({
        id: genId('hist'),
        nodeId: null,
        nodeType: NODE_TYPES.imageDisplay,
        prompt: processType === 'segment' ? '抠图' : '放大',
        model: 'image_enchanter',
        images: allUrls,
        createdAt: Date.now(),
      }).catch((e) => console.error('processImage addHistory failed:', e));
    } catch (err) {
      console.error('processImage failed:', err);
      updateNodeData(resultId, { source: 'error', loading: false, error: err?.message || String(err) });
    }
  }, [settings, runWorkflow, createNodeAt, updateNodeData, addHistory]);

  // 图像处理节点「执行」：调本地算法（utils/image-ops），不走工作流。
  const handleProcessLocal = useCallback(async (nodeId, processorId, processorParams, sourceImages, nodeType) => {
    if (!sourceImages?.length) return;
    // 记忆上次提交参数（仅 processorParams，processor 由 nodeType 固定）—— 失败不阻塞
    try { saveLastParams?.(nodeType, { processorParams: processorParams || {} }); }
    catch (e) { console.error('saveLastParams failed:', e); }
    const controller = new AbortController();
    registerController(nodeId, controller);

    const normalizedImages = normalizeImageUrls(sourceImages.filter(Boolean));
    // enhance 处理器走 image_enchanter 工作流，需注入 workflowId + runWorkflowFn
    const extraCtx = processorId === 'enhance'
      ? {
          workflowId: settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter,
          runWorkflowFn: runWorkflow,
        }
      : {};

    updateNodeData(nodeId, { status: 'running', error: undefined, output: { images: [] } });
    try {
      const urls = await runProcessor(processorId, normalizedImages, processorParams || {}, extraCtx);
      if (controller.signal.aborted) return;
      if (!urls.length) throw new Error('处理未返回图片');
      updateNodeData(nodeId, { status: 'done', output: { images: urls } });
      const histNodeType = nodeType || NODE_TYPES.imageProcess;
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType: histNodeType,
        prompt: processorId,
        model: processorId === 'enhance' ? 'image_enchanter' : 'local',
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('processLocal addHistory failed:', e));
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('processLocal failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    } finally {
      clearController(nodeId, controller);
    }
  }, [updateNodeData, addHistory, settings, runWorkflow, saveLastParams]);

  // 统一抠图节点「执行抠图」：调 runCutout 分流（白底/色度键本地算法 / 工作流抠图 / rembg 插件）。
  const handleCutout = useCallback(async (nodeId, mode, modeParams, sourceImages) => {
    if (!sourceImages?.length) return;
    // 记忆上次提交参数（mode + modeParams）—— 失败不阻塞
    try { saveLastParams?.(NODE_TYPES.cutout, { mode, modeParams: modeParams || {} }); }
    catch (e) { console.error('saveLastParams failed:', e); }
    const controller = new AbortController();
    registerController(nodeId, controller);

    const extraCtx = mode === 'workflow'
      ? {
          workflowId: settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter,
          runWorkflowFn: runWorkflow,
        }
      : {};

    updateNodeData(nodeId, { status: 'running', error: undefined, output: { images: [] } });
    try {
      const urls = await runCutout(mode, sourceImages, modeParams || {}, extraCtx);
      if (controller.signal.aborted) return;
      if (!urls.length) throw new Error('抠图未返回图片');
      updateNodeData(nodeId, { status: 'done', output: { images: urls } });
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType: NODE_TYPES.cutout,
        prompt: `抠图·${mode}`,
        model: mode === 'workflow' ? 'image_enchanter' : (mode === 'rembg' ? 'rembg' : 'local'),
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('cutout addHistory failed:', e));
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('cutout failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    } finally {
      clearController(nodeId, controller);
    }
  }, [updateNodeData, addHistory, settings, runWorkflow, saveLastParams]);

  // 节点工具栏「抠图」按钮：创建统一抠图节点，预填当前节点产出图作为输入。mode 默认 workflow。
  const handleCutoutCreate = useCallback((sourceImages) => {
    if (!sourceImages?.length) return;
    const normalized = normalizeImageUrls(sourceImages.filter(Boolean));
    const mode = 'workflow';
    createNodeAt(NODE_TYPES.cutout, null, {
      uploadedImages: normalized,
      params: { mode, modeParams: defaultCutoutParams(mode) },
      tags: [IMAGE_TAGS.cutout],
    });
  }, [createNodeAt]);

  // 取消图像处理：abort signal + 置 status='cancelled'
  const handleCancelProcess = useCallback((nodeId) => {
    abortController(nodeId); // abort + 从 Map 删除
    updateNodeData(nodeId, { status: 'cancelled', error: undefined });
  }, [updateNodeData]);

  return {
    makeOnUpdate,
    handleGenerate, handleGenerateMedia, handlePromptReverse,
    handleProcessImage, handleProcessLocal, handleCutout, handleCutoutCreate, handleCancelProcess,
  };
}
