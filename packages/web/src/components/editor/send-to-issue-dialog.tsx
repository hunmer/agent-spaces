'use client';

import { useAgentStore } from '@/stores/agent';
import { useIssueStore } from '@/stores/issue';
import { useEditorSendStore } from '@/stores/editor-send';
import { CreateIssueDialog } from '@/components/issue/create-issue-dialog';

export function SendToIssueDialog() {
  const { pendingSendToIssue, setPendingSendToIssue } = useEditorSendStore();
  const { agents } = useAgentStore();
  const { createIssue } = useIssueStore();

  if (!pendingSendToIssue) return null;

  return (
    <CreateIssueDialog
      open
      onOpenChange={(open) => { if (!open) setPendingSendToIssue(null); }}
      agents={agents}
      defaultDescription={pendingSendToIssue.position}
      onSubmit={async (data) => {
        const issue = await createIssue(pendingSendToIssue.workspaceId, data.title, data.description, data.members, data.workflowId);
        setPendingSendToIssue(null);
        return issue;
      }}
    />
  );
}
