import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Popover, PopoverContent, PopoverTrigger, ScrollArea, ListTodo, Slider,
} from '@agent-spaces/ui';
import { NODE_META } from '../utils/constants';

const STATUS_META = {
  queued: { label: '队列中', color: '#f59e0b' },
  running: { label: '生成中', color: '#3b82f6', dot: 'animate-pulse' },
  done: { label: '完成', color: '#10b981' },
  error: { label: '失败', color: '#ef4444' },
  stopped: { label: '已中断', color: '#94a3b8' },
};

/**
 * 右上角执行队列按钮 + popover。
 * 同时展示「画布运行中节点」（可中断）和「表单提交的队列任务」。
 * @param {{
 *   jobs: array,
 *   runningNodes?: array<{id, nodeType, label}>,  // 画布中 status==='running' 的节点
 *   runningCount: number,                          // 角标数（队列运行数 + 运行中节点数）
 *   onCancel:(id)=>void,                           // 中断队列任务
 *   onCancelNode?:(nodeId)=>void,                  // 中断画布运行中节点
 *   onClearFinished:()=>void
 * }} props
 */
export default function ExecutionQueuePopover({
  jobs, runningNodes = [], runningCount, concurrency = 3,
  onConcurrencyChange, onCancel, onCancelNode, onCancelAll, onClearFinished,
}) {
  const [open, setOpen] = useState(false);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  const [draftConcurrency, setDraftConcurrency] = useState(concurrency);
  useEffect(() => setDraftConcurrency(concurrency), [concurrency]);
  const hasRunningNodes = runningNodes.length > 0;
  const hasFinishedJobs = jobs.some((j) => j.status !== 'queued' && j.status !== 'running');
  const activeCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
    + runningNodes.length;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative flex items-center justify-center rounded-md border border-border bg-background p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary"
            title="执行队列"
          >
            <ListTodo className="h-4 w-4" />
            {runningCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground shadow">
                {runningCount > 99 ? '99+' : runningCount}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">执行队列</span>
          <div className="flex items-center gap-2">
            {hasFinishedJobs && (
              <button
                type="button"
                onClick={onClearFinished}
                className="text-xs text-muted-foreground transition hover:text-primary"
              >
                清除已完成
              </button>
            )}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setConfirmCancelAll(true)}
                className="text-xs text-destructive transition hover:text-destructive/80"
              >
                中断全部
              </button>
            )}
          </div>
        </div>
        <div className="border-b border-border px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">同时处理任务</span>
            <span className="font-medium text-foreground">{draftConcurrency}</span>
          </div>
          <Slider
            min={1}
            max={10}
            step={1}
            value={draftConcurrency}
            onValueChange={(value) => setDraftConcurrency(Math.max(1, Math.min(10, Number(value) || 1)))}
            onValueCommitted={(value) => onConcurrencyChange?.(Math.max(1, Math.min(10, Number(value) || 1)))}
          />
        </div>
        <ScrollArea className="max-h-96">
          <div className="flex flex-col gap-1 p-2">
            {/* 运行中节点 */}
            {hasRunningNodes && (
              <div className="mb-1">
                <div className="flex items-center gap-1.5 px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  运行中节点 · {runningNodes.length}
                </div>
                {runningNodes.map((n) => (
                  <RunningNodeRow key={n.id} node={n} onCancel={onCancelNode} />
                ))}
              </div>
            )}
            {/* 队列任务 */}
            {hasRunningNodes && jobs.length > 0 && (
              <div className="my-1 border-t border-dashed border-border" />
            )}
            {jobs.length > 0 && (
              <div>
                {hasRunningNodes && (
                  <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    队列任务 · {jobs.length}
                  </div>
                )}
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} onCancel={onCancel} />
                ))}
              </div>
            )}
            {!hasRunningNodes && jobs.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">暂无执行任务</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
      </Popover>
      <AlertDialog open={confirmCancelAll} onOpenChange={setConfirmCancelAll}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>中断全部任务？</AlertDialogTitle>
            <AlertDialogDescription>
              将取消或中断当前 {activeCount} 个等待及运行中的任务，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onCancelAll?.();
                setConfirmCancelAll(false);
              }}
            >
              中断全部
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** 画布运行中节点行：显示节点类型 + 标签，右侧「中断」按钮 */
function RunningNodeRow({ node, onCancel }) {
  const meta = NODE_META[node.nodeType] || { icon: '🔹', label: node.nodeType };
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-blue-500/5 px-2.5 py-2">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{meta.icon}</span>
          <span className="truncate text-xs font-medium">{node.label || meta.label}</span>
        </div>
        <span className="truncate text-[10px] text-muted-foreground">运行中 · 点击中断</span>
      </div>
      <button
        type="button"
        onClick={() => onCancel?.(node.id)}
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
        title="中断该节点"
      >
        中断
      </button>
    </div>
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
      {(job.status === 'queued' || job.status === 'running') && (
        <button
          type="button"
          onClick={() => onCancel(job.id)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
          title={job.status === 'queued' ? '取消等待' : '中断执行'}
        >
          {job.status === 'queued' ? '取消' : '中断'}
        </button>
      )}
    </div>
  );
}
