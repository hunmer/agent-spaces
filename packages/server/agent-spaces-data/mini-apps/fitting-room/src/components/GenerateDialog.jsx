import { resolveUploadItem, persistableFiles, runImageToImage } from "../utils/helpers";

const {
  Button,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FileUpload,
  Loader2,
  X,
  Check,
  ImagePlus,
  Sparkles,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} = window.AgentSpacesUI;

const PROFILE_PATH = "profile.json";
const HAIRSTYLE_DEFAULT_PROMPT = "只迁移发型，不修改脸部特征与服饰";

// dialog props:
//   open, onClose
//   kind: "hairstyle" | "outfit"
//   workflowId, workflowName
export default function GenerateDialog({ open, onClose, kind, workflowId, workflowName }) {
  const AS = window.AgentSpaces;
  const [profile, setProfile] = React.useState({ photos: [], outfits: [] });
  const [tab, setTab] = React.useState("library"); // library | upload
  const [selectedSource, setSelectedSource] = React.useState(null); // {url,path,name}
  const [uploadedSource, setUploadedSource] = React.useState([]);
  const [references, setReferences] = React.useState([]);
  const [selectedOutfitUrls, setSelectedOutfitUrls] = React.useState([]);
  const [prompt, setPrompt] = React.useState(kind === "hairstyle" ? HAIRSTYLE_DEFAULT_PROMPT : "");
  const [model, setModel] = React.useState("gpt-image-2");
  const [aspect, setAspect] = React.useState("1:1");
  const [size, setSize] = React.useState("1k");
  const [uploadingSource, setUploadingSource] = React.useState(false);
  const [uploadingRefs, setUploadingRefs] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    const initial = AS.getConfig?.(PROFILE_PATH);
    if (initial && typeof initial === "object") {
      setProfile({ ...initial, photos: initial.photos || [], outfits: initial.outfits || [] });
    }
    const off = AS.onConfigChanged?.((path, value) => {
      if (path === PROFILE_PATH && value && typeof value === "object") {
        setProfile({ ...value, photos: value.photos || [], outfits: value.outfits || [] });
      }
    });
    return () => off?.();
  }, [open]);

  // 打开时重置
  React.useEffect(() => {
    if (!open) return;
    setSelectedSource(null);
    setUploadedSource([]);
    setReferences([]);
    setSelectedOutfitUrls([]);
    setPrompt(kind === "hairstyle" ? HAIRSTYLE_DEFAULT_PROMPT : "");
    setError("");
    setStatus("");
    setTab("library");
  }, [open]);

  const photoList = (profile.photos || []).map((p) => ({
    id: p.url || p.path || Math.random(),
    url: p.url,
    path: p.path,
    name: p.name || "photo",
  }));
  const outfitList = (profile.outfits || []).map((p) => ({
    id: p.url || p.path || Math.random(),
    url: p.url,
    path: p.path,
    name: p.name || "outfit",
  }));

  const currentSource = tab === "library" ? selectedSource : (() => {
    const f = uploadedSource[0]?.file || uploadedSource[0];
    const url = f?.uploadedHttpPath || f?.uploadedUrl || f?.httpPath || f?.url;
    return url ? { url, path: f?.uploadedPath || f?.path || url, name: f?.name || "upload" } : null;
  })();

  const canGenerate = !!currentSource && !uploadingSource && !uploadingRefs && !running;

  const toggleOutfit = (url) => {
    setSelectedOutfitUrls((current) => current.includes(url)
      ? current.filter((item) => item !== url)
      : [...current, url]);
  };

  const onUploadedSourceChange = async (files) => {
    setUploadedSource(files.slice(-1));
    Promise.all((files || []).map(resolveUploadItem))
      .then(() => setUploadedSource((prev) => persistableFiles(prev).slice(-1)))
      .catch(() => {});
  };

  const onReferencesChange = (files) => {
    setReferences(files);
    Promise.all((files || []).map(resolveUploadItem))
      .then(() => setReferences((prev) => persistableFiles(prev)))
      .catch(() => {});
  };

  const generate = async () => {
    setError("");
    setStatus("");
    if (!currentSource?.url) {
      setError("请先选择或上传一张形象图");
      return;
    }
    if (!workflowId) {
      setError("请先在历史区右上角选择图生图工作流");
      return;
    }
    setRunning(true);
    setStatus("正在上传图片...");
    try {
      const sourceResolved = await resolveUploadItem(
        tab === "library"
          ? { file: { uploadedHttpPath: currentSource.url, uploadedPath: currentSource.path, name: currentSource.name } }
          : uploadedSource[0],
      );
      const selectedOutfits = outfitList.filter((item) => selectedOutfitUrls.includes(item.url));
      const refResolved = await Promise.all([...selectedOutfits, ...references].map(resolveUploadItem));

      setStatus("正在执行工作流...");
      const images = await runImageToImage({
        AS,
        workflowId,
        sourceImage: sourceResolved,
        references: refResolved,
        prompt: prompt.trim(),
        model,
        aspect,
        size,
        taskIdPrefix: `fitting-${kind}`,
        label: kind === "hairstyle" ? "发型生成" : "服装生成",
      });

      const service = kind === "hairstyle" ? "add_hairstyle_results" : "add_outfit_results";
      await AS.invokeService(service, {
        items: images,
        prompt: prompt.trim(),
        model,
        aspect,
        size,
        workflowId,
        workflowName,
        sourceImage: sourceResolved.url,
        references: refResolved.map((r) => ({ url: r.url, path: r.path, name: r.name })),
      });

      setStatus(`已生成 ${images.length} 张图片`);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err?.message || String(err));
      setStatus("");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kind === "hairstyle" ? "💇 生成发型效果图" : "👕 生成服装效果图"}
          </DialogTitle>
        </DialogHeader>

        <div className="fr-dialog-tabs">
          <button
            className={`fr-dialog-tab${tab === "library" ? " is-active" : ""}`}
            onClick={() => setTab("library")}
            type="button"
          >
            从我的形象选择
          </button>
          <button
            className={`fr-dialog-tab${tab === "upload" ? " is-active" : ""}`}
            onClick={() => setTab("upload")}
            type="button"
          >
            上传新图片
          </button>
        </div>

        {tab === "library" ? (
          <div className="fr-field">
            <Label>选择形象图（{photoList.length} 张可选）</Label>
            {photoList.length === 0 ? (
              <div className="fr-empty" style={{ minHeight: 120 }}>
                还没有形象照片，请先到"我的形象"上传
              </div>
            ) : (
              <div className="fr-source-grid">
                {photoList.map((p) => (
                  <div
                    key={p.id}
                    className={`fr-source-item${selectedSource?.url === p.url ? " is-selected" : ""}`}
                    onClick={() => setSelectedSource(p)}
                    title="点击选择"
                  >
                    <img src={p.url} alt={p.name} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="fr-field">
            <Label>上传形象图（1 张）</Label>
            <FileUpload
              value={uploadedSource}
              onChange={onUploadedSourceChange}
              onUploadStatusChange={(s) => setUploadingSource(!!s?.uploading)}
              autoUpload
              accept="image/*"
              maxFiles={1}
              placeholder="拖拽或点击上传 1 张形象图"
            />
          </div>
        )}

        <div className="fr-divider" />

        <div className="fr-field">
          <Label>参考图（发型样式 / 服装款式，可多张）</Label>
          {kind === "outfit" && outfitList.length > 0 && (
            <>
              <div className="fr-caption" style={{ margin: "8px 0" }}>
                从我的形象快速选择服装（已选 {selectedOutfitUrls.length} 张）
              </div>
              <div className="fr-source-grid" style={{ maxHeight: 220, marginBottom: 12 }}>
                {outfitList.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`fr-source-item${selectedOutfitUrls.includes(item.url) ? " is-selected" : ""}`}
                    onClick={() => toggleOutfit(item.url)}
                    aria-pressed={selectedOutfitUrls.includes(item.url)}
                    title="点击选择"
                  >
                    <img src={item.url} alt={item.name} />
                  </button>
                ))}
              </div>
            </>
          )}
          <FileUpload
            value={references}
            onChange={onReferencesChange}
            onUploadStatusChange={(s) => setUploadingRefs(!!s?.uploading)}
            autoUpload
            accept="image/*"
            maxFiles={6}
            placeholder="拖拽参考图到此处，或点击选择"
          />
        </div>

        <div className="fr-field">
          <Label>描述（可选）</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={kind === "hairstyle" ? HAIRSTYLE_DEFAULT_PROMPT : "例如：保留脸部特征，换上参考图中的服装"}
            rows={3}
          />
        </div>

        <div className="fr-field">
          <Label>模型</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-image-2">gpt-image-2</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="fr-field-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="fr-field" style={{ margin: 0 }}>
            <Label>画面比例</Label>
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["16:9", "9:16", "1:1", "4:3", "3:4"].map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="fr-field" style={{ margin: 0 }}>
            <Label>分辨率</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["1k", "2k", "4k"].map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <div className="fr-error"><X className="fr-icon" />{error}</div>}
        {status && <div className="fr-status"><Check className="fr-icon" />{status}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            取消
          </Button>
          <Button onClick={generate} disabled={!canGenerate}>
            {running ? <Loader2 className="fr-icon fr-spin" /> : <Sparkles className="fr-icon" />}
            {running ? "生成中..." : "生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
