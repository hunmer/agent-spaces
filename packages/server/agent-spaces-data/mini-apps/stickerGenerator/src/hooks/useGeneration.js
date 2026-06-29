// 生成 + 任务事件订阅
import { runStickerWorkflow } from '../utils/workflow';
import { buildPrompt } from '../utils/styles';

// 监听 miniApp.taskSnapshot / taskStarted / taskFinished / taskFailed，
// 让本标签发起的生成在 running 时显示，结束时落库
export function useGeneration({ form, customStyles, onComplete }) {
  const AS = window.AgentSpaces;
  const executorId = AS.getExecutorId?.();

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [activeTask, setActiveTask] = React.useState(null);

  const generate = React.useCallback(async () => {
    setError('');
    const prompt = String(form.prompt || '').trim();
    if (!prompt) { setError('请输入贴图描述'); return; }
    if (!form.model) { setError('请选择模型'); return; }

    const finalPrompt = buildPrompt(form, customStyles);
    setRunning(true);
    setStatus('正在执行工作流...');

    try {
      const out = await runStickerWorkflow({
        AS,
        prompt: finalPrompt,
        model: form.model,
        aspect: form.aspect,
        size: form.size,
        references: form.references,
        form,
        customStyles,
      });

      const styleName = (customStyles.find((s) => s.id === form.styleId)?.name)
        || (customStyles.find((s) => s.id === form.styleId)?.label_zh)
        || '';
      await AS.invokeService('add_results', {
        items: out.images,
        prompt: form.prompt,
        model: form.model,
        styleId: form.styleId,
        styleName,
        aspect: form.aspect,
        size: form.size,
        kind: out.kind,
        workflowId: out.workflowId,
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
  }, [form, customStyles, onComplete]);

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
