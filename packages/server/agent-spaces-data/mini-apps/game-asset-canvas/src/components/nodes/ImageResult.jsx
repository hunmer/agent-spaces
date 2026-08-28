import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Badge, Check, ChevronDown, debugCanvasImageDrag, FolderPlus, ImageOff, Layers, Loader2, Plus, Trash2, Popover, PopoverContent, PopoverTrigger, setCanvasImageDragData } from '@agent-spaces/ui';
import { IMAGE_REORDER_MIME } from '../../utils/canvas-constants';
import { ImageSelectionContext } from '../../context/ImageSelectionContext';
import { useCanvasGallery } from '../../utils/canvas-gallery';
import { createOutputAssetItems, groupOutputAssetItems } from '../../utils/output-resources';
import ImageHoverCard from '../ImageHoverCard';

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
 * @param {{ images: string[], resources?: Array<{id?:string,url:string,thumb?:string,groupName?:string,label?:string}>, max?: number, preview?: boolean, onImageLoad?: Function, onAddToAssets?: (payload:string|{url,fileName?}|Array<string|{url,fileName?}>)=>void, fileName?: string, onAddImages?:(urls:string[])=>void, onRemoveImage?:(ids:string|string[])=>void, onClearImages?:()=>void, versions?:Array, activeVersion?:number, onSwitchVersion?:(index:number)=>void }} props
 * @param {number} [props.max] 单网格最多展示张数，0 或缺省表示全部（GIF 拆帧等可能产出数十帧）
 * @param {boolean} [props.preview] 输出预览模式：无标签/边框，图片全宽纵向排列
 * @param {Function} [props.onImageLoad] 图片加载完成回调
 * @param {Function} [props.onAddToAssets] 传入则：①缩略图底部操作栏显示「添加到素材库」按钮（单张，回传 {url, fileName}）；②标题栏显示「添加当前产出」按钮（当前版本全部图，回传数组）；③版本数>1 时标题栏额外显示「添加所有产出」按钮（所有历史版本图，回传数组）
 * @param {string} [props.fileName] 该批产出的下载/入库文件名（多张时自动加序号后缀），传给 MediaGallery 的 download 字段
 * @param {Function} [props.onAddImages] 传入则标题右侧显示「添加」按钮（Popover 内上传），上传成功后回传新增 url 数组
 * @param {Function} [props.onRemoveImage] 传入则显示单图删除和清空当前组按钮，回传被删图 ID 或 ID 数组
 * @param {Function} [props.onClearImages] 传入则标题右侧显示「清空」按钮，点击清空所有产出
 * @param {Function} [props.onReorderImages] 传入则产出网格支持拖拽排序，回传重排后的 url 与 resource 数组
 * @param {Array} [props.versions] 历史版本数组 [{params, output, createdAt}]
 * @param {number} [props.activeVersion] 当前选中的版本索引
 * @param {Function} [props.onSwitchVersion] 版本切换回调，回传版本索引
 */
