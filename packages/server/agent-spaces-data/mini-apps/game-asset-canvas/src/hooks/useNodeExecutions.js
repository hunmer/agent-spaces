import { useCallback } from 'react';
import { NODE_TYPES, IMAGE_TAGS, WORKFLOWS, NODE_META, defaultCutoutParams } from '../utils/constants';
import { generateAudio, generateVideo, normalizeImageUrls, runAgentVisionText, runWithConcurrency } from '../utils/workflow';
import { runProcessor } from '../utils/image-ops';
import { runCutout } from '../utils/cutout';
import { runDepth } from '../utils/depth';
import { genId } from '../utils/canvas-id';
import { registerController, clearController, abortController,
  registerWorkflowHandle, setWorkflowExecutionId, getWorkflowHandle,
  markWorkflowAborted, clearWorkflowHandle } from '../utils/processing-controllers';

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
export default function useNodeExecutions({
  runWorkflow,
  updateNodeData,
  updateExecutionNodeData,
  addHistory,
  settings,
  createNodeAt,
  saveLastParams,
}) {
  // 节点内部更新 data 的回调（注入到 data.onUpdate）—— 留在 Canvas 也可，但与执行强相关放这里
  const makeOnUpdate = useCallback((nodeId) => (patch) => {
    updateNodeData(nodeId, patch);
  }, [updateNodeData]);

  // 完成后通知：settings.notifyOnComplete 开启时，节点生成成功后调 sendNotification 推送通知。
  // 失败静默（通知是锦上添花，不应阻塞流程）。
  const notifyDone = useCallback((title, description) => {
    if (!settings?.notifyOnComplete) return;
    try {
      window.AgentSpaces?.sendNotification?.('mini_app', title, description);
    } catch (e) {
      console.warn('sendNotification failed:', e);
    }
  }, [settings?.notifyOnComplete]);

  // 节点点击"生成"：优先用设置页配置的工作流 ID，fallback 到节点传的 workflowId
  // input.count > 1 时按 count 重复调用工作流（runWithConcurrency 限并发），图片合并。
  // 支持取消：并行订阅 workflow:started 拿 executionId，取消时 stopWorkflow 真中断引擎。
  const handleGenerate = useCallback(async (
    nodeId, nodeType, { workflowId, input, executionTarget = null },
  ) => {
    const requestNodeId = executionTarget?.nodeId || nodeId;
    const update = (patch) => (executionTarget
      ? updateExecutionNodeData?.(executionTarget, patch)
      : updateNodeData(nodeId, patch));
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
    const count = Math.max(1, Math.min(20, Number(input?.count) || 1));
    const concurrency = Math.max(1, Math.min(count, Number(input?.concurrency) || 1));
    // count/concurrency 不传给工作流 input（避免污染 start 节点 inputFields）
    const wfInput = { ...input };
    delete wfInput.count;
    delete wfInput.concurrency;
    // 注册工作流句柄 + 订阅 started 事件回填 executionId（供中断）
    const wfHandle = registerWorkflowHandle(requestNodeId);
    const AS = window.AgentSpaces;
    const unsubStarted = AS?.subscribeWorkflowEvents?.((event, data) => {
      if (event === 'workflow:started' && data?.executionId) {
        setWorkflowExecutionId(requestNodeId, data.executionId);
      }
    });
    update({ status: 'running', error: undefined });
    // 提前生成 histId：作为落地子目录名，与 history 记录共用（count 多次调用工作流落到同一子目录）
    const histId = genId('hist');
    try {
      const batches = await runWithConcurrency(count, concurrency, () => {
        if (wfHandle.aborted) return [];
        return runWorkflow(finalWorkflowId, wfInput, histId, executionTarget).then((r) => r || { urls: [], resources: [] }).catch((e) => {
          // 部分失败不阻塞：返回空数组让成功的合并；全部失败由最终 length 校验抛错
          console.warn('generate one batch failed:', e);
          return { urls: [], resources: [] };
        });
      });
      if (wfHandle.aborted) {
        update({ status: 'cancelled', error: undefined });
        return;
      }
      const urls = batches.flatMap((batch) => batch.urls || []).filter(Boolean);
      const resources = batches.flatMap((batch) => batch.resources || []).filter((item) => item?.url);
      if (!urls.length) throw new Error('未返回图片');
      update({ status: 'done', output: { images: urls, resources } });
      // 落地已在 generateImages 内完成（按 directory 决定走工作区目录或 data），这里只记录历史
      addHistory({
        id: histId,
        nodeId: requestNodeId,
        templateNodeId: nodeId,
        executionTarget,
        nodeType,
        prompt: input?.prompt || '',
        model: input?.model || '',
        images: urls,
        resources,
        createdAt: Date.now(),
      }).catch((e) => console.error('addHistory failed:', e));
      notifyDone('生成完成', `${NODE_META[nodeType]?.label || '节点'}产出了 ${urls.length} 张图`);
    } catch (err) {
      if (wfHandle.aborted) {
        update({ status: 'cancelled', error: undefined });
        return;
      }
      console.error('generate failed:', err);
      update({ status: 'error', error: err?.message || String(err) });
    } finally {
      try { unsubStarted?.(); } catch {}
      clearWorkflowHandle(requestNodeId);
    }
  }, [runWorkflow, updateNodeData, updateExecutionNodeData, addHistory, settings, saveLastParams]);

  // 媒体节点（音频/视频）生成：与 handleGenerate 同款，但产出写 output.audio(s) / output.video(s)。
  // count > 1 时按 count 并发调用，产出合并为 audios/videos 数组（媒体单值 audio/video 保留兼容：取首项）。
  // 支持取消：并行订阅 workflow:started 拿 executionId，取消时 stopWorkflow 真中断引擎。
  const handleGenerateMedia = useCallback(async (
    nodeId, nodeType, kind, { workflowId, input, executionTarget = null },
  ) => {
    const requestNodeId = executionTarget?.nodeId || nodeId;
    const update = (patch) => (executionTarget
      ? updateExecutionNodeData?.(executionTarget, patch)
      : updateNodeData(nodeId, patch));
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
    const count = Math.max(1, Math.min(20, Number(input?.count) || 1));
    const concurrency = Math.max(1, Math.min(count, Number(input?.concurrency) || 1));
    // count/concurrency 不传给工作流 input（避免污染 start 节点 inputFields）
    const wfInput = { ...input };
    delete wfInput.count;
    delete wfInput.concurrency;
    const wfHandle = registerWorkflowHandle(requestNodeId);
    const AS = window.AgentSpaces;
    const unsubStarted = AS?.subscribeWorkflowEvents?.((event, data) => {
      if (event === 'workflow:started' && data?.executionId) {
        setWorkflowExecutionId(requestNodeId, data.executionId);
      }
    });
    update({ status: 'running', error: undefined });
    try {
      const batches = await runWithConcurrency(count, concurrency, () => {
        if (wfHandle.aborted) return '';
        return runMedia(finalWorkflowId, wfInput, { executionTarget }).then((r) => r.url || '').catch((e) => {
          console.warn('generateMedia one batch failed:', e);
          return '';
        });
      });
      if (wfHandle.aborted) {
        update({ status: 'cancelled', error: undefined });
        return;
      }
      const urls = batches.filter(Boolean);
      if (!urls.length) throw new Error(isAudio ? '未返回音频' : '未返回视频');
      // 单值字段保留兼容（旧渲染逻辑用 output.audio / output.video），多值用 audios / videos 数组
      const patch = { status: 'done' };
      if (isAudio) {
        patch.output = { audio: urls[0], audios: urls };
      } else {
        patch.output = { video: urls[0], videos: urls };
      }
      update(patch);
      addHistory({
        id: genId('hist'),
        nodeId: requestNodeId,
        templateNodeId: nodeId,
        executionTarget,
        nodeType,
        prompt: input?.prompt || '',
        model: input?.model || '',
        images: urls,
        mediaType: isAudio ? 'audio' : 'video',
        createdAt: Date.now(),
      }).catch((e) => console.error('addHistory(media) failed:', e));
      notifyDone('生成完成', `${NODE_META[nodeType]?.label || '节点'}生成了 ${urls.length} 个${isAudio ? '音频' : '视频'}`);
    } catch (err) {
      if (wfHandle.aborted) {
        update({ status: 'cancelled', error: undefined });
        return;
      }
      console.error('generateMedia failed:', err);
      update({ status: 'error', error: err?.message || String(err) });
    } finally {
      try { unsubStarted?.(); } catch {}
      clearWorkflowHandle(requestNodeId);
    }
  }, [generateAudio, generateVideo, updateNodeData, updateExecutionNodeData, addHistory, settings, saveLastParams]);

  // 反推提示词节点「执行」：调视觉 AI（agent_run + 多图附件）→ 写文本产出 + 历史。
  // 取消机制与 handleProcessLocal 共用 processingControllers 注册表。
  const handlePromptReverse = useCallback(async (nodeId, inputImages, executionTarget = null) => {
    const requestNodeId = executionTarget?.nodeId || nodeId;
    const update = (patch) => (executionTarget
      ? updateExecutionNodeData?.(executionTarget, patch)
      : updateNodeData(nodeId, patch));
    const agentConfig = {
      id: settings.promptReverseAgentConfigId || '',
      userPrompt: settings.promptReverseUserPrompt || '',
    };
    if (!agentConfig.id) {
      update({
        status: 'error',
        error: '未配置 AI 模型，请先到「设置 → 反推提示词 AI」配置',
      });
      return;
    }
    if (!inputImages?.length) return;
    const controller = new AbortController();
    registerController(requestNodeId, controller);

    update({
      status: 'running',
      error: undefined,
      output: { text: '' },
      statusMsg: '压缩图片中…',
    });
    try {
      const text = await runAgentVisionText(agentConfig, inputImages, {
        signal: controller.signal,
        stripThink: true,
        executionTarget,
        onCompressProgress: (done, total) => {
          update({ statusMsg: `压缩图片 ${done}/${total}…` });
        },
      });
      if (controller.signal.aborted) return;
      if (!text || !text.trim()) throw new Error('AI 未返回内容');
      update({
        status: 'done',
        output: { text },
        statusMsg: '',
      });
      addHistory({
        id: genId('hist'),
        nodeId: requestNodeId,
        templateNodeId: nodeId,
        executionTarget,
        nodeType: NODE_TYPES.promptReverse,
        prompt: '反推提示词',
        model: 'agent_run',
        images: inputImages.slice(0, 4),
        mediaType: 'text',
        text: text.slice(0, 5000),
        createdAt: Date.now(),
      }).catch((e) => console.error('promptReverse addHistory failed:', e));
      notifyDone('反推完成', `已反推 ${inputImages.length} 张图的提示词`);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('promptReverse failed:', err);
      update({
        status: 'error',
        error: err?.message || String(err),
        statusMsg: '',
      });
    } finally {
      clearController(requestNodeId, controller);
    }
  }, [settings, updateNodeData, updateExecutionNodeData, addHistory]);

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
  const handleProcessLocal = useCallback(async (
    nodeId, processorId, processorParams, sourceImages, nodeType, executionTarget = null,
  ) => {
    const requestNodeId = executionTarget?.nodeId || nodeId;
    const update = (patch) => (executionTarget
      ? updateExecutionNodeData?.(executionTarget, patch)
      : updateNodeData(nodeId, patch));
    if (!sourceImages?.length) return;
    // 记忆上次提交参数（仅 processorParams，processor 由 nodeType 固定）—— 失败不阻塞
    try { saveLastParams?.(nodeType, { processorParams: processorParams || {} }); }
    catch (e) { console.error('saveLastParams failed:', e); }
    const controller = new AbortController();
    registerController(requestNodeId, controller);

    const normalizedImages = normalizeImageUrls(sourceImages.filter(Boolean));
    // enhance 处理器走 image_enchanter 工作流，需注入 workflowId + runWorkflowFn
    const extraCtx = processorId === 'enhance'
      ? {
          workflowId: settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter,
          runWorkflowFn: (workflowId, input, histId) => (
            runWorkflow(workflowId, input, histId, executionTarget)
          ),
        }
      : {};

    update({ status: 'running', error: undefined, output: { images: [] } });
    try {
      const urls = await runProcessor(processorId, normalizedImages, processorParams || {}, extraCtx);
      if (controller.signal.aborted) return;
      if (!urls.length) throw new Error('处理未返回图片');
      update({ status: 'done', output: { images: urls } });
      const histNodeType = nodeType || NODE_TYPES.imageProcess;
      addHistory({
        id: genId('hist'),
        nodeId: requestNodeId,
        templateNodeId: nodeId,
        executionTarget,
        nodeType: histNodeType,
        prompt: processorId,
        model: processorId === 'enhance' ? 'image_enchanter' : 'local',
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('processLocal addHistory failed:', e));
      notifyDone('处理完成', `${NODE_META[histNodeType]?.label || '节点'}处理完成，产出 ${urls.length} 张图`);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('processLocal failed:', err);
      update({ status: 'error', error: err?.message || String(err) });
    } finally {
      clearController(requestNodeId, controller);
    }
  }, [updateNodeData, updateExecutionNodeData, addHistory, settings, runWorkflow, saveLastParams]);

  // 统一抠图节点「执行抠图」：调 runCutout 分流（白底/色度键本地算法 / 工作流抠图 / rembg 插件）。
  const handleCutout = useCallback(async (
    nodeId, mode, modeParams, sourceImages, executionTarget = null,
  ) => {
    const requestNodeId = executionTarget?.nodeId || nodeId;
    const update = (patch) => (executionTarget
      ? updateExecutionNodeData?.(executionTarget, patch)
      : updateNodeData(nodeId, patch));
    if (!sourceImages?.length) return;
    // 记忆上次提交参数（mode + modeParams）—— 失败不阻塞
    try { saveLastParams?.(NODE_TYPES.cutout, { mode, modeParams: modeParams || {} }); }
    catch (e) { console.error('saveLastParams failed:', e); }
    const controller = new AbortController();
    registerController(requestNodeId, controller);

    const extraCtx = mode === 'workflow'
      ? {
          workflowId: settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter,
          runWorkflowFn: (workflowId, input, histId) => (
            runWorkflow(workflowId, input, histId, executionTarget)
          ),
        }
      : { executionTarget };
    extraCtx.executionTarget = executionTarget;

    update({ status: 'running', error: undefined, output: { images: [] } });
    try {
      const urls = await runCutout(mode, sourceImages, modeParams || {}, extraCtx);
      if (controller.signal.aborted) return;
      if (!urls.length) throw new Error('抠图未返回图片');
      update({ status: 'done', output: { images: urls } });
      addHistory({
        id: genId('hist'),
        nodeId: requestNodeId,
        templateNodeId: nodeId,
        executionTarget,
        nodeType: NODE_TYPES.cutout,
        prompt: `抠图·${mode}`,
        model: mode === 'workflow' ? 'image_enchanter' : (mode === 'rembg' ? 'rembg' : 'local'),
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('cutout addHistory failed:', e));
      notifyDone('抠图完成', `抠图完成，产出 ${urls.length} 张图`);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('cutout failed:', err);
      update({ status: 'error', error: err?.message || String(err) });
    } finally {
      clearController(requestNodeId, controller);
    }
  }, [updateNodeData, updateExecutionNodeData, addHistory, settings, runWorkflow, saveLastParams]);

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

  // 提取深度图节点「⚡ 提取深度图」：调 runDepth → callPluginTool('workflow.depth-anything', 'depth_batch_predict')。
  // params = { grayscale, predOnly }，透传到插件入参（字符串 'true'/'false'）。
  const handleDepth = useCallback(async (nodeId, params, sourceImages, executionTarget = null) => {
    const requestNodeId = executionTarget?.nodeId || nodeId;
    const update = (patch) => (executionTarget
      ? updateExecutionNodeData?.(executionTarget, patch)
      : updateNodeData(nodeId, patch));
    if (!sourceImages?.length) return;
    try { saveLastParams?.(NODE_TYPES.depthExtract, params || {}); }
    catch (e) { console.error('saveLastParams failed:', e); }
    const controller = new AbortController();
    registerController(requestNodeId, controller);

    update({ status: 'running', error: undefined, output: { images: [] } });
    try {
      const urls = await runDepth(sourceImages, params || {}, { executionTarget });
      if (controller.signal.aborted) return;
      if (!urls.length) throw new Error('深度图提取未返回图片');
      update({ status: 'done', output: { images: urls } });
      addHistory({
        id: genId('hist'),
        nodeId: requestNodeId,
        templateNodeId: nodeId,
        executionTarget,
        nodeType: NODE_TYPES.depthExtract,
        prompt: '提取深度图',
        model: 'depth-anything',
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('depth addHistory failed:', e));
      notifyDone('深度图提取完成', `深度图提取完成，产出 ${urls.length} 张图`);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('depth failed:', err);
      update({ status: 'error', error: err?.message || String(err) });
    } finally {
      clearController(requestNodeId, controller);
    }
  }, [updateNodeData, updateExecutionNodeData, addHistory, saveLastParams]);

  // 统一取消入口（节点【取消生成】按钮调用）：
  // - 工作流类（文生图/编辑图/配音/视频）：标记 aborted + stopWorkflow(executionId) 真中断引擎
  // - 本地算法类（图像处理/抠图/反推）：abort AbortController 中断本地任务
  // 执行返回后各自检查 aborted/cancelled 置 status='cancelled'。
  const handleCancelProcess = useCallback((nodeId, executionTarget = null) => {
    const requestNodeId = executionTarget?.nodeId || nodeId;
    const update = (patch) => (executionTarget
      ? updateExecutionNodeData?.(executionTarget, patch)
      : updateNodeData(nodeId, patch));
    const wfHandle = getWorkflowHandle(requestNodeId);
    if (wfHandle) {
      markWorkflowAborted(requestNodeId);
      const execId = wfHandle.executionId;
      if (execId && window.AgentSpaces?.stopWorkflow) {
        try { window.AgentSpaces.stopWorkflow(execId); } catch {}
      }
      // 工作流可能已发出但 executionId 尚未回填（started 事件未到）：
      // 标记 aborted 后，执行返回时自行判 cancelled；这里也立即置态，UI 即时反馈
      update({ status: 'cancelled', error: undefined });
      return;
    }
    abortController(requestNodeId); // abort + 从 Map 删除
    update({ status: 'cancelled', error: undefined });
  }, [updateNodeData, updateExecutionNodeData]);

  return {
    makeOnUpdate,
    handleGenerate, handleGenerateMedia, handlePromptReverse,
    handleProcessImage, handleProcessLocal, handleCutout, handleCutoutCreate, handleDepth, handleCancelProcess,
  };
}
