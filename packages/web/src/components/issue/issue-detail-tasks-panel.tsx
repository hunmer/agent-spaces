'use client';

import { useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { TaskRow } from './task-row';
import type { Issue, Task } from '@agent-spaces/shared';

interface IssueDetailTasksPanelProps {
  issue: Issue;
  workspaceId: string;
  issueTasks: Task[];
  t: (key: string, params?: Record<string, string | number | Date>) => string;
  tTask: (key: string) => string;
  tc: (key: string) => string;
  retryTask: (wsId: string, taskId: string) => void;
  cancelTask: (wsId: string, taskId: string) => void;
  reorderTasks: (wsId: string, issueId: string, taskIds: string[]) => void;
  createTask: (wsId: string, issueId: string, title: string, desc: string) => Promise<Task>;
  updateTask: (wsId: string, taskId: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (wsId: string, taskId: string) => Promise<void>;
}

export function IssueDetailTasksPanel({
  issue,
  workspaceId,
  issueTasks,
  t,
  tTask,
  tc,
  retryTask,
  cancelTask,
  reorderTasks,
  createTask,
  updateTask,
  deleteTask,
}: IssueDetailTasksPanelProps) {
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    if (editingTask) {
      await updateTask(workspaceId, editingTask.id, { title: newTaskTitle.trim(), description: newTaskDesc.trim() });
    } else {
      await createTask(workspaceId, issue.id, newTaskTitle.trim(), newTaskDesc.trim());
    }
    setNewTaskTitle('');
    setNewTaskDesc('');
    setEditingTask(null);
    setTaskDialogOpen(false);
  };

  const handleOpenTaskDialog = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setTaskDialogOpen(true);
  };

  const handleOpenEditDialog = (task: Task) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setNewTaskDesc(task.description);
    setTaskDialogOpen(true);
  };

  const handleDeleteTask = async (wsId: string, taskId: string) => {
    await deleteTask(wsId, taskId);
  };

  return (
    <div className="shrink-0 p-4 pb-2 max-h-[180px] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">
          {t('detail.tasks', { count: issueTasks.length })}
        </h3>
        <Dialog open={taskDialogOpen} onOpenChange={(open) => { setTaskDialogOpen(open); if (!open) setEditingTask(null); }}>
          <DialogTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleOpenTaskDialog} />}>
            <Plus className="h-4 w-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTask ? t('detail.editTask') : t('detail.addTask')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder={t('detail.taskTitlePlaceholder') as string}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              />
              <Textarea
                placeholder={t('detail.taskDescriptionPlaceholder') as string}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                rows={3}
              />
              <Button onClick={handleCreateTask} disabled={!newTaskTitle.trim()} size="sm">
                {editingTask ? tc('save') : t('detail.addTask')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {issueTasks.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t('detail.noTasks')}</div>
      ) : (
        <DragDropProvider
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onDragEnd={(event: any) => {
            if (event.canceled) return;
            const source = event.operation?.source;
            const target = event.operation?.target;
            if (!source || !target || source.id === target.id) return;

            const ids = issueTasks.map((t) => t.id);
            const fromIdx = ids.indexOf(String(source.id));
            const toIdx = ids.indexOf(String(target.id));
            if (fromIdx === -1 || toIdx === -1) return;

            const reordered = Array.from(ids);
            const [moved] = reordered.splice(fromIdx, 1);
            reordered.splice(toIdx, 0, moved);

            reorderTasks(workspaceId, issue.id, reordered);
          }}
        >
          <div className="flex flex-wrap gap-2">
            {issueTasks.map((task, idx) => (
              <TaskRow
                key={task.id}
                task={task}
                index={idx}
                workspaceId={workspaceId}
                onRetry={retryTask}
                onCancel={cancelTask}
                onEdit={handleOpenEditDialog}
                onDelete={handleDeleteTask}
                tTask={tTask}
              />
            ))}
          </div>
        </DragDropProvider>
      )}
    </div>
  );
}
