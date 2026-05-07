'use client';

import { useState } from 'react';
import type { AgentConfig } from '@agent-spaces/shared';
import { AgentDialog } from '@/components/sidebar/agent-dialog';
import { Eye } from 'lucide-react';

interface AgentWithWorkspace extends AgentConfig {
  workspaceId: string;
}

const ROLE_LABELS: Record<string, string> = {
  planner: 'Planner', executor: 'Executor', reviewer: 'Reviewer',
  commit: 'Commit', custom: 'Custom', bot: 'Bot', scheduler: 'Scheduler',
};

function groupByRole(agents: AgentWithWorkspace[]): Record<string, AgentWithWorkspace[]> {
  const groups: Record<string, AgentWithWorkspace[]> = {};
  for (const agent of agents) {
    if (!agent.enabled) continue;
    const role = agent.role || 'custom';
    if (!groups[role]) groups[role] = [];
    groups[role].push(agent);
  }
  return groups;
}

export function WorkflowAgentPalette({ agents }: { agents: AgentWithWorkspace[] }) {
  const grouped = groupByRole(agents);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogWorkspaceId, setDialogWorkspaceId] = useState('');
  const [dialogAgentId, setDialogAgentId] = useState<string | undefined>();

  const openAgentDialog = (agent: AgentWithWorkspace) => {
    setDialogWorkspaceId(agent.workspaceId);
    setDialogAgentId(agent.id);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setDialogAgentId(undefined);
  };

  const onDragStart = (event: React.DragEvent, agent: AgentWithWorkspace) => {
    event.dataTransfer.setData('application/json', JSON.stringify(agent));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 border-r bg-muted/30 p-3 overflow-y-auto">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Agents</h3>
      {Object.entries(grouped).map(([role, roleAgents]) => (
        <div key={role} className="mb-3">
          <div className="text-[10px] font-medium uppercase text-muted-foreground/60 mb-1.5">
            {ROLE_LABELS[role] || role}
          </div>
          {roleAgents.map(agent => (
            <div key={agent.id} draggable onDragStart={(e) => onDragStart(e, agent)}
              className="group flex items-center gap-2 p-2 rounded-md bg-card border cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors mb-1">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{agent.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {agent.modelId || agent.runtimeKind || agent.role}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openAgentDialog(agent); }}
                className="shrink-0 flex items-center justify-center size-5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
              >
                <Eye className="size-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      ))}
      {agents.filter(a => a.enabled).length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No agents configured.</p>
      )}
      <AgentDialog open={dialogOpen} onOpenChange={handleDialogClose} workspaceId={dialogWorkspaceId} initialAgentId={dialogAgentId} />
    </div>
  );
}
