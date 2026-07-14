import Style from "./Style";
import GenerateDialog from "./GenerateDialog";
import { normalizeWorkflow } from "../utils/helpers";

const {
  Button,
  Badge,
  Trash2,
  Loader2,
  History,
  Workflow,
  Sparkles,
  WorkflowListDialog,
  ImageOff,
} = window.AgentSpacesUI;

// kind: "hairstyle" | "outfit"
// onSubmitTask: (taskId) => void  提交生成后回调（父组件用于跳转到任务列表）
export default function GalleryPage({ kind, onSubmitTask }) {
  const AS = window.AgentSpaces;
  const isHair = kind === "hairstyle";
  const HISTORY_PATH = isHair ? "hairstyle-history.json" : "outfit-history.json";
  const CONFIG_PATH = "shared-config.json";

  const defaultConfig = {
    hairstyleWorkflowId: "",
    hairstyleWorkflowName: "",
    outfitWorkflowId: "",
    outfitWorkflowName: "",
  };

  const [history, setHistory] = React.useState([]);
  const [config, setConfig] = React.useState(defaultConfig);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  const [workflows, setWorkflows] = React.useState([]);
  const [workflowLoading, setWorkflowLoading] = React.useState(false);

  const workflowId = isHair ? config.hairstyleWorkflowId : config.outfitWorkflowId;
  const workflowName = isHair ? config.hairstyleWorkflowName : config.outfitWorkflowName;

  React.useEffect(() => {
    const initialHistory = AS.getConfig?.(HISTORY_PATH);
    if (Array.isArray(initialHistory)) setHistory(initialHistory);
    const initialConfig = AS.getConfig?.(CONFIG_PATH);
    if (initialConfig && typeof initialConfig === "object") {
      setConfig({ ...defaultConfig, ...initialConfig });
    }
    const off = AS.onConfigChanged?.((path, value) => {
      if (path === HISTORY_PATH) setHistory(Array.isArray(value) ? value : []);
      if (path === CONFIG_PATH && value && typeof value === "object") {
        setConfig({ ...defaultConfig, ...value });
      }
    });
    return () => off?.();
  }, []);

  const openWorkflowDialog = async () => {
    setWorkflowOpen(true);
    setWorkflowLoading(true);
    try {
      const resp = await AS.callPluginTool("@agent-spaces/builtin", "list_workflows", { page_size: 50 });
      const list = resp?.data?.workflows || resp?.result?.data?.workflows || resp?.result?.workflows || resp?.workflows || [];
      setWorkflows(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("list_workflows failed", err);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const selectWorkflow = async (workflow) => {
    const next = {
      hairstyleWorkflowId: isHair ? (workflow.workflow_id || workflow.id) : config.hairstyleWorkflowId,
      hairstyleWorkflowName: isHair ? (workflow.title || workflow.name || "未命名工作流") : config.hairstyleWorkflowName,
      outfitWorkflowId: !isHair ? (workflow.workflow_id || workflow.id) : config.outfitWorkflowId,
      outfitWorkflowName: !isHair ? (workflow.title || workflow.name || "未命名工作流") : config.outfitWorkflowName,
    };
    setConfig(next);
    setWorkflowOpen(false);
    await AS.invokeService("save_shared_config", next);
  };

  const removeResult = (id) => {
    AS.invokeService(isHair ? "remove_hairstyle_result" : "remove_outfit_result", { id });
  };
  const clearAll = () => {
    if (!window.confirm(isHair ? "确定清空发型历史？" : "确定清空服装历史？")) return;
    AS.invokeService(isHair ? "clear_hairstyle_results" : "clear_outfit_results");
  };

  return (
    <div className="fr-grid-1">
      <Style />

      <div className="fr-history-head">
        <div className="fr-panel-title">
          <History className="fr-icon" />
          <span>{isHair ? "发型历史" : "服装历史"}</span>
          <Badge variant="secondary">{history.length}</Badge>
        </div>
        <div className="fr-history-actions">
          <Button variant="outline" size="sm" onClick={openWorkflowDialog}>
            <Workflow className="fr-icon" />
            <span>{workflowName || workflowId || "选择图生图工作流"}</span>
          </Button>
          {history.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Trash2 className="fr-icon" />清空
            </Button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="fr-empty">
          <div className="fr-empty-stack" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <ImageOff className="fr-empty-icon" />
            <div>{isHair ? "还没有发型效果图" : "还没有服装效果图"}</div>
            <div className="fr-caption">点击右下角按钮，选择形象图 + 参考图开始生成</div>
          </div>
        </div>
      ) : (
        <div className="fr-gallery">
          {history.map((item) => (
            <article className="fr-card" key={item.id}>
              <img src={item.thumbUrl || item.url} alt={item.prompt || "result"} onClick={() => window.open(item.url, "_blank")} />
              <div className="fr-card-body">
                <div className="fr-card-meta">
                  <Badge>{item.model || "gpt-image-2"}</Badge>
                  <span>{item.createdAt}</span>
                </div>
                {item.prompt && (
                  <p className="fr-caption" style={{ margin: 0, WebkitLineClamp: 2, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.prompt}
                  </p>
                )}
                <div className="fr-card-actions">
                  <Button size="sm" variant="outline" onClick={() => window.open(item.url, "_blank")}>打开</Button>
                  <Button size="sm" variant="ghost" onClick={() => removeResult(item.id)} title="删除">
                    <Trash2 className="fr-icon" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <button
        className="fr-fab"
        onClick={() => {
          if (!workflowId) {
            window.alert("请先选择图生图工作流");
            openWorkflowDialog();
            return;
          }
          setDialogOpen(true);
        }}
      >
        <Sparkles className="fr-icon" />
        {isHair ? "生成发型" : "生成服装"}
      </button>

      <GenerateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        kind={kind}
        workflowId={workflowId}
        workflowName={workflowName}
        onSubmit={onSubmitTask}
      />

      <WorkflowListDialog
        open={workflowOpen}
        workflows={workflows.map(normalizeWorkflow)}
        onSelect={selectWorkflow}
        onCreate={() => window.open("/workflows", "_blank")}
        onClose={() => setWorkflowOpen(false)}
      />
      {workflowOpen && workflowLoading && (
        <div style={{
          position: "fixed", right: 18, bottom: 18, zIndex: 80,
          background: "#18181b", color: "#fff", borderRadius: 7, padding: "8px 12px", fontSize: 13,
        }}>
          工作流加载中...
        </div>
      )}
    </div>
  );
}
