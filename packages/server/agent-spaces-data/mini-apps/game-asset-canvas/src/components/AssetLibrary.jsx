import { useCallback, useState } from 'react';
import {
  Dropzone, FileUpload, ScrollArea, openMediaGallery,
  HoverCard, HoverCardTrigger, HoverCardContent,
  Plus, Trash2, Loader2, Pencil,
} from '@agent-spaces/ui';
import useAssetLibrary from '../hooks/useAssetLibrary';

/**
 * 素材库 tab：与当前工作区绑定。支持创建/重命名/删除分类，每个分类可上传图片。
 * - 整个分类卡片是一个 Dropzone（拖文件到卡片任意位置即上传到该分类）
 * - 卡片内 FileUpload 作为「点击/拖拽上传」入口（上传后资产进下方网格，FileUpload value 即清空）
 * - 图片网格：缩略图点击看大图，hover 删除单图
 */
export default function AssetLibrary({ workspaceId }) {
  const {
    categories, createCategory, renameCategory, deleteCategory,
    removeAsset, uploadFiles, uploadingCount,
  } = useAssetLibrary(workspaceId);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) { setCreating(false); setNewName(''); return; }
    await createCategory(name);
    setNewName('');
    setCreating(false);
  }, [newName, createCategory]);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：新建分类 */}
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
        {uploadingCount > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            上传中 {uploadingCount} 个文件…
          </div>
        )}
      </div>

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
              onUploadFiles={(files) => uploadFiles(cat.id, files)}
              onRename={(name) => renameCategory(cat.id, name)}
              onDelete={() => deleteCategory(cat.id)}
              onRemoveAsset={(assetId) => removeAsset(cat.id, assetId)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============ 分类卡片（整体 Dropzone 包裹）============
function CategoryCard({ category, onUploadFiles, onRename, onDelete, onRemoveAsset }) {
  const { assets } = category;
  // FileUpload 本地 value：上传后立即清空（资产已进网格，不在 FileUpload 列表里重复展示）
  const [fuValue, setFuValue] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);

  const handleFilesChange = useCallback(async (files) => {
    const pending = [];
    for (const item of files || []) {
      const f = item?.file;
      if (!f) continue;
      // 已上传的（理论上不会出现，因为每次清空）跳过
      if (f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath) continue;
      if (f instanceof File) pending.push(f);
    }
    setFuValue([]); // 立即清空，资产走网格展示
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

  return (
    <Dropzone
      onFiles={handleDropFiles}
      accept={{ 'image/*': [] }}
      className="mt-2 rounded-lg first:mt-0"
    >
      <div className="rounded-lg border border-border bg-background">
        {/* 分类头 */}
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
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
              className="flex-1 cursor-text truncate text-sm font-medium"
              onDoubleClick={() => { setEditName(category.name); setEditing(true); }}
              title="双击重命名"
            >
              {category.name}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {assets?.length || 0} 张
          </span>
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
        </div>

        {/* 图片网格 */}
        {assets && assets.length > 0 && (
          <div className="p-2">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
            >
              {assets.map((ast) => (
                <AssetThumb key={ast.id} asset={ast} onRemove={() => onRemoveAsset(ast.id)} />
              ))}
            </div>
          </div>
        )}

        {/* 上传入口（点击/拖拽） */}
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
      </div>
    </Dropzone>
  );
}

// ============ 单张资产缩略图 ============
function AssetThumb({ asset, onRemove }) {
  const handleClick = () => {
    openMediaGallery([{ src: asset.url, type: 'image' }], 0);
  };
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="group/asset relative aspect-square cursor-pointer overflow-hidden rounded border border-border">
          <button type="button" onClick={handleClick} className="block h-full w-full">
            <img
              src={asset.url}
              alt={asset.name || ''}
              className="h-full w-full object-cover transition hover:opacity-80"
              loading="lazy"
            />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded bg-background/80 text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground"
            title="删除图片"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="flex w-auto flex-col items-center p-1">
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
