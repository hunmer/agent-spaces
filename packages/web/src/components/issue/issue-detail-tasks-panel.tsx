'use client';

import { WorkflowPreview } from '@/components/workflow/workflow-preview';

interface IssueDetailTasksPanelProps {
  issue: { workflowId?: string; title: string };
  t: (key: string, params?: Record<string, string | number | Date>) => string;
}

export function IssueDetailTasksPanel({
  issue,
  t,
}: IssueDetailTasksPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('detail.tasks', { count: issue.workflowId ? 1 : 0 })}</h3>
      </div>
      {!issue.workflowId ? (
        <div className="text-sm text-muted-foreground">{t('detail.noTasks')}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-background h-[720px]">
          <WorkflowPreview workflowId={issue.workflowId} />
        </div>
      )}
    </div>
  );
}
