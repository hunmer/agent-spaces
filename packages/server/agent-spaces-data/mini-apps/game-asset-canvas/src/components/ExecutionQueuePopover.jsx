import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@agent-spaces/ui';
import { NODE_META } from '../utils/constants';

const STATUS_META = {
  running: { label: '生成中', color: '#3b82f6', dot: 'animate-pulse' },
  done: { label: '完成', color: '#10b981' },
  error: { label: '失败', color: '#ef4444' },
  stopped: { label: '已中断', color: '#94a3b8' },
};

/**
 * 右上角执行队列按钮 + popover。
 * @param {{ jobs: array, runningCount: number, onCancel:(id)=>void, onClearFinished:()=>void }} props
 */
export default function ExecutionQueuePopover({ jobs, runningCount, onCancel, onClearFinished }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition hover:border-primary"
          title="执行队列"
        >
          <span>📋</span>
          <span>执行队列</span>
          {runningCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {runningCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">执行队列</span>
          {jobs.some((j) => j.status !== 'running') && (
            <button
              type="button"
              onClick={onClearFinished}
              className="text-xs text-muted-foreground transition hover:text-primary"
            >
              清除已完成
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          <div className="flex flex-col gap-1 p-2">
            {jobs.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">队列为空</p>
            )}
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onCancel={onCancel} />
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function JobRow({ job, onCancel }) {
  const meta = NODE_META[job.nodeType] || { icon: '🔹', label: job.nodeType };
  const sm = STATUS_META[job.status] || STATUS_META.error;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${sm.dot || ''}`} style={{ backgroundColor: sm.color }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{meta.icon}</span>
          <span className="truncate text-xs font-medium">{job.label}</span>
        </div>
        <span className="truncate text-[10px] text-muted-foreground">
          {sm.label}
          {job.status === 'done' && job.images?.length ? ` · ${job.images.length} 张` : ''}
          {job.status === 'error' && job.error ? ` · ${job.error}` : ''}
        </span>
      </div>
      {job.status === 'running' && (
        <button
          type="button"
          onClick={() => onCancel(job.id)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
          title="中断执行"
        >
          中断
        </button>
      )}
    </div>
  );
}
