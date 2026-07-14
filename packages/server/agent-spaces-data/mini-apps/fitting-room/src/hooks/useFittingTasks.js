import { unwrapWorkflowPayload, extractImages } from "../utils/helpers";

// 只关注本应用发起的任务（meta.kind 为 hairstyle|outfit）。其它插件/项目的任务忽略。
const FITTING_KINDS = new Set(["hairstyle", "outfit"]);

function isFittingTask(data) {
  const kind = data?.meta?.kind;
  return typeof kind === "string" && FITTING_KINDS.has(kind);
}

function toTaskItem(event, data, now = Date.now()) {
  const meta = data?.meta || {};
  return {
    taskId: data?.taskId,
    executorId: data?.executorId,
    kind: meta.kind,
    label: meta.label || (meta.kind === "hairstyle" ? "发型生成" : "服装生成"),
    prompt: meta.prompt || "",
    model: meta.model,
    aspect: meta.aspect,
    size: meta.size,
    workflowName: meta.workflowName || "",
    sourceImage: meta.sourceImage || null,
    references: Array.isArray(meta.references) ? meta.references : [],
    status:
      event === "miniApp.taskFinished" ? "completed"
      : event === "miniApp.taskFailed" ? "failed"
      : "running",
    startedAt: meta.startedAt || data?.startedAt || now,
    finishedAt: event === "miniApp.taskFinished" || event === "miniApp.taskFailed"
      ? (data?.finishedAt || now)
      : undefined,
    resultImages: [],
    error: data?.error || "",
  };
}

// 全局任务队列 hook：订阅后端 miniApp.* 事件，维护 { tasks } 状态，
// 并在 taskFinished 时把解析出的图片通过服务入库（单写者，跨端同步）。
export default function useFittingTasks() {
  const AS = window.AgentSpaces;
  const [tasks, setTasks] = React.useState([]);
  const executorId = React.useRef(AS?.getExecutorId?.() || "");

  const persistResult = React.useCallback(async (item) => {
    try {
      const service = item.kind === "hairstyle" ? "add_hairstyle_results" : "add_outfit_results";
      await AS.invokeService(service, {
        items: item.resultImages,
        prompt: item.prompt,
        model: item.model,
        aspect: item.aspect,
        size: item.size,
        workflowName: item.workflowName,
        sourceImage: item.sourceImage,
        references: item.references,
      });
    } catch (err) {
      console.warn("[fitting-room] persistResult failed", err);
    }
  }, [AS]);

  React.useEffect(() => {
    executorId.current = AS?.getExecutorId?.() || "";
    let mounted = true;

    const handleEvent = (event, data) => {
      if (!mounted || !data?.taskId) return;

      if (event === "miniApp.taskSnapshot") {
        // 重连/刷新恢复：用后端快照重建列表
        const list = Array.isArray(data?.tasks) ? data.tasks : [];
        const items = list
          .filter(isFittingTask)
          .map((t) => {
            const item = toTaskItem(
              t.status === "running" ? "miniApp.taskStarted"
              : t.status === "failed" ? "miniApp.taskFailed"
              : "miniApp.taskFinished",
              { ...t, meta: t.meta },
              t.startedAt,
            );
            item.startedAt = t.startedAt;
            if (t.finishedAt) item.finishedAt = t.finishedAt;
            if (t.error) item.error = t.error;
            if (t.status === "completed") {
              // 已完成任务：尝试从快照 result 解析图片（只用于展示，入库交给 gallery 监听去重，或此处补入）
              try {
                const payload = unwrapWorkflowPayload(t.result);
                item.resultImages = extractImages(payload);
              } catch { item.resultImages = []; }
            }
            return item;
          });
        setTasks(items);
        return;
      }

      if (!isFittingTask(data)) return;

      if (event === "miniApp.taskStarted") {
        const started = toTaskItem(event, data);
        setTasks((prev) => {
          if (prev.some((t) => t.taskId === started.taskId)) return prev;
          return [started, ...prev].slice(0, 50);
        });
        return;
      }

      if (event === "miniApp.taskFinished" || event === "miniApp.taskFailed") {
        setTasks((prev) => prev.map((t) => {
          if (t.taskId !== data.taskId) return t;
          const next = { ...t, status: event === "miniApp.taskFinished" ? "completed" : "failed", finishedAt: data.finishedAt || Date.now() };
          if (event === "miniApp.taskFailed") {
            next.error = data.error || "生成失败";
            return next;
          }
          try {
            const payload = unwrapWorkflowPayload(data.result);
            next.resultImages = extractImages(payload);
            next.error = "";
          } catch (err) {
            next.resultImages = [];
            next.error = err?.message || "未能解析结果图片";
          }
          return next;
        }));

        // completed 且有图片 → 入库（single source of truth，跨端共享）
        if (event === "miniApp.taskFinished") {
          let payload;
          try {
            payload = unwrapWorkflowPayload(data.result);
            const images = extractImages(payload);
            if (images.length) {
              const meta = data.meta || {};
              persistResult({
                kind: meta.kind,
                resultImages: images,
                prompt: meta.prompt || "",
                model: meta.model,
                aspect: meta.aspect,
                size: meta.size,
                workflowName: meta.workflowName || "",
                sourceImage: meta.sourceImage || null,
                references: Array.isArray(meta.references) ? meta.references : [],
              });
            }
          } catch { /* 无图片则不入库 */ }
        }
        return;
      }
    };

    const off = AS?.onTaskEvent?.(handleEvent);
    return () => {
      mounted = false;
      try { off?.(); } catch { /* noop */ }
    };
  }, [AS, persistResult]);

  const removeTask = React.useCallback((taskId) => {
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  }, []);

  const clearFinished = React.useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === "running"));
  }, []);

  // 等待中的任务数：用于 header tab 角标
  const pendingCount = tasks.filter((t) => t.status === "running").length;

  return { tasks, pendingCount, removeTask, clearFinished, executorId: executorId.current };
}
