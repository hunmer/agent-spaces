import { Download, Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@agent-spaces/ui';

const STATUS = {
  queued: { label: '等待中', color: '#f59e0b' },
  running: { label: '下载中', color: '#3b82f6', pulse: true },
  done: { label: '已保存', color: '#10b981' },
  error: { label: '失败', color: '#ef4444' },
};

export default function DownloadQueuePopover({ tasks = [], activeCount = 0, onClearFinished }) {
  const hasFinished = tasks.some((task) => task.status === 'done' || task.status === 'error');
  return (
    <Popover>
      <PopoverTrigger
        render={(
          <button
            type="button"
            className="relative flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
            title="下载队列"
            aria-label="查看下载队列"
          />
        )}
      >
        <Download className="h-4 w-4" />
        <span>下载队列</span>
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">下载队列</span>
          {hasFinished && (
            <button type="button" onClick={onClearFinished} className="text-xs text-muted-foreground hover:text-primary">
              清除已完成
            </button>
          )}
        </div>
        <ScrollArea viewportClassName="max-h-96">
          <div className="flex flex-col gap-1 p-2">
            {tasks.map((task) => {
              const meta = STATUS[task.status] || STATUS.error;
              const done = Number(task.completedCount) || 0;
              const total = Number(task.totalCount) || task.urls?.length || 0;
              const error = task.errors?.[0]?.error;
              return (
                <div key={task.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.pulse ? 'animate-pulse' : ''}`} style={{ backgroundColor: meta.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{task.label || '图片下载'}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {meta.label}{total ? ` · ${done}/${total}` : ''}{error ? ` · ${error}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            {tasks.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">暂无下载任务</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
