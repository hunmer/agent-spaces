import { useCallback, useState } from 'react';
import {
  Dropzone, FileUpload, ScrollArea, openMediaGallery,
  HoverCard, HoverCardTrigger, HoverCardContent,
  Plus, Trash2, Loader2, Pencil, Check,
} from '@agent-spaces/ui';
import useAssetLibrary from '../hooks/useAssetLibrary';

/**
 * 素材库 tab：与当前工作区绑定。支持创建/重命名/删除分类，每个分类可上传图片。
 * - 整个分类卡片是一个 Dropzone（拖文件到卡片任意位置即上传到该分类）
 * - 卡片内 FileUpload 作为「点击/拖拽上传」入口（上传后资产进下方网格，FileUpload value 即清空）
 * - 图片网格：缩略图点击看大图，hover 删除单图
 *
 * 选择器模式（picker）—— 供「添加到素材库」等对话框复用本列表：
 * - picker='group'：分类卡片可点选（单/多选），隐藏上传/重命名/删除；图片仍可预览
 * - picker='image'：图片缩略图可点选（单/多选），隐藏上传/重命名/删除；分类仅作分组容器
 * - onSelectionChange：选中变化时回调，group 模式传 [{id,name}]，image 模式传 [{url,name,categoryId,id}]
 *
 * @param {{
 *   workspaceId: string,
 *   picker?: 'group'|'image',
 *   multi?: boolean,
 *   onSelectionChange?: (selected: array)=>void,
 * }} props
 */
export default function AssetLibrary({ workspaceId, picker, multi, onSelectionChange }) {
  const {
    categories, createCategory, renameCategory, deleteCategory,
    removeAsset, moveAsset, uploadFiles, uploadingCount,
  } = useAssetLibrary(workspaceId);

  const isPicker = picker === 'group' || picker === 'image';
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // picker 内部自管选中，变化时通知上层
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedAssetKeys, setSelectedAssetKeys] = useState([]); // key = `${categoryId}#${assetId}`

  const emit = useCallback((next) => {
    onSelectionChange?.(next);
  }, [onSelectionChange]);

  const toggleGroup = useCallback((cat) => {
    setSelectedGroupIds((prev) => {
      const next = multi
        ? (prev.includes(cat.id) ? prev.filter((x) => x !== cat.id) : [...prev, cat.id])
        : (prev.includes(cat.id) ? [] : [cat.id]);
      emit(categories.filter((c) => next.includes(c.id)).map((c) => ({ id: c.id, name: c.name })));
      return next;
    });
  }, [multi, categories, emit]);

  const toggleAsset = useCallback((categoryId, ast) => {
    const key = `${categoryId}#${ast.id}`;
    setSelectedAssetKeys((prev) => {
      const next = multi
        ? (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])
        : (prev.includes(key) ? [] : [key]);
      // 反查选中对象
      const picked = [];
      categories.forEach((c) => {
        (c.assets || []).forEach((a) => {
          if (next.includes(`${c.id}#${a.id}`)) picked.push({ url: a.url, name: a.name, categoryId: c.id, id: a.id });
        });
      });
      emit(picked);
      return next;
    });
  }, [multi, categories, emit]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) { setCreating(false); setNewName(''); return; }
    await createCategory(name);
    setNewName('');
    setCreating(false);
  }, [newName, createCategory]);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：新建分类（picker='image' 时不需要新建分组，隐藏） */}
      {(!isPicker || picker === 'group') && (
        <div className="border-b border-border p-2">
          {creating ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
                onBlur={handleCreate}
                placeholder="分类名称"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              新建分类
            </button>
          )}
          {!isPicker && uploadingCount > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              上传中 {uploadingCount} 个文件…
            </div>
          )}
        </div>
      )}

      {/* 分类列表 */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2">
          {categories.length === 0 && !creating && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              暂无分类，点击上方「新建分类」开始管理素材
            </p>
          )}
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              picker={picker}
              multi={multi}
              selectedGroup={selectedGroupIds.includes(cat.id)}
              selectedAssetKeys={selectedAssetKeys}
              onToggleGroup={toggleGroup}
              onToggleAsset={toggleAsset}
              onUploadFiles={!isPicker ? (files) => uploadFiles(cat.id, files) : undefined}
              onRename={!isPicker ? (name) => renameCategory(cat.id, name) : undefined}
              onDelete={!isPicker ? () => deleteCategory(cat.id) : undefined}
              onRemoveAsset={!isPicker ? (assetId) => removeAsset(cat.id, assetId) : undefined}
              onMoveAsset={!isPicker ? (fromCatId, assetId) => moveAsset(fromCatId, assetId, cat.id) : undefined}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============ 分类卡片（正常模式 Dropzone 包裹；picker 模式纯展示+选择）============
