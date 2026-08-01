import {
  Button, ScrollArea, Switch,
  Tooltip, TooltipTrigger, TooltipContent,
} from '@agent-spaces/ui';
import { Trash2, Eraser } from '@agent-spaces/ui';
import GridAnimationPreview from '../GridAnimationPreview';

/**
 * UiSplitterDialog 右侧结果面板。
 * - gridOnly：GridAnimationPreview（按行列预览 Sheet 动画）。
 * - 普通：切片预览网格（含单项删除/下载） + 当前图导出开关 + 保存全部按钮。
 *   - gridMode 时仅展示切片预览（不显示清空/刷新按钮），用于网格实时切片结果。
 *
 * onSaveSheets(gridOnly 保存) 形如 (urls) => {...}。
 */
export default function SplitResultPanel({
  gridOnly, gridMode, loading, count, previews,
  gridCols, gridRows, thumbUrls, activeUrl,
  exportEnabled, totalCount, saving, savedCount,
  onSaveSheets, onDeleteRectAt, onClearAll, onRenderList, onToggleExport, onSave,
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border">
      {gridOnly ? (
        <>
          <div className="min-h-0 flex-1">
            <GridAnimationPreview
              previews={previews}
              cols={gridCols}
              rows={gridRows}
              activeImgIdx={thumbUrls.length > 1 && activeUrl ? thumbUrls.indexOf(activeUrl) : undefined}
              onSaveSheets={onSaveSheets}
            />
          </div>
        </>
      ) : (
      <>
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium">
              {gridMode ? '网格实时切片' : '切片'} {count}
              {thumbUrls.length > 1 && activeUrl ? `（图 ${thumbUrls.indexOf(activeUrl) + 1}）` : ''}
            </span>
            {!gridMode && <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger render={
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={onClearAll} disabled={loading || count === 0} title="清空当前图所有切片" />
                }>
                  <Eraser className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">清空当前图切片</TooltipContent>
              </Tooltip>
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onRenderList} disabled={loading}>
                刷新预览
              </Button>
            </div>}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-1">
              {previews.length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  {loading ? '加载中…' : gridMode ? '正在计算网格切片…' : '无切片。表单变化自动检测或拉框新建'}
                </p>
              )}
              {previews.map((it, i) => (
                <div key={i} className="group relative overflow-hidden rounded-md border border-border bg-background">
                  <div className="flex min-h-[120px] items-center justify-center bg-[conic-gradient(#e2e8f0_25%,transparent_0_50%,#e2e8f0_0_75%,transparent_0)] [background-size:16px_16px] p-2">
                    <img src={it.url} alt={it.name} className="max-h-[110px] max-w-full object-contain" />
                  </div>
                  {/* 单项删除图标（hover 显示） */}
                  <button
                    type="button"
                    onClick={() => onDeleteRectAt(i)}
                    title="删除该切片"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm transition hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px]">
                    <span className="truncate text-muted-foreground" title={it.name}>{it.name}</span>
                    <a href={it.url} download={it.name}
                      className="shrink-0 font-medium text-primary hover:underline">下载</a>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          {/* 底部：当前图导出开关 + 保存全部按钮 */}
          <div className="flex flex-col gap-2 border-t border-border bg-muted/20 p-3">
            {activeUrl && (
              <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>导出当前图（图 {thumbUrls.indexOf(activeUrl) + 1}）</span>
                <Switch
                  checked={exportEnabled[activeUrl] !== false}
                  onCheckedChange={(on) => onToggleExport(activeUrl, on)}
                />
              </label>
            )}
            <Button size="sm" className="h-9 w-full" onClick={onSave}
              disabled={saving || totalCount === 0}>
              {saving
                ? `保存中 ${savedCount}/${totalCount}`
                : `💾 保存全部 ${totalCount} 张切片${thumbUrls.length > 1 ? `（${thumbUrls.length} 张图）` : ''}`}
            </Button>
          </div>
      </>
      )}
    </aside>
  );
}
