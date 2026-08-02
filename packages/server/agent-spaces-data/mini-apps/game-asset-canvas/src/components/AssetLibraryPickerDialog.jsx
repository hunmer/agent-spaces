import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button,
} from '@agent-spaces/ui';
import AssetLibrary from './AssetLibrary';

// 从 lightGallery 全屏预览（lg-outer z-index 1050，内部 1084）内触发本对话框时，
// base-ui Dialog 默认 z-50 会被 gallery 盖住。用 body class 标记 + 全局 CSS 提升本实例层级，
// 比 :has 兄弟选择器可靠（不依赖 Portal 内部 DOM 结构）。
const ABOVE_GALLERY_BODY_CLASS = 'as-dialog-above-gallery';
const ABOVE_GALLERY_STYLE_ID = 'as-dialog-above-gallery-style';
function ensureAboveGalleryStyle() {
  if (document.getElementById(ABOVE_GALLERY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ABOVE_GALLERY_STYLE_ID;
  style.textContent = `
    body.${ABOVE_GALLERY_BODY_CLASS} [data-slot="dialog-overlay"],
    body.${ABOVE_GALLERY_BODY_CLASS} [data-slot="dialog-content"] {
      z-index: 2000 !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 素材库选择器对话框：直接复用 AssetLibrary 列表（picker 模式），只加 Dialog 外壳 + 选中态 + 确认按钮。
 * - mode='group'：选分组（用于「把图片添加到分组」）
 * - mode='image'：选图片（用于「从素材库挑图」）
 *
 * @param {{
 *   open: boolean,
 *   onClose: ()=>void,
 *   workspaceId: string,
 *   mode?: 'group'|'image',      // 默认 'group'
 *   multi?: boolean,             // 默认 false
 *   title?: string,
 *   confirmLabel?: string,
 *   onConfirm: (selected: array)=>void,
 * }} props
 */
export default function AssetLibraryPickerDialog({
  open, onClose, workspaceId,
  mode = 'group', multi = false,
  title, confirmLabel,
  onConfirm,
}) {
  // group 模式下记住上次确认选中的分组 id，下次打开默认选中。按 workspaceId 隔离。
  const lastGroupIdsKey = `as-asset-picker-last-groups-${workspaceId || 'default'}`;
  const lastGroupIds = useMemo(() => {
    if (mode !== 'group') return [];
    try {
      const raw = localStorage.getItem(lastGroupIdsKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch { return []; }
  }, [mode, lastGroupIdsKey, open]);

  const [selected, setSelected] = useState([]);

  // 对话框打开期间给 body 加 class，配合注入的全局 CSS 把本实例 overlay+content 提到 gallery 之上。
  useEffect(() => {
    if (!open) return;
    ensureAboveGalleryStyle();
    document.body.classList.add(ABOVE_GALLERY_BODY_CLASS);
    return () => document.body.classList.remove(ABOVE_GALLERY_BODY_CLASS);
  }, [open]);

  const titleText = title || (mode === 'group'
    ? (multi ? '选择分组（可多选）' : '选择分组')
    : (multi ? '选择图片（可多选）' : '选择图片'));

  const handleClose = () => { setSelected([]); onClose?.(); };

  const handleConfirm = () => {
    // group 模式：把本次确认的分组 id 持久化，下次打开默认选中
    if (mode === 'group') {
      try {
        const ids = selected.map((g) => g.id).filter(Boolean);
        if (ids.length) localStorage.setItem(lastGroupIdsKey, JSON.stringify(ids));
      } catch { /* noop */ }
    }
    onConfirm?.(selected);
    setSelected([]);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent
        className="!flex h-[80vh] !w-[80vw] !max-w-[80vw] !flex-col !gap-0 overflow-hidden !px-0 !pt-0 !pb-3"
        style={{ maxHeight: '80vh' }}
      >
        <DialogHeader className="!flex-none shrink-0 border-b border-border px-4 py-3">
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        {/* 复用素材库列表（picker 模式：隐藏上传/重命名/删除，启用选择） */}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <AssetLibrary
            workspaceId={workspaceId}
            picker={mode}
            multi={multi}
            onSelectionChange={setSelected}
            defaultSelectedGroupIds={lastGroupIds}
          />
        </div>

        <DialogFooter className="!flex-none !m-0 shrink-0 justify-between rounded-b-lg border-t border-border bg-background px-4 py-2.5 sm:flex-row sm:justify-between">
          <span className="text-xs text-muted-foreground self-center">
            {mode === 'group'
              ? `已选 ${selected.length} 个分组`
              : `已选 ${selected.length} 张图片`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>取消</Button>
            <Button
              type="button"
              size="sm"
              disabled={selected.length === 0}
              onClick={handleConfirm}
            >
              {confirmLabel || '确认'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
