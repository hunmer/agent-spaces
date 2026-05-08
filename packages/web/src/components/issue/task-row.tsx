'use client';

import { useSortable } from '@dnd-kit/react/sortable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentIcon } from '@/components/common/agent-icon';
import { Pencil, Trash2, RotateCcw, XCircle } from 'lucide-react';
import { TASK_STATUS_COLOR } from './issue-status-colors';
import type { Task } from '@agent-spaces/shared';

interface TaskRowProps {
  task: Task;
  index: number;
  workspaceId: string;
  onRetry: (wsId: string, taskId: string) => void;
  onCancel: (wsId: string, taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (wsId: string, taskId: string) => void;
  tTask: (key: string) => string;
}

export function TaskRow({
  task,
  index,
  workspaceId,
  onRetry,
  onCancel,
  onEdit,
  onDelete,
  tTask,
}: TaskRowProps) {
  const isPending = task.status === 'pending';
  const isActive = isPending || task.status === 'running' || task.status === 'reviewing' || task.status === 'retrying';
  const isDraggable = isPending || isActive;

  const { ref, isDragging } = useSortable({
    id: task.id,
    index,
    disabled: !isDraggable,
  });

  return (
    <div
      ref={ref}
      className={[
        'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-card group transition-colors hover:bg-accent/30 min-w-0',
        isDragging && 'opacity-50 shadow-lg scale-105',
        !isDraggable && 'opacity-70',
      ].filter(Boolean).join(' ')}
      style={{ cursor: isDraggable ? 'grab' : 'default' }}
    >
      <AgentIcon agentId={task.agentConfigId} className="h-6 w-6 shrink-0 rounded" />
      <span className="text-sm truncate max-w-[160px]">{task.title}</span>
      <Badge variant={TASK_STATUS_COLOR[task.status]} className="text-[10px] shrink-0">
        {tTask(`status.${task.status}`)}
      </Badge>
      <div className="flex items-center gap-0.5 shrink-0">
        {isPending && (
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onEdit(task)}>
            <Pencil className="h-3 w-3" />
          </Button>
        )}
        {(isPending || task.status === 'cancelled' || task.status === 'done') && (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDelete(workspaceId, task.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
        {task.status === 'failed' && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRetry(workspaceId, task.id)}>
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        {isActive && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onCancel(workspaceId, task.id)}>
            <XCircle className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
