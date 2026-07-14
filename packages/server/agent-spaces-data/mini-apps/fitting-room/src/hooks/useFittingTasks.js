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

  // 把单张远程图片下载到 data/output 并生成缩略图到 data/thumbs。
  // 返回 { url, thumbUrl }：优先本地副本，下载/缩略图失败时回退到远程 url。
  const localizeImage = React.useCallback(async (remoteUrl, name) => {
    const baseName = `${name}.jpg`;
    const outPath = `output/${baseName}`;
    const thumbTarget = `thumbs/${baseName}`;
    let url = remoteUrl;
    let thumbUrl = remoteUrl;
    try {
      const dl = await AS.downloadImage(remoteUrl, outPath);
      url = dl.httpUrl;
      // 缩略图优先用已下载的本地源图（source），避免二次下载
      const thumb = await AS.generateThumbnail({ source: outPath, target: thumbTarget, width: 400, quality: 80 });
      thumbUrl = thumb.httpUrl;
    } catch (err) {
      console.warn("[fitting-room] localizeImage failed, fallback to remote", err);
    }
    return { url, thumbUrl };
  }, [AS]);

  // 下载图片到本地 + 生成缩略图 + 入库。返回 localized 图片列表（含本地 url/thumbUrl），
  // 供调用方同步更新 task 卡片显示。失败回退远程 url，不阻断。
  const persistResult = React.useCallback(async (item) => {
    let localized = [];
    try {
      localized = await Promise.all(
        (item.resultImages || []).map((img, i) => localizeImage(img.url, `${item.taskId}-${i}`)),
      );
      const service = item.kind === "hairstyle" ? "add_hairstyle_results" : "add_outfit_results";
      await AS.invokeService(service, {
        items: localized.map((l) => ({ url: l.url, thumbUrl: l.thumbUrl })),
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
    return localized;
  }, [AS, localizeImage]);

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
        let remoteImages = [];
        try {
          const payload = unwrapWorkflowPayload(data.result);
          remoteImages = extractImages(payload);
        } catch { remoteImages = []; }

        // 先用远程 url 占位更新卡片状态（立即可见，不阻塞）
        setTasks((prev) => prev.map((t) => {
          if (t.taskId !== data.taskId) return t;
          const next = { ...t, status: event === "miniApp.taskFinished" ? "completed" : "failed", finishedAt: data.finishedAt || Date.now() };
          if (event === "miniApp.taskFailed") {
            next.error = data.error || "生成失败";
            return next;
          }
          next.resultImages = remoteImages;
          next.error = remoteImages.length ? "" : "未能解析结果图片";
          return next;
        }));

        // completed 且有图片 → 下载本地副本 + 缩略图 + 入库，再用本地 url 更新卡片
        if (event === "miniApp.taskFinished" && remoteImages.length) {
          const meta = data.meta || {};
          persistResult({
            taskId: data.taskId,
            kind: meta.kind,
            resultImages: remoteImages,
            prompt: meta.prompt || "",
            model: meta.model,
            aspect: meta.aspect,
            size: meta.size,
            workflowName: meta.workflowName || "",
            sourceImage: meta.sourceImage || null,
            references: Array.isArray(meta.references) ? meta.references : [],
          }).then((localized) => {
            if (localized && localized.length) {
              setTasks((prev) => prev.map((t) => t.taskId === data.taskId
                ? { ...t, resultImages: localized.map((l) => ({ url: l.url, thumbUrl: l.thumbUrl })) }
                : t));
            }
          });
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