export default function ImageResult({ nodeId, images, resources = [], max = 0, preview = false, onImageLoad, onAddToAssets, fileName, onAddImages, onRemoveImage, onClearImages, onReorderImages, versions, activeVersion, onSwitchVersion }) {
  const openCanvasGallery = useCanvasGallery();
  const all = images || [];
  // 产出/历史分组切换只改变展示快照，不能调用父级写回当前节点数据。
  const [displayVersion, setDisplayVersion] = useState(null);
  useEffect(() => { setDisplayVersion(null); }, [versions]);
  const displaySnapshot = Number.isInteger(displayVersion)
    && Array.isArray(versions) && versions[displayVersion]?.output
    ? versions[displayVersion].output
    : null;
  const displayImages = Array.isArray(displaySnapshot?.images) ? displaySnapshot.images : all;
  const displayResources = Array.isArray(displaySnapshot?.resources)
    ? displaySnapshot.resources
    : resources;
  const isHistoricalView = !!displaySnapshot;
  const assetItems = useMemo(
    () => createOutputAssetItems(displayImages, displayResources),
    [displayImages, displayResources],
  );
  const list = max > 0 ? assetItems.slice(0, max) : assetItems;
  const sections = useMemo(() => groupOutputAssetItems(list), [list]);
  const hasVersions = Array.isArray(versions) && versions.length > 1 && onSwitchVersion;
  const resourceByUrl = new Map(resources.map((item) => [item?.url, item]));
  const resourceFor = (url, index) => assetItems[index]?.url === url
    ? assetItems[index].resource
    : (resourceByUrl.get(url) || { url, thumb: url });
  // 跨节点图片选中状态：checkbox 点击增删切换，ctrl+点击图片本体增删切换（跨节点累加）
  const { isSelected, toggle, selectedUrls } = useContext(ImageSelectionContext);

  // 拖拽排序（原生 HTML5 DnD，参考 UpstreamImageList）：仅在非预览态 + 注入 onReorderImages + 多图时启用。
  // draggingRef 用 ref 保证 dragstart→dragover 间同步读取（state 异步会读到 null）。
  const sortable = !preview && !isHistoricalView && typeof onReorderImages === 'function' && assetItems.length > 1;
  const draggingRef = useRef(null);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  if (!list.length && !onAddImages && !hasVersions) return null;
  const reorderMove = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= assetItems.length || to >= assetItems.length) return;
    // list 可能是 max/展示筛选后的子集；排序写回必须基于完整数据源，不能丢掉未展示分组。
    const next = [...assetItems];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onReorderImages(next.map((item) => item.url), next.map((item) => item.resource));
  };
  const onReorderDragStart = (i, url) => (e) => {
    // 被拖图处于选中态：拖出全部选中图（跨节点多选集合），不参与节点内排序，
    // 也不写 reorder 互斥标记——让画布 handleDrop 按 CANVAS_DROP_MIME 建节点。
    if (nodeId && isSelected(nodeId, url) && selectedUrls.length > 0) {
      setCanvasImageDragData(e.dataTransfer, selectedUrls);
      debugCanvasImageDrag('output:dragstart:selected', e.dataTransfer, { url, count: selectedUrls.length });
      e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    setCanvasImageDragData(e.dataTransfer, [url]);
    debugCanvasImageDrag('output:dragstart', e.dataTransfer, { url, sortable, index: i });
    if (!sortable) {
      e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    draggingRef.current = i;
    setDraggingIdx(i);
    e.dataTransfer.effectAllowed = 'copyMove';
    try {
      e.dataTransfer.setData('text/plain', String(i));
      // 写入互斥标记：画布 handleDrop 见此标记直接 return，不建节点（防误触发）
      e.dataTransfer.setData(IMAGE_REORDER_MIME, '1');
    } catch {}
  };
  const onReorderDragOver = (i) => (e) => {
    if (!sortable) return;
    const from = draggingRef.current;
    if (from === null || from === i) return;
    e.preventDefault();
    if (overIdx !== i) setOverIdx(i);
    reorderMove(from, i);
    draggingRef.current = i;
    setDraggingIdx(i);
  };
  const onReorderDragEnd = () => {
    draggingRef.current = null;
    setDraggingIdx(null);
    setOverIdx(null);
  };

  // 多张图且设了 fileName 时，自动补 _2/_3 序号（第一张不加序号），保持下载名唯一可读。
  const nameFor = (i) => {
    if (!fileName) return undefined;
    const dot = fileName.lastIndexOf('.');
    if (i === 0) return fileName;
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    return `${base}_${i + 1}${ext}`;
  };

  // 收集当前版本的所有产出资源（带 fileName），用于「添加当前产出」批量入库
  const currentResources = () => list.map((item) => ({ ...item.resource, fileName: nameFor(item.index) }));
  // 收集所有历史版本的产出资源，用于「添加所有产出」批量入库。
  // 仅当前版本的 resource 在 resources 内，其他版本 fallback {url}（与 HistoryTab collectResources 一致）
  const allResources = () => {
    if (!Array.isArray(versions) || versions.length === 0) return currentResources();
    return versions.flatMap((v) => {
      const imgs = Array.isArray(v?.output?.images) ? v.output.images : [];
      return imgs.map((url, index) => resourceFor(url, index));
    });
  };
  const versionsCount = Array.isArray(versions) ? versions.length : 0;

  // Gallery 必须和当前可见缩略图使用同一数据源。历史版本先通过版本按钮切换，
  // 再打开该版本，避免实例切换时 activeVersion 偏移指向其他实例的图片。
  const galleryItems = list.map((item) => ({
    src: item.url,
    type: 'image',
    fileName: nameFor(item.index),
  }));

  const open = (index) => {
    openCanvasGallery(galleryItems, index);
  };

  if (preview) return (
    <div className="flex w-full flex-col gap-2">
      <OutputStyles />
      {sections.map((section) => (
        <OutputAssetSection key={section.key} section={section} preview>
          <div className="flex w-full flex-col gap-2">
            {section.items.map((item) => (
              <PreviewImage
                key={item.key}
                url={item.url}
                thumb={item.resource.thumb}
                label={item.label}
                onOpen={() => open(item.index)}
                onImageLoad={onImageLoad}
                onDragStart={onReorderDragStart(item.index, item.url)}
              />
            ))}
          </div>
        </OutputAssetSection>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <OutputStyles />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          产出（{all.length}）{sortable ? '· 可拖拽排序' : ''}
        </span>
        <div className="flex items-center gap-1">
          {/* 添加：Popover 内嵌上传，复用 window.AgentSpaces.uploadFile，上传成功回传新 url 数组 */}
          {onAddImages && !isHistoricalView && <AddImagesButton onAddImages={onAddImages} />}
          {/* 添加当前产出：把当前版本的产出图一次性入库（对齐 HistoryTab 单条记录行为） */}
          {onAddToAssets && all.length > 0 && (
            <button
              type="button"
              title={`添加当前产出到素材库（${all.length} 张）`}
              onClick={(e) => { e.stopPropagation(); onAddToAssets(currentResources()); }}
              className="flex items-center gap-0.5 rounded p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-primary"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}
          {/* 添加所有产出：版本数>1 时显示，把所有历史版本的产出图一次性入库 */}
          {onAddToAssets && versionsCount > 1 && (
            <button
              type="button"
              title={`添加所有产出到素材库（${versionsCount} 个版本）`}
              onClick={(e) => { e.stopPropagation(); onAddToAssets(allResources()); }}
              className="flex items-center gap-0.5 rounded p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-primary"
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
          )}
          {/* 清空：仅在有产出时显示 */}
          {onClearImages && !isHistoricalView && all.length > 0 && (
            <button
              type="button"
              title="清空产出"
              onClick={(e) => { e.stopPropagation(); setConfirmClear(true); }}
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
              onClick={(e) => {
                e.stopPropagation();
                setDisplayVersion(i);
              }}
              className={
                'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition ' +
                (i === (displayVersion ?? activeVersion)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary')
              }
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
      {list.length > 0 && sections.map((section) => (
        <OutputAssetSection
          key={section.key}
          section={section}
          onClear={onRemoveImage && !isHistoricalView
            ? () => onRemoveImage(section.items.map((item) => item.id))
            : undefined}
        >
          <div className="grid grid-cols-3 gap-1">
          {section.items.map((item) => {
            const { index: i, url } = item;
            const sel = nodeId ? isSelected(nodeId, url) : false;
            return (
            <div
              key={item.key}
              data-image-selection-node-id={nodeId || undefined}
              data-image-selection-url={nodeId ? url : undefined}
              draggable
              onDragStart={onReorderDragStart(i, url)}
              onDragOver={sortable ? onReorderDragOver(i) : undefined}
              onDragEnd={sortable ? onReorderDragEnd : undefined}
              onClick={(e) => {
                e.stopPropagation();
                // ctrl/meta + 点击图片本体：增删切换（跨节点累加多选）
                if ((e.ctrlKey || e.metaKey) && nodeId) { toggle(nodeId, url, true); return; }
                open(i);
              }}
              className={`game-asset-output-thumb group relative block aspect-square cursor-pointer overflow-hidden rounded border transition-colors ${
                sortable && draggingIdx === i ? 'border-primary opacity-40'
                  : sortable && overIdx === i && draggingIdx !== i ? 'border-primary border-t-2'
                  : sel ? 'border-primary'
                  : 'border-border'
              } ${sortable ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              <ImageHoverCard disabled={draggingIdx !== null} url={url} triggerShape="fixed" className="h-full w-full border-0">
                <GridImage url={item.resource.thumb || url} />
              </ImageHoverCard>
              {item.label && <OutputLabelBadge label={item.label} />}
              {/* 左上角选择 checkbox：为右上角素材 label 留出固定位置。 */}
              {nodeId && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(nodeId, url, e.metaKey || e.ctrlKey); }}
                  title={sel ? '取消选择' : '选择'}
                  className={`game-asset-output-checkbox nodrag nopan nowheel ${sel ? 'game-asset-output-checkbox-on' : ''} absolute left-1 top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full border shadow ${
                    sel ? 'border-primary bg-primary text-primary-foreground' : 'border-background bg-background/90 text-foreground hover:border-primary hover:text-primary'
                  }`}
                >
                  {sel && <Check className="h-2.5 w-2.5" />}
                </button>
              )}
              {(onAddToAssets || (onRemoveImage && !isHistoricalView)) && (
                <div className="game-asset-output-actions nodrag nopan nowheel">
                  {onAddToAssets && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAddToAssets({ ...item.resource, fileName: nameFor(i) }); }}
                      title="添加到素材库"
                      className="game-asset-output-action rounded border border-border bg-background/90 text-muted-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
                    >
                      <FolderPlus className="h-3 w-3" />
                    </button>
                  )}
                  {onRemoveImage && !isHistoricalView && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemoveImage(item.id); }}
                      title="从产出删除"
                      className="game-asset-output-action rounded border border-border bg-background/90 text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
          </div>
        </OutputAssetSection>
      ))}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent size="sm" onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>清空产出？</AlertDialogTitle>
            <AlertDialogDescription>
              将移除当前节点的全部 {all.length} 张产出，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => { e.stopPropagation(); setConfirmClear(false); onClearImages(); }}
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
 * 单击打开 gallery。
 */
function PreviewImage({ url, thumb, label, onOpen, onImageLoad, onDragStart }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // url 变化（版本切换）时重置状态：重新进入 loading，允许重新加载新图
  const displayUrl = thumb || url;
  useEffect(() => { setFailed(false); setLoaded(false); }, [displayUrl]);
  return (
    <div className="game-asset-output-thumb relative w-full">
    <ImageHoverCard url={url} triggerShape="fixed" className="w-full border-0">
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className="block w-full overflow-hidden"
      >
        {failed ? (
          <BrokenImagePlaceholder url={url} />
        ) : (
          <>
            {!loaded && <ImageLoadingPlaceholder />}
            <img
              src={displayUrl}
              alt=""
              className={`block h-auto w-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'absolute opacity-0'}`}
              onLoad={(e) => { setLoaded(true); onImageLoad?.(e); }}
              onError={() => setFailed(true)}
            />
          </>
        )}
      </button>
    </ImageHoverCard>
    {label && <OutputLabelBadge label={label} />}
    </div>
  );
}

function OutputAssetSection({ section, preview = false, onClear, children }) {
  const [expanded, setExpanded] = useState(true);
  if (!section.groupName) return children;
  const stopSectionEvent = (event) => {
    event.stopPropagation();
    // NodeShell/ReactFlow 外层可能把点击解释为节点操作；分组展示交互必须在组件内终止。
    event.nativeEvent?.stopImmediatePropagation?.();
  };
  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-card"
      onPointerDown={stopSectionEvent}
      onClick={stopSectionEvent}
    >
      <div className="flex items-center bg-muted/60 hover:bg-muted">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(event) => { stopSectionEvent(event); setExpanded((value) => !value); }}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-medium text-foreground"
        >
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          <span className="min-w-0 flex-1 truncate" title={section.groupName}>{section.groupName}</span>
          <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">{section.items.length}</Badge>
        </button>
        {onClear && (
          <button
            type="button"
            title={`清空当前组产出（${section.groupName}）`}
            onClick={(event) => { stopSectionEvent(event); onClear(); }}
            className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-background hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {expanded && <div className={preview ? 'p-2' : 'p-1.5'}>{children}</div>}
    </div>
  );
}

function OutputLabelBadge({ label }) {
  return (
    <Badge
      variant="secondary"
      className="game-asset-output-label"
      title={label}
    >
      {label}
    </Badge>
  );
}

function OutputStyles() {
  return <style>{`
    .game-asset-output-thumb { position: relative; }
    .game-asset-output-label {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 18;
      display: block;
      pointer-events: none;
      max-width: calc(100% - 28px);
      height: 18px;
      overflow: hidden;
      padding: 0 5px;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 9px;
      line-height: 18px;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    }
    .game-asset-output-actions {
      position: absolute;
      left: 50%;
      bottom: 2px;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 4px;
      opacity: 0;
      pointer-events: none;
      transform: translateX(-50%);
      transition: opacity 150ms ease;
    }
    .game-asset-output-action {
      display: flex;
      width: 20px;
      height: 20px;
      flex: 0 0 20px;
      align-items: center;
      justify-content: center;
    }
    .game-asset-output-thumb:hover .game-asset-output-actions,
    .game-asset-output-thumb:focus-within .game-asset-output-actions {
      opacity: 1;
      pointer-events: auto;
    }
    .game-asset-output-checkbox {
      opacity: 0;
      pointer-events: none;
      transition: opacity 150ms ease;
    }
    .game-asset-output-thumb:hover .game-asset-output-checkbox,
    .game-asset-output-thumb:focus-within .game-asset-output-checkbox,
    .game-asset-output-checkbox.game-asset-output-checkbox-on {
      opacity: 1;
      pointer-events: auto;
    }
  `}</style>;
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
        draggable={false}
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
