import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderPlus, ImageOff, Loader2, Plus, Trash2, openMediaGallery, Popover, PopoverContent, PopoverTrigger } from '@agent-spaces/ui';

// 图片加载失败占位：onError 时切换为该块，显示破损图标 + url
function BrokenImagePlaceholder({ url }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/30 p-1 text-muted-foreground">
      <ImageOff className="h-4 w-4 opacity-50" />
      <span className="max-w-full truncate text-[9px]" title={url}>加载失败</span>
    </div>
  );
}

/**
 * 节点内的图片网格结果展示，点击用 MediaGallery 打开大图（可翻页）。
 * @param {{ images: string[], max?: number, preview?: boolean, onImageLoad?: Function, onAddToAssets?: (payload:string|{url,fileName?}|Array<string|{url,fileName?}>)=>void, fileName?: string, onAddImages?:(urls:string[])=>void, onRemoveImage?:(index:number)=>void, onClearImages?:()=>void, versions?:Array, activeVersion?:number, onSwitchVersion?:(index:number)=>void }} props
 * @param {number} [props.max] 单网格最多展示张数，0 或缺省表示全部（GIF 拆帧等可能产出数十帧）
 * @param {boolean} [props.preview] 输出预览模式：无标签/边框，图片全宽纵向排列
 * @param {Function} [props.onImageLoad] 图片加载完成回调
 * @param {Function} [props.onAddToAssets] 传入则每张图右上角显示「添加到素材库」按钮，点击回传 {url, fileName}
 * @param {string} [props.fileName] 该批产出的下载/入库文件名（多张时自动加序号后缀），传给 MediaGallery 的 download 字段
 * @param {Function} [props.onAddImages] 传入则标题右侧显示「添加」按钮（Popover 内上传），上传成功后回传新增 url 数组
 * @param {Function} [props.onRemoveImage] 传入则每张图右下角显示删除按钮，点击回传被删图索引
 * @param {Function} [props.onClearImages] 传入则标题右侧显示「清空」按钮，点击清空所有产出
 * @param {Array} [props.versions] 历史版本数组 [{params, output, createdAt}]
 * @param {number} [props.activeVersion] 当前选中的版本索引
 * @param {Function} [props.onSwitchVersion] 版本切换回调，回传版本索引
 */
