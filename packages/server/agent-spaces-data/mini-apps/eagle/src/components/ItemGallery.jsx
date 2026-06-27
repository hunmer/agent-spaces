// 素材瀑布流 + 上传/删除
// 使用宿主 Masonry 组件展示当前文件夹下的素材缩略图，
// 顶部提供上传（URL / 本地文件）、删除按钮。
import { useEffect, useRef, useState } from "react";

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

const PAGE_SIZE = 60;

export default function ItemGallery({
  folderId,
  folders,
  onChange,
}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  return (
    <section className="flex flex-1 flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="text-sm text-muted-foreground">
          共 <span className="text-foreground font-medium">{total}</span> 个素材
        </div>
        <Button size="sm" onClick={() => setShowUpload(true)}>
          <Upload className="h-4 w-4" />
          上传
        </Button>
      </div>

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
            renderItem={(item) => (
              <div className="group relative h-full w-full overflow-hidden rounded-lg border border-border bg-muted">
                <img
                  src={thumbUrl(item)}
                  alt={item.name || ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.opacity = 0.1;
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
                  onClick={() => handleDelete(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          />
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

// Eagle item 取缩略图：优先 thumbnail（含完整路径），否则用 fileSource
function thumbUrl(item) {
  if (item.thumbnail) return item.thumbnail;
  if (item.fileSource) return item.fileSource;
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

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
