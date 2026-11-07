'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Workflow } from '@agent-spaces/shared';
import { Workflow as WorkflowIcon } from 'lucide-react';
import { useWorkflowStore } from '@/stores/workflow';
import { WorkflowListDialog } from './workflow-list-dialog';

export function WorkflowPropertyEditor({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled: boolean;
  onChange: (value: Workflow) => void;
}) {
  const workflows = useWorkflowStore(state => state.workflows);
  const loadWorkflows = useWorkflowStore(state => state.loadWorkflows);
  const t = useTranslations('workflows');
  const [open, setOpen] = useState(false);
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const currentWorkflowId = searchParams.get('workflowId') ?? (params.id && params.id !== '_' ? params.id : undefined);
  const workflowId = typeof value === 'string' ? value : '';
  const selectedWorkflow = workflows.find(workflow => workflow.id === workflowId);

  useEffect(() => {
    if (workflows.length === 0) void loadWorkflows();
  }, [loadWorkflows, workflows.length]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-left text-xs shadow-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={selectedWorkflow ? 'truncate' : 'truncate text-muted-foreground'}>
          {selectedWorkflow?.name || t('nodes.sub_workflow.select')}
        </span>
      </button>
      <WorkflowListDialog
        open={open}
        workflows={workflows.filter(workflow => workflow.id !== currentWorkflowId)}
        mode="single"
        onConfirm={(selected) => {
          const workflow = selected[0];
          if (workflow) onChange(workflow);
        }}
        onCreate={() => {}}
        onClose={() => setOpen(false)}
        showCreate={false}
      />
    </>
  );
}