export default function ImageResult({ images, max = 0, preview = false, onImageLoad, onAddToAssets, fileName, onAddImages, onRemoveImage, onClearImages, versions, activeVersion, onSwitchVersion }) {
  const all = images || [];
  const list = max > 0 ? all.slice(0, max) : all;
  const hasVersions = Array.isArray(versions) && versions.length > 1 && onSwitchVersion;
  if (!list.length && !onAddImages && !hasVersions) return null;

  // 多张图且设了 fileName 时，自动补 _2/_3 序号（第一张不加序号），保持下载名唯一可读。
  const nameFor = (i) => {
    if (!fileName) return undefined;
    const dot = fileName.lastIndexOf('.');
    if (i === 0) return fileName;
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    return `${base}_${i + 1}${ext}`;
  };

  // gallery 列表：包含所有历史版本的产出图（按版本顺序合并），点击当前版本第 i 张时
  // 定位到 gallery 里的全局索引（当前版本之前所有版本的图数之和 + i）。
  // 无 versions 或仅一个版本时退化为当前 list，行为与旧版一致。
  const galleryItems = (() => {
    if (!Array.isArray(versions) || versions.length === 0) {
      return list.map((src, i) => ({ src, type: 'image', fileName: nameFor(i) }));
    }
    return versions
      .filter((v) => Array.isArray(v?.output?.images))
      .flatMap((v) => v.output.images.map((src) => ({ src, type: 'image' })));
  })();
  // 当前版本首图在 gallery 里的偏移（之前的版本图数之和）
  const galleryOffset = (() => {
    if (!Array.isArray(versions) || versions.length === 0) return 0;
    const active = typeof activeVersion === 'number' ? activeVersion : versions.length - 1;
    let offset = 0;
    for (let i = 0; i < active && i < versions.length; i++) {
      const imgs = versions[i]?.output?.images;
      if (Array.isArray(imgs)) offset += imgs.length;
    }
    return offset;
  })();

  const open = (index) => {
    openMediaGallery(galleryItems.length ? galleryItems : list.map((src, i) => ({ src, type: 'image', fileName: nameFor(i) })), galleryOffset + index);
  };

  if (preview) {
    return (
      <div className="flex w-full flex-col gap-2">
        {list.map((url, i) => (
          <PreviewImage key={i} url={url} onOpen={() => open(i)} onImageLoad={onImageLoad} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">产出（{all.length}）</span>
        <div className="flex items-center gap-1">
          {/* 添加：Popover 内嵌上传，复用 window.AgentSpaces.uploadFile，上传成功回传新 url 数组 */}
          {onAddImages && <AddImagesButton onAddImages={onAddImages} />}
          {/* 清空：仅在有产出时显示 */}
          {onClearImages && all.length > 0 && (
            <button
              type="button"
              title="清空产出"
              onClick={(e) => { e.stopPropagation(); onClearImages(); }}
              className="flex items-center gap-0.5 rounded p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* 历史版本标记：横向数字列表，点击切换 params/output/status 到对应版本快照。
          仅在多于 1 个版本且注入了 onSwitchVersion 时显示。当前版本高亮。 */}
      {hasVersions && (
        <div className="nodrag nopan nowheel flex items-center gap-1 overflow-x-auto scrollbar-none">
          <span className="shrink-0 text-[10px] text-muted-foreground">历史</span>
          {versions.map((v, i) => (
            <button
              key={i}
              type="button"
              title={v?.createdAt ? new Date(v.createdAt).toLocaleString() : `版本 ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); onSwitchVersion(i); }}
              className={
                'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition ' +
                (i === activeVersion
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary')
              }
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {list.map((url, i) => (
            <div key={i} className="group relative block aspect-square overflow-visible rounded border border-border">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); open(i); }}
                className="block h-full w-full overflow-hidden rounded"
              >
                <GridImage url={url} />
              </button>
              {onAddToAssets && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAddToAssets({ url, fileName: nameFor(i) }); }}
                  title="添加到素材库"
                  className="absolute -right-1 -top-1 z-20 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition hover:bg-primary hover:text-primary-foreground group-hover:opacity-100"
                >
                  <FolderPlus className="h-3 w-3" />
                </button>
              )}
              {/* 单图删除：右下角，hover 图片时显示；onRemoveImage 注入时才显示 */}
              {onRemoveImage && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveImage(i); }}
                  title="从产出删除"
                  className="absolute -bottom-1 -right-1 z-20 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 图片加载中占位：spinner + 高度撑开，避免切换时空白跳动
 */
function ImageLoadingPlaceholder() {
  return (
    <div className="flex min-h-[120px] w-full items-center justify-center bg-muted/20">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * 预览态单图：加载中显示 spinner 占位，加载完毕才展示；失败切换占位块（点击仍可尝试打开 gallery）。
 */
function PreviewImage({ url, onOpen, onImageLoad }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // url 变化（版本切换）时重置状态：重新进入 loading，允许重新加载新图
  useEffect(() => { setFailed(false); setLoaded(false); }, [url]);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="block w-full overflow-hidden"
    >
      {failed ? (
        <BrokenImagePlaceholder url={url} />
      ) : (
        <>
          {!loaded && <ImageLoadingPlaceholder />}
          <img
            src={url}
            alt=""
            className={`block h-auto w-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'absolute opacity-0'}`}
            onLoad={(e) => { setLoaded(true); onImageLoad?.(e); }}
            onError={() => setFailed(true)}
          />
        </>
      )}
    </button>
  );
}

/**
 * 网格态单图：加载中显示 spinner 占位，加载完毕才展示；失败切换占位块（点击仍可尝试打开 gallery）。
 */
function GridImage({ url }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [url]);
  if (failed) return <BrokenImagePlaceholder url={url} />;
  return (
    <div className="relative h-full w-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={url}
        alt=""
        className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * 「添加图片」按钮：Popover 弹出拖拽/点击上传区，上传成功后回传新增 url 数组。
 * 复用 window.AgentSpaces.uploadFile，与节点内 FileUpload.jsx 行为一致（http URL）。
 */
function AddImagesButton({ onAddImages }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const uploadOne = useCallback(async (file) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) throw new Error('上传能力不可用');
    const uploaded = await AS.uploadFile(file);
    const httpUrl = uploaded?.url || uploaded?.httpPath;
    if (!httpUrl) throw new Error('上传未返回 URL');
    return httpUrl;
  }, []);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/'));
    if (!files.length) return;
    setError('');
    setUploading(true);
    try {
      const ok = [];
      const failed = [];
      for (const f of files) {
        try {
          ok.push(await uploadOne(f));
        } catch (e) {
          console.error('uploadOne failed:', e);
          failed.push(f.name);
        }
      }
      if (ok.length) onAddImages?.(ok);
      if (failed.length) setError(`上传失败 ${failed.length} 张：${failed.join(', ')}`);
      else if (ok.length) setOpen(false); // 全部成功后关闭 popover
    } finally {
      setUploading(false);
    }
  }, [onAddImages, uploadOne]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="添加图片"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 rounded p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
      />
      <PopoverContent
        className="w-64 p-2"
        // 阻止 popover 内交互冒泡到画布（避免触发节点拖拽/平移）
        onClick={(e) => e.stopPropagation()}
        onWheelCapture={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          disabled={uploading}
          className="flex min-h-[72px] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-3 text-xs text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>上传中…</span>
            </>
          ) : (
            <>
              <Plus className="h-5 w-5" />
              <span>点击或拖拽图片到此处</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
