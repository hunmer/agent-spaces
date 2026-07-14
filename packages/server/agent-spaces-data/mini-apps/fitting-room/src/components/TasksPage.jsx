import Style from "./Style";

const {
  Badge,
  Button,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  ListChecks,
  ImageOff,
  ExternalLink,
} = window.AgentSpacesUI;

const KIND_LABEL = { hairstyle: "发型", outfit: "服装" };
const STATUS_LABEL = { running: "生成中", completed: "已完成", failed: "失败" };

function fmtTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return "";
  }
}

// 任务队列页面：展示所有 fitting 任务（running/completed/failed）。
// 由 useFittingTasks hook 提供数据，任务状态由后端 miniApp.* 事件驱动，跨端同步。
export default function TasksPage({ tasks, executorId, onRemove, onClearFinished }) {
  const running = tasks.filter((t) => t.status === "running");
  const finished = tasks.filter((t) => t.status !== "running");

  return (
    <div className="fr-grid-1">
      <Style />

      <div className="fr-history-head">
        <div className="fr-panel-title">
          <ListChecks className="fr-icon" />
          <span>任务列表</span>
          <Badge variant="secondary">{tasks.length}</Badge>
          {running.length > 0 && (
            <Badge variant="default" className="fr-task-badge-running">
              <Loader2 className="fr-icon fr-spin" />{running.length} 个进行中
            </Badge>
          )}
        </div>
        {finished.length > 0 && (
          <Button variant="outline" size="sm" onClick={onClearFinished}>
            <Trash2 className="fr-icon" />清除已完成
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="fr-empty">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <ImageOff className="fr-empty-icon" />
            <div>暂无任务</div>
            <div className="fr-caption">在发型库 / 服装库点击生成，任务会出现在这里</div>
          </div>
        </div>
      ) : (
        <div className="fr-task-list">
          {running.map((t) => (
            <TaskCard key={t.taskId} task={t} executorId={executorId} onRemove={onRemove} />
          ))}
          {finished.map((t) => (
            <TaskCard key={t.taskId} task={t} executorId={executorId} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, executorId, onRemove }) {
  const isMine = task.executorId && task.executorId === executorId;
  return (
    <article className={`fr-task-card is-${task.status}`}>
      <div className="fr-task-card-head">
        <div className="fr-task-card-title">
          {task.status === "running" && <Loader2 className="fr-icon fr-spin" />}
          {task.status === "completed" && <CheckCircle2 className="fr-icon fr-task-ok" />}
          {task.status === "failed" && <XCircle className="fr-icon fr-task-err" />}
          <span>{task.label}</span>
          <Badge variant="outline">{KIND_LABEL[task.kind] || task.kind}</Badge>
          {isMine && <Badge variant="secondary">本机</Badge>}
        </div>
        <div className="fr-task-card-meta">
          <span>{STATUS_LABEL[task.status]}</span>
          <span>·</span>
          <span>{fmtTime(task.startedAt)}</span>
          {task.finishedAt && (<><span>·</span><span>用时 {Math.max(1, Math.round((task.finishedAt - task.startedAt) / 1000))}s</span></>)}
          {task.status !== "running" && (
            <Button size="sm" variant="ghost" className="fr-task-del" onClick={() => onRemove(task.taskId)} title="移除">
              <Trash2 className="fr-icon" />
            </Button>
          )}
        </div>
      </div>

      {task.sourceImage && (
        <div className="fr-task-source">
          <img src={task.sourceImage} alt="形象图" />
          {(task.references || []).slice(0, 4).map((r, i) => (
            <img key={i} src={r.url} alt={`参考${i + 1}`} />
          ))}
        </div>
      )}

      {task.prompt && (
        <p className="fr-caption fr-task-prompt">{task.prompt}</p>
      )}

      {task.status === "failed" && task.error && (
        <div className="fr-task-error">{task.error}</div>
      )}

      {task.status === "completed" && task.resultImages.length > 0 && (
        <div className="fr-task-results">
          {task.resultImages.map((img, i) => (
            <a key={i} className="fr-task-result" href={img.url} target="_blank" rel="noreferrer" title="点击查看大图">
              <img src={img.thumbUrl || img.url} alt={`结果${i + 1}`} />
              <ExternalLink className="fr-task-result-open" />
            </a>
          ))}
        </div>
      )}

      {task.status === "completed" && task.resultImages.length === 0 && !task.error && (
        <div className="fr-caption">未返回图片（结果已同步到对应历史库，或工作流无图片输出）</div>
      )}
    </article>
  );
}