function CategoryCard({
  category, picker, multi,
  selectedGroup, selectedAssetKeys,
  onToggleGroup, onToggleAsset,
  onUploadFiles, onRename, onDelete, onRemoveAsset, onMoveAsset,
}) {
  const { assets } = category;
  const isPicker = picker === 'group' || picker === 'image';
  // FileUpload 本地 value：上传后立即清空（资产已进网格，不在 FileUpload 列表里重复展示）
  const [fuValue, setFuValue] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  // 库内图片拖入移动高亮态（仅正常模式，与 Dropzone 的上传高亮互斥）
  const [moveOver, setMoveOver] = useState(false);

  const handleFilesChange = useCallback(async (files) => {
    const pending = [];
    for (const item of files || []) {
      const f = item?.file;
      if (!f) continue;
      if (f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath) continue;
      if (f instanceof File) pending.push(f);
    }
    setFuValue([]);
    if (pending.length) onUploadFiles?.(pending);
  }, [onUploadFiles]);

  const handleDropFiles = useCallback((files) => {
    if (files && files.length) onUploadFiles?.(files);
  }, [onUploadFiles]);

  const commitRename = () => {
    const name = editName.trim();
    if (name && name !== category.name) onRename?.(name);
    setEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(`确认删除分类「${category.name}」？该分类下 ${assets?.length || 0} 张图片将一并删除。`)) {
      onDelete?.();
    }
  };

  // 库内图片拖入：识别移动协议（dragover 阶段只能读 types，drop 才能读内容）
  // 命中移动协议时 preventDefault + stopPropagation，阻止 Dropzone 误判为上传
  const isAssetMoveDrag = (e) => Array.from(e.dataTransfer?.types || []).includes(ASSET_MOVE_MIME);

  const handleMoveDragOver = (e) => {
    if (!onMoveAsset || !isAssetMoveDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setMoveOver(true);
  };

  const handleMoveDragLeave = (e) => {
    if (!moveOver) return;
    // 仅当离开卡片容器（relatedTarget 不在卡片内）才清除高亮
    if (!e.currentTarget.contains(e.relatedTarget)) setMoveOver(false);
  };

  const handleMoveDrop = (e) => {
    if (!onMoveAsset) return;
    const raw = e.dataTransfer?.getData?.(ASSET_MOVE_MIME);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    setMoveOver(false);
    try {
      const { assetId, fromCategoryId } = JSON.parse(raw);
      if (assetId && fromCategoryId && fromCategoryId !== category.id) {
        onMoveAsset?.(fromCategoryId, assetId);
      }
    } catch {
      // payload 解析失败，忽略
    }
  };

  // 卡片头：picker='group' 时整条可点击切换选中
  const headerInner = (
    <>
      {editing ? (
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setEditing(false); setEditName(category.name); }
          }}
          onBlur={commitRename}
          className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:border-primary"
        />
      ) : (
        <span
          className={'flex-1 truncate text-sm font-medium ' + (picker === 'group' ? 'cursor-pointer' : 'cursor-text')}
          onDoubleClick={!isPicker ? () => { setEditName(category.name); setEditing(true); } : undefined}
          title={!isPicker ? '双击重命名' : undefined}
        >
          {category.name}
        </span>
      )}
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {assets?.length || 0} 张
      </span>
      {selectedGroup && (
        <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
      {!isPicker && (
        <>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition hover:text-primary"
            onClick={(e) => { e.stopPropagation(); setEditName(category.name); setEditing(true); }}
            title="重命名"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            title="删除分类"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </>
  );

  const headerEl = (
    <div
      className={
        'flex items-center gap-1.5 border-b border-border px-2 py-1.5 '
        + (picker === 'group' ? 'cursor-pointer select-none' : '')
      }
    >
      {headerInner}
    </div>
  );

  // 图片网格
  const gridEl = assets && assets.length > 0 && (
    <div className="p-2">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
      >
        {assets.map((ast) => (
          <AssetThumb
            key={ast.id}
            asset={ast}
            categoryId={category.id}
            picker={picker}
            selected={selectedAssetKeys?.includes(`${category.id}#${ast.id}`)}
            onToggle={() => onToggleAsset?.(category.id, ast)}
            onRemove={onRemoveAsset ? () => onRemoveAsset(ast.id) : undefined}
          />
        ))}
      </div>
    </div>
  );

  // 上传入口（picker 模式隐藏）
  const uploadEl = !isPicker && (
    <div className="p-2 pt-0">
      <FileUpload
        value={fuValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': [] }}
        maxFiles={0}
        placeholder="点击或拖拽图片上传到此分类"
        className="[&>div:first-child]:py-4 [&>div:first-child]:px-2"
      />
    </div>
  );

  // picker='group' 时整张卡片可点击选中（用 div+role 避免 button 嵌 button）
  if (picker === 'group') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggleGroup?.(category)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleGroup?.(category); } }}
        className={
          'block cursor-pointer rounded-lg border bg-background p-0 text-left transition '
          + (selectedGroup ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50')
        }
      >
        {headerEl}
        {gridEl}
      </div>
    );
  }

  // 正常模式 / picker='image'：Dropzone 仅正常模式包裹
  if (isPicker) {
    return (
      <div className="rounded-lg border border-border bg-background">
        {headerEl}
        {gridEl}
      </div>
    );
  }

  return (
    <Dropzone
      onFiles={handleDropFiles}
      accept={{ 'image/*': [] }}
      className="mt-2 rounded-lg first:mt-0"
    >
      <div
        className={
          'rounded-lg border bg-background transition-colors '
          + (moveOver ? 'border-primary ring-2 ring-primary bg-primary/5' : 'border-border')
        }
        onDragOver={handleMoveDragOver}
        onDragLeave={handleMoveDragLeave}
        onDrop={handleMoveDrop}
      >
        {headerEl}
        {gridEl}
        {uploadEl}
      </div>
    </Dropzone>
  );
}

