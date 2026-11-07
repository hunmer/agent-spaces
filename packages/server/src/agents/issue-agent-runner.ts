import * as issueService from '../services/issue.js';
import * as agentService from '../services/agent.js';

function getIssueOwnerClientId(workspaceId: string, issueId: string): string {
  return `issue:${workspaceId}:${issueId}`;
}

export function hasActiveIssueAutomation(workspaceId: string): boolean {
  return agentService.list(workspaceId).some(
    (session) => session.status === 'active' && !['scheduler', 'bot'].includes(session.role),
  );
}

