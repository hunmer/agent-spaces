// 素材瀑布流 + 上传/删除
// 使用宿主 Masonry 组件展示当前文件夹下的素材缩略图，
// 顶部提供上传（URL / 本地文件）、删除按钮。
import { useEffect, useMemo, useRef, useState } from "react";

const ui = window.AgentSpacesUI;
const Button = ui.Button;
const Input = ui.Input;
const Masonry = ui.Masonry;
const Loader2 = ui.Loader2;
const ImageIcon = ui.Image; // 重命名避免与浏览器原生 Image 冲突
const Upload = ui.Upload;
const Trash2 = ui.Trash2;
const X = ui.X;
const Plus = ui.Plus;
const openMediaGallery = ui.openMediaGallery;
const ContextMenu = ui.ContextMenu;
const ContextMenuTrigger = ui.ContextMenuTrigger;
const ContextMenuContent = ui.ContextMenuContent;
const ContextMenuItem = ui.ContextMenuItem;
const Copy = ui.Copy;
const PanelRight = ui.PanelRight;
const Info = ui.Info;
const Clock = ui.Clock;
const HardDrive = ui.HardDrive;
const Tag = ui.Tag;

const PAGE_SIZE = 60;

export default function ItemGallery({
  folderId,
  folders,
  libraryPath,
  onChange,
}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // 单击选中的素材 id，null = 无选中
  const [infoOpen, setInfoOpen] = useState(true); // 右侧信息栏是否展开

  // 当前选中素材对象
  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedId) || null,
    [items, selectedId]
  );

  // 上传对话框
  const [showUpload, setShowUpload] = useState(false);
  const [uploadMode, setUploadMode] = useState("file"); // file | url
  const [urlValue, setUrlValue] = useState("");
  const fileInputRef = useRef(null);

  const eagle = window.__eagleApi;

  async function loadItems() {
    if (!eagle) return;
    setLoading(true);
    try {
      const res = await eagle.listItems({ folderId, limit: PAGE_SIZE, offset: 0 });
      const data = res?.data || {};
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      alert(e?.message || "加载素材失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  async function handleUploadFile(file) {
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await eagle.addItem({
        base64,
        name: file.name.replace(/\.[^.]+$/, ""),
        folderId,
      });
      await loadItems();
      onChange?.();
      setShowUpload(false);
    } catch (e) {
      alert(e?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadUrl() {
    const url = urlValue.trim();
    if (!url) return;
    setUploading(true);
    try {
      await eagle.addItem({ url, folderId });
      setUrlValue("");
      await loadItems();
      onChange?.();
      setShowUpload(false);
    } catch (e) {
      alert(e?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item) {
    if (!confirm(`删除素材「${item.name || item.id}」？(移入回收站)`)) return;
    try {
      await eagle.removeItem({ id: item.id });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setTotal((t) => Math.max(0, t - 1));
      onChange?.();
    } catch (e) {
      alert(e?.message || "删除失败");
    }
  }

  // 点击缩略图打开图集预览（全量 items，定位到点击项），原图经 local-file 代理
  function openAt(index) {
    const galleryItems = items.map((it) => ({
      src: originalUrl(it, libraryPath),
      thumb: thumbUrl(it, libraryPath),
      type: isVideo(it) ? "video" : "image",
      alt: it.name || "",
    })).filter((m) => m.src);
    if (galleryItems.length) openMediaGallery(galleryItems, index);
  }

  // 复制原图本地绝对路径到剪贴板
  async function copyPath(item) {
    const abs = buildAbsPath(libraryPath, item, "original");
    const text = abs || item.name || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 兜底：老浏览器/无权限
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      ta.remove();
    }
  }

  function handleImageDragStart(e, item) {
    const url = originalUrl(item, libraryPath) || thumbUrl(item, libraryPath);
    if (!url) return;
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-agent-spaces-image", JSON.stringify({
      url,
      name: item.name || "",
      type: "image",
    }));
    e.dataTransfer.setData("text/uri-list", url);
    e.dataTransfer.setData("text/plain", url);
    e.dataTransfer.setData("text/html", `<img src="${escapeHtmlAttr(url)}" alt="${escapeHtmlAttr(item.name || "")}">`);
  }

  return (
    <section className="flex flex-1 flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="text-sm text-muted-foreground">
          共 <span className="text-foreground font-medium">{total}</span> 个素材
        </div>
        <div className="flex items-center gap-2">
          {selectedItem && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setInfoOpen((v) => !v)}
              title={infoOpen ? "收起信息栏" : "展开信息栏"}
            >
              <PanelRight className={`h-4 w-4 ${infoOpen ? "text-primary" : ""}`} />
            </Button>
          )}
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4" />
            上传
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-50" />
            <span className="text-sm">该文件夹暂无素材</span>
          </div>
        ) : (
          <Masonry
            data={items}
            getKey={(it) => it.id}
            getMeta={(it) => ({
              aspect: ratioFromItem(it),
              lazy: true,
            })}
            columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
            gap={12}
            renderItem={(item, index) => {
              const isSelected = item.id === selectedId;
              return (
              <ContextMenu>
                <ContextMenuTrigger className="contents">
                  <div
                    className={`group relative h-full w-full overflow-hidden rounded-lg border-2 bg-muted transition-colors ${
                      isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"
                    }`}
                  >
                    <img
                      src={thumbUrl(item, libraryPath)}
                      alt={item.name || ""}
                      loading="lazy"
                      draggable
                      className="h-full w-full cursor-pointer object-cover"
                      onDragStart={(e) => handleImageDragStart(e, item)}
                      onClick={() => setSelectedId(item.id)}
                      onDoubleClick={() => openAt(index)}
                      onError={(e) => {
                        // 缩略图失败时回退到原图
                        const fb = originalUrl(item, libraryPath);
                        if (fb && e.currentTarget.src !== fb) e.currentTarget.src = fb;
                        else e.currentTarget.style.opacity = 0.1;
                      }}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                      <div className="truncate text-xs text-white">
                        {item.name || "未命名"}
                      </div>
                    </div>
                    <button
                      className="absolute right-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
                      title="删除"
                      onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => copyPath(item)}>
                    <Copy className="h-4 w-4" />
                    复制图片路径
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openAt(index)}>
                    <ImageIcon className="h-4 w-4" />
                    查看图片
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => handleDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              );
            }}
          />
        )}
        </div>

        {/* 右侧信息栏：可折叠，展示当前选中素材的元信息 */}
        {selectedItem && infoOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Info className="h-4 w-4 text-muted-foreground" />
                素材信息
              </span>
              <button
                className="text-muted-foreground hover:text-foreground"
                title="收起"
                onClick={() => setInfoOpen(false)}
              >
                <PanelRight className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3">
              {/* 预览图 */}
              <div className="mb-3 overflow-hidden rounded-lg border border-border bg-muted">
                <img
                  src={originalUrl(selectedItem, libraryPath) || thumbUrl(selectedItem, libraryPath)}
                  alt={selectedItem.name || ""}
                  className="max-h-48 w-full object-contain"
                  onError={(e) => {
                    const t = thumbUrl(selectedItem, libraryPath);
                    if (t && e.currentTarget.src !== t) e.currentTarget.src = t;
                  }}
                />
              </div>

              <InfoRow label="名称" value={selectedItem.name} copyable />

              <div className="mt-1 grid grid-cols-2 gap-2">
                <InfoChip icon={<HardDrive className="h-3 w-3" />} label="尺寸" value={selectedItem.width && selectedItem.height ? `${selectedItem.width}×${selectedItem.height}` : "—"} />
                <InfoChip icon={<HardDrive className="h-3 w-3" />} label="大小" value={formatSize(selectedItem.size)} />
                <InfoChip icon={<Info className="h-3 w-3" />} label="格式" value={(selectedItem.ext || "—").toUpperCase()} />
                <InfoChip icon={<Clock className="h-3 w-3" />} label="添加" value={formatDate(selectedItem.btime)} />
              </div>

              {selectedItem.tags?.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="h-3 w-3" /> 标签
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedItem.tags.map((t, i) => (
                      <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-1 text-xs">
                <InfoRow label="ID" value={selectedItem.id} mono copyable />
                <InfoRow label="路径" value={buildAbsPath(libraryPath, selectedItem, "original")} mono copyable />
              </div>

              {selectedItem.annotation && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-muted-foreground">备注</div>
                  <div className="rounded bg-muted p-2 text-xs text-foreground whitespace-pre-wrap break-words">
                    {selectedItem.annotation}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 上传弹层 */}
      {showUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !uploading && setShowUpload(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-card p-4 shadow-xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                上传素材
              </span>
              <button
                className="text-muted-foreground hover:text-foreground"
                disabled={uploading}
                onClick={() => setShowUpload(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
              {[
                { k: "file", label: "本地文件" },
                { k: "url", label: "图片 URL" },
              ].map((t) => (
                <button
                  key={t.k}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs ${
                    uploadMode === t.k
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setUploadMode(t.k)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {uploadMode === "file" ? (
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-primary/50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  点击选择图片文件
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={urlValue}
                  placeholder="https://..."
                  onChange={(e) => setUrlValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUploadUrl()}
                />
                <Button onClick={handleUploadUrl} disabled={uploading}>
                  添加
                </Button>
              </div>
            )}

            {uploading && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                上传中...
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // data:image/png;base64,xxxx
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Eagle 资源库文件结构：{libraryPath}/images/{itemId}.info/{name}_thumbnail.png
// 原图：{libraryPath}/images/{itemId}.info/{name}.{ext}
// 缺少 libraryPath（尚未拿到 library_info）时回退到 item 自带的 thumbnail/fileSource。
function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const localFileUrl = (absPath) =>
  absPath && window.AgentSpaces?.localFileUrl
    ? window.AgentSpaces.localFileUrl(absPath)
    : "";

function buildAbsPath(libraryPath, item, suffix) {
  if (!libraryPath || !item || !item.id) return "";
  const safeName = (item.name || "").replace(/[\\/:*?"<>|]/g, "_");
  const dir = `${libraryPath}/images/${item.id}.info`;
  if (suffix === "thumb") {
    return `${dir}/${safeName}_thumbnail.png`;
  }
  // 原图用真实扩展名
  const ext = (item.ext || "").replace(/^\./, "");
  return ext ? `${dir}/${safeName}.${ext}` : "";
}

// 缩略图 URL：优先本地路径（经 local-file 代理），否则回退 item 自带字段
function thumbUrl(item, libraryPath) {
  const abs = buildAbsPath(libraryPath, item, "thumb");
  const viaProxy = localFileUrl(abs);
  if (viaProxy) return viaProxy;
  if (item.thumbnail) return item.thumbnail;
  if (item.fileSource) return item.fileSource;
  return "";
}

// 原图 URL（点击放大用）
function originalUrl(item, libraryPath) {
  const abs = buildAbsPath(libraryPath, item, "original");
  const viaProxy = localFileUrl(abs);
  if (viaProxy) return viaProxy;
  if (item.fileSource) return item.fileSource;
  if (item.thumbnail) return item.thumbnail;
  return "";
}

// 优先用 width/height 推导宽高比，否则默认 1:1
function ratioFromItem(item) {
  const w = Number(item.width);
  const h = Number(item.height);
  if (w > 0 && h > 0) {
    const g = gcd(Math.round(w), Math.round(h));
    return `${Math.round(w) / g}:${Math.round(h) / g}`;
  }
  return "1:1";
}

// 是否视频素材（用于 MediaGallery 区分 image/video 类型）
function isVideo(item) {
  const ext = String(item.ext || "").toLowerCase().replace(/^\./, "");
  return ["mp4", "webm", "mov", "avi", "mkv"].includes(ext);
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// 字节数 -> 人类可读
function formatSize(bytes) {
  const n = Number(bytes);
  if (!isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// 时间戳(ms) -> 本地日期
function formatDate(ts) {
  const n = Number(ts);
  if (!isFinite(n) || n <= 0) return "—";
  const d = new Date(n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 信息栏行：标签 + 值，可复制
function InfoRow({ label, value, mono, copyable }) {
  const text = value == null || value === "" ? "—" : String(value);
  async function doCopy(e) {
    e.stopPropagation();
    if (text === "—") return;
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
  }
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={`flex-1 break-all text-xs text-foreground ${mono ? "font-mono" : ""} ${
          copyable && text !== "—" ? "cursor-pointer hover:text-primary" : ""
        }`}
        title={copyable && text !== "—" ? "点击复制" : ""}
        onClick={copyable ? doCopy : undefined}
      >
        {text}
      </span>
    </div>
  );
}

// 信息栏紧凑信息块（带图标）
function InfoChip({ icon, label, value }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}