// 库内图片拖拽移动协议：dragstart 写入此 MIME，drop 时识别为「移动」而非「上传」
const ASSET_MOVE_MIME = 'application/x-asset-move';

// ============ 单张资产缩略图 ============
function AssetThumb({ asset, categoryId, picker, selected, onToggle, onRemove }) {
  const isPickerImage = picker === 'image';
  // HoverCard 拖拽时隐藏（避免大图浮层遮挡目标分类）
  const [hoverOpen, setHoverOpen] = useState(false);
  const handleClick = () => {
    if (isPickerImage) {
      onToggle?.();
    } else {
      openMediaGallery([{ src: asset.url, type: 'image' }], 0);
    }
  };

  // 默认模式：img 可拖拽，拖起时把移动协议写入 dataTransfer 并关闭 HoverCard
  const handleDragStart = (e) => {
    const payload = JSON.stringify({ assetId: asset.id, fromCategoryId: categoryId });
    e.dataTransfer.setData(ASSET_MOVE_MIME, payload);
    e.dataTransfer.setData('text/plain', payload); // 兜底
    e.dataTransfer.effectAllowed = 'move';
    setHoverOpen(false);
  };

  // picker='image'：可选中缩略图
  if (isPickerImage) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(); } }}
        title={asset.name || '点击选中'}
        className={
          'group/asset relative aspect-square cursor-pointer overflow-hidden rounded border transition '
          + (selected ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/50')
        }
      >
        <img
          src={asset.url}
          alt={asset.name || ''}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {selected && (
          <div className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded bg-primary text-primary-foreground">
            <Check className="h-2.5 w-2.5" />
          </div>
        )}
      </div>
    );
  }

  // 默认：预览 + 删除
  return (
    <HoverCard open={hoverOpen} onOpenChange={setHoverOpen}>
      <HoverCardTrigger
        render={
          <div className="group/asset relative aspect-square cursor-pointer overflow-hidden rounded border border-border">
            <button type="button" onClick={handleClick} className="block h-full w-full">
              <img
                src={asset.url}
                alt={asset.name || ''}
                className="h-full w-full cursor-grab object-cover transition hover:opacity-80 active:cursor-grabbing"
                loading="lazy"
                draggable
                onDragStart={handleDragStart}
              />
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded bg-background/80 text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground"
                title="删除图片"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        }
      />
      <HoverCardContent className="flex max-w-[500px] w-auto flex-col items-center p-1">
        <img
          src={asset.url}
          alt={asset.name || ''}
          className="max-h-[320px] max-w-[320px] rounded object-contain"
        />
        {asset.name && (
          <p className="mt-1 max-w-[320px] truncate text-[11px] text-muted-foreground">{asset.name}</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
