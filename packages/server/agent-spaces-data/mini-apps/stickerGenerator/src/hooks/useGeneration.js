// 生成 + 任务事件订阅
import { runStickerWorkflow } from '../utils/workflow';
import { buildPrompt } from '../utils/styles';
import { localizeImages } from '../utils/download';

// 监听 miniApp.taskSnapshot / taskStarted / taskFinished / taskFailed，
// 让本标签发起的生成在 running 时显示，结束时落库
export function useGeneration({ form, customStyles, settings, onComplete }) {
  const AS = window.AgentSpaces;
  const executorId = AS.getExecutorId?.();

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [activeTask, setActiveTask] = React.useState(null);

  const generate = React.useCallback(async () => {
    setError('');
    const userPrompt = String(form.prompt || '').trim();
    if (!userPrompt) { setError('请输入贴图描述'); return; }
    const model = form.model || settings?.defaultModel || '';
    if (!model) { setError('请先在设置中选择模型'); return; }

    const finalPrompt = buildPrompt(form, customStyles);
    setRunning(true);
    setStatus('正在执行工作流...');

    try {
      const out = await runStickerWorkflow({
        AS,
        prompt: finalPrompt,
        model,
        aspect: form.aspect,
        size: form.size,
        references: form.references,
        workflowIds: {
          textToImage: settings?.textToImageWorkflowId,
          editImage: settings?.editImageWorkflowId,
        },
      });

      const matched = [...customStyles].find((s) => s.id === form.styleId);
      const styleName = matched?.label_zh || matched?.name || '';

      // 入库前把远程图片保存到本地 data/output + 生成 data/thumbs 缩略图，
      // history 用本地副本（离线可用、永久保存）；失败回退远程 url
      const stamp = Date.now();
      const localized = await localizeImages(AS, out.images, `sticker-${stamp}`);

      await AS.invokeService('add_results', {
        items: localized,
        prompt: userPrompt,
        model,
        styleId: form.styleId,
        styleName,
        aspect: form.aspect,
        size: form.size,
        kind: out.kind,
        workflowId: out.workflowId,
        layoutMode: form.layoutMode,
        collectionCount: form.layoutMode === 'collection' ? form.collectionCount : 0,
      });
      setStatus(`已生成 ${out.images.length} 张贴图`);
      onComplete?.(out);
    } catch (err) {
      const msg = err?.message || String(err || '生成失败');
      setError(msg);
      setStatus('');
    } finally {
      setRunning(false);
    }
  }, [form, customStyles, settings, onComplete]);

  // 订阅任务事件：仅在当前标签发起时显示全局态
  React.useEffect(() => {
    const off = AS.onTaskEvent?.((event, data) => {
      if (!data) return;
      const isMine = !data.executorId || data.executorId === executorId;
      if (event === 'miniApp.taskStarted' && isMine && data?.meta?.label === '贴图生成') {
        setActiveTask({ taskId: data.taskId, meta: data.meta });
        setRunning(true);
      } else if (event === 'miniApp.taskFinished' && isMine && data?.meta?.label === '贴图生成') {
        setActiveTask(null);
        setRunning(false);
      } else if (event === 'miniApp.taskFailed' && isMine && data?.meta?.label === '贴图生成') {
        setActiveTask(null);
        setRunning(false);
        setError(data?.error || '生成失败');
      }
    });
    return () => off?.();
  }, [executorId]);

  return { running, status, error, setError, setStatus, activeTask, generate };
}
