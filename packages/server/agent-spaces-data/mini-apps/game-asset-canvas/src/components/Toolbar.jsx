import { useState } from 'react';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  History as HistoryIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Redo2,
  ScrollArea,
  Undo2,
  toast,
} from '@agent-spaces/ui';

/**
 * 顶部工具栏：标题 + Menubar + 右侧插槽（工作区切换/执行队列/节点数）。
 *
 * Menubar 布局：
 *   文件▾(导出[JSON/素材库]/导入[JSON/素材库]) | 画布▾(自动布局/清空) | 工具▾(...) | 选择▾(全选/反选/取消选择)
 *
 * @param {{ onClear, onAutoLayout, onExport, onExportAssetLibrary, onExportWorkspace, onImport, onImportAssetLibrary, onImportWorkspace, onOpenSettings, onOpenPromptManager,
 *           edgePathStyle, edgeLineStyle, edgePathStyles, edgeLineStyles, onEdgePathStyleChange, onEdgeLineStyleChange,
 *           onSelectAll, onInvertSelect, onClearSelection,
 *           operationHistory, onUndo, onRedo, canUndo, canRedo, count, queueSlot, workspaceSlot }} props
 */
export default function Toolbar({
  onClear, onAutoLayout, onExport, onExportAssetLibrary, onExportWorkspace, onImport, onImportAssetLibrary, onImportWorkspace, onOpenSettings, onOpenPromptManager,
  edgePathStyle, edgeLineStyle, edgePathStyles, edgeLineStyles, onEdgePathStyleChange, onEdgeLineStyleChange,
  onSelectAll, onInvertSelect, onClearSelection,
  operationHistory, onUndo, onRedo, canUndo, canRedo,
  count, queueSlot, workspaceSlot,
}) {
  // 素材库/工作区 导出/导入中状态：控制对应菜单项禁用 + 文案切换。
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  // 清空画布需二次确认，防止误触清空全部节点。
  const [confirmClear, setConfirmClear] = useState(false);

  // 导出素材库：toast.loading 实时反馈进度，完成/失败切 success/error。
  // 空库/全部失败由工具函数抛错，这里 catch 后 toast.error。
  const handleExportAssetLibrary = async () => {
    if (exporting || !onExportAssetLibrary) return;
    setExporting(true);
    const toastId = toast.loading('正在准备素材库…');
    try {
      const stats = await onExportAssetLibrary((done, total) => {
        toast.loading(`导出素材库中… (${done}/${total})`, { id: toastId });
      });
      if (stats.failed > 0) {
        toast.success(`导出完成：成功 ${stats.ok} 张，失败 ${stats.failed} 张`, { id: toastId });
      } else {
        toast.success(`导出完成：共 ${stats.ok} 张`, { id: toastId });
      }
    } catch (e) {
      toast.error(`导出素材库失败：${e?.message || e}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  // 导入素材库：选 zip → 上传入库。toast 进度同导出。用户取消选文件静默无操作（onImportAssetLibrary 返回 null）。
  const handleImportAssetLibrary = async () => {
    if (importing || !onImportAssetLibrary) return;
    setImporting(true);
    const toastId = toast.loading('请选择素材库 zip 文件…');
    try {
      const stats = await onImportAssetLibrary((done, total) => {
        toast.loading(`导入素材库中… (${done}/${total})`, { id: toastId });
      });
      if (stats === null) {
        // 用户取消选文件，撤销 loading toast
        toast.dismiss(toastId);
        return;
      }
      if (stats.failed > 0) {
        toast.success(`导入完成：成功 ${stats.ok} 张，失败 ${stats.failed} 张（${stats.categories} 个分类）`, { id: toastId });
      } else {
        toast.success(`导入完成：共 ${stats.ok} 张（${stats.categories} 个分类）`, { id: toastId });
      }
    } catch (e) {
      toast.error(`导入素材库失败：${e?.message || e}`, { id: toastId });
    } finally {
      setImporting(false);
    }
  };

  // 导出工作区：3 个 json + 后端图片落 zip。toast 进度反馈下载图片进度。
  const handleExportWorkspace = async () => {
    if (workspaceBusy || !onExportWorkspace) return;
    setWorkspaceBusy(true);
    const toastId = toast.loading('正在收集工作区数据…');
    try {
      const stats = await onExportWorkspace((done, total) => {
        toast.loading(`下载工作区图片中… (${done}/${total})`, { id: toastId });
      });
      toast.success(`导出完成：${stats.jsons} 个数据文件，图片 ${stats.assetsOk} 张${stats.assetsFailed > 0 ? `（失败 ${stats.assetsFailed}）` : ''}`, { id: toastId });
    } catch (e) {
      toast.error(`导出工作区失败：${e?.message || e}`, { id: toastId });
    } finally {
      setWorkspaceBusy(false);
    }
  };

  // 导入工作区：选 zip → 重传图片 → 新建工作区写入。toast 显示上传图片进度。
  const handleImportWorkspace = async () => {
    if (workspaceBusy || !onImportWorkspace) return;
    setWorkspaceBusy(true);
    const toastId = toast.loading('请选择工作区 zip 文件…');
    try {
      const stats = await onImportWorkspace((done, total) => {
        toast.loading(`上传图片中… (${done}/${total})`, { id: toastId });
      });
      if (stats === null) {
        toast.dismiss(toastId); // 用户取消
        return;
      }
      toast.success(`工作区导入完成：图片 ${stats.uploaded} 张${stats.failed > 0 ? `（失败 ${stats.failed}）` : ''}`, { id: toastId });
    } catch (e) {
      toast.error(`导入工作区失败：${e?.message || e}`, { id: toastId });
    } finally {
      setWorkspaceBusy(false);
    }
  };
  // 像素编辑器：新窗口打开本地 Pixelorama web 版（与节点内编辑器同源，独立全屏编辑，支持像素绘制与动画帧）。
  // 用 window.location.origin 拼，兼容 dev(3000)/dist(3100)。
  const openPixelEditor = () => {
    const url = `${window.location.origin}/api/mini-apps/game-asset-canvas/src/file/vendor/pixelorama-web/index.html?nosplash=1`;
    window.open(url, '_blank', 'noopener');
  };

  // 3D 导演台：新窗口打开 director-desk-web（与节点内编辑器同源）。
  const openDirectorDesk = () => {
    const url = `${window.location.origin}/api/mini-apps/game-asset-canvas/src/file/vendor/director-desk-web/index.html`;
    window.open(url, '_blank', 'noopener');
  };

  // 在线PS：新窗口打开 Photopea（浏览器版 Photoshop，无需本地依赖）。
  const openOnlinePS = () => {
    window.open('https://www.photopea.com', '_blank', 'noopener');
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      {workspaceSlot}
      <div className="mx-1 h-5 w-px bg-border" />

      <Menubar>
        {/* 文件▾：导出[JSON/素材库/工作区] / 导入[JSON/素材库/工作区] */}
        <MenubarMenu>
          <MenubarTrigger>文件</MenubarTrigger>
          <MenubarContent>
            <MenubarSub>
              <MenubarSubTrigger>导出…</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={onExport}>导出 JSON</MenubarItem>
                <MenubarItem disabled={exporting} onClick={handleExportAssetLibrary}>
                  {exporting ? '导出素材库中…' : '导出素材库'}
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem disabled={workspaceBusy} onClick={handleExportWorkspace}>
                  {workspaceBusy ? '导出工作区中…' : '导出工作区'}
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>导入…</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={onImport}>导入 JSON</MenubarItem>
                <MenubarItem disabled={importing} onClick={handleImportAssetLibrary}>
                  {importing ? '导入素材库中…' : '导入素材库'}
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem disabled={workspaceBusy} onClick={handleImportWorkspace}>
                  {workspaceBusy ? '导入工作区中…' : '导入工作区'}
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>

        {/* 画布▾：自动布局 / 清空 */}
        <MenubarMenu>
          <MenubarTrigger>画布</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onAutoLayout}>自动布局</MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>连线</MenubarSubTrigger>
              <MenubarSubContent>
                {(edgePathStyles || []).map((style) => (
                  <MenubarItem key={style} onClick={() => onEdgePathStyleChange?.(style)}>
                    {edgePathStyle === style ? '✓ ' : ''}{style}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>线条</MenubarSubTrigger>
              <MenubarSubContent>
                {(edgeLineStyles || []).map((style) => (
                  <MenubarItem key={style} onClick={() => onEdgeLineStyleChange?.(style)}>
                    {edgeLineStyle === style ? '✓ ' : ''}{style === 'dashed' ? '虚线' : '实线'}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onClick={() => setConfirmClear(true)} variant="destructive">清空</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* 工具▾：像素编辑器 / 3D导演台 / 在线PS / 提示词管理 / 设置（原「编辑器」菜单改名） */}
        <MenubarMenu>
          <MenubarTrigger>工具</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={openPixelEditor}>像素编辑器</MenubarItem>
            <MenubarItem onClick={openDirectorDesk}>3D导演台</MenubarItem>
            <MenubarItem onClick={openOnlinePS}>在线PS</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onOpenPromptManager}>提示词管理</MenubarItem>
            <MenubarItem onClick={onOpenSettings}>设置</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* 选择▾：全选 / 反选 / 取消选择 */}
        <MenubarMenu>
          <MenubarTrigger>选择</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onSelectAll}>全选</MenubarItem>
            <MenubarItem onClick={onInvertSelect}>反选</MenubarItem>
            <MenubarItem onClick={onClearSelection}>取消选择</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="ml-auto flex items-center gap-2">
        {queueSlot}
        <span className="text-xs text-muted-foreground">{count} 个节点</span>
        <Popover>
          <PopoverTrigger
            render={(
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-foreground"
                title="操作历史"
                aria-label="查看操作历史"
              />
            )}
          >
            <HistoryIcon className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">操作历史</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={onUndo} disabled={!canUndo} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" title="撤销 (Ctrl+Z)" aria-label="撤销">
                  <Undo2 className="h-4 w-4" />
                </button>
                <button type="button" onClick={onRedo} disabled={!canRedo} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" title="重做 (Ctrl+Y)" aria-label="重做">
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <ScrollArea className="max-h-80">
              {operationHistory.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">暂无操作记录</div>
              ) : (
                <div className="p-2">
                  {[...operationHistory].reverse().map((item) => (
                    <div key={item.id} className={`flex items-center justify-between rounded px-2 py-1.5 text-xs ${item.current ? 'bg-muted text-foreground' : 'text-muted-foreground'} ${item.applied ? '' : 'opacity-50'}`}>
                      <span>{item.label}</span>
                      <span className="tabular-nums">{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>清空画布？</AlertDialogTitle>
            <AlertDialogDescription>
              将移除画布上的所有节点、连线和分组，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { setConfirmClear(false); onClear?.(); }}
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
