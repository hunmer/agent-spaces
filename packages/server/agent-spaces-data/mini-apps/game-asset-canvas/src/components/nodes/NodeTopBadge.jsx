import { useState } from 'react';
import { ClipboardCopy, FileInput, Popover, PopoverContent, PopoverTrigger, toast } from '@agent-spaces/ui';
import EditableNodeTitle from './EditableNodeTitle';

const SOURCE_LABELS = {
  upload: '已上传',
  upstream: '来自连线',
  history: '来自记录',
  storyboard: '来自分镜',
  url: '来自链接',
  drop: '拖入',
  export: '导出',
};

// 输入 URL → 展示名（取路径最后一段，失败回退原 URL）
function urlDisplayName(url) {
  try {
    const name = decodeURIComponent(new URL(url, window.location.origin).pathname.split('/').pop());
    return name || url;
  } catch {
    return url;
  }
}

/**
 * 展示类节点（图片/视频/音频/文字）上方的名称徽标：
 * - 常显节点名称（data.title，拖入文件创建时为文件名），缺省回退 fallback
 * - 点击弹出 Popover：查看节点输入源（URL 列表 + 来源/标签 + 复制地址），名称可双击编辑
 * - 位置在节点外上方左侧，避开顶部中央的 target handle（-18px 居中）
 *
 * inputs 不传（如文字节点）时 Popover 只显示名称编辑，不渲染输入列表。
 */
export default function NodeTopBadge({ title, fallback, inputs, source, tags, onRename }) {
  const [open, setOpen] = useState(false);
  const name = (typeof title === 'string' && title.trim()) || fallback || '';
  const sourceLabel = SOURCE_LABELS[source] || '';
  const urls = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
  const tagList = Array.isArray(tags) ? tags.filter(Boolean) : [];
  const hasInputsSection = inputs !== undefined;

  const copyUrl = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('已复制地址');
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <div className="nodrag nopan absolute -top-6 left-1/2 z-40 w-max max-w-[60%] -translate-x-1/2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={(
            <button
              type="button"
              title={name ? `${name} · 点击查看输入` : '点击查看输入'}
              aria-label="查看节点输入"
              className="flex max-w-full items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-foreground shadow ring-1 ring-border backdrop-blur-sm hover:text-primary"
            />
          )}
        >
          <FileInput className="h-3 w-3 shrink-0" />
          <span className="truncate">{name}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="shrink-0 text-muted-foreground">名称</span>
              <EditableNodeTitle
                value={title}
                fallback={fallback}
                onChange={onRename}
                className="min-w-0 flex-1 truncate font-medium"
                inputClassName="h-6 w-full rounded px-1 text-xs"
              />
            </div>
            {hasInputsSection && (
              <div className="flex flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="shrink-0">输入{urls.length > 0 ? `（${urls.length}）` : ''}</span>
                  {sourceLabel && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{sourceLabel}</span>
                  )}
                  {tagList.map((tag) => (
                    <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{tag}</span>
                  ))}
                </div>
                {urls.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">暂无输入</p>
                ) : (
                  <div className="scrollbar-none flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                    {urls.map((url, index) => (
                      <div key={`${index}-${url}`} className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-accent">
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px]" title={url}>{urlDisplayName(url)}</span>
                        <button
                          type="button"
                          title="复制地址"
                          aria-label="复制地址"
                          onClick={() => copyUrl(url)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          <ClipboardCopy className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
