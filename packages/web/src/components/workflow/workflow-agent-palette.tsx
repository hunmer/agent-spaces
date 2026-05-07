'use client';

import { useAgentStore } from '@/stores/agent';
import type { AgentConfig } from '@agent-spaces/shared';

const ROLE_LABELS: Record<string, string> = {
  planner: 'Planner', executor: 'Executor', reviewer: 'Reviewer',
  commit: 'Commit', custom: 'Custom', bot: 'Bot', scheduler: 'Scheduler',
};

function groupByRole(agents: AgentConfig[]): Record<string, AgentConfig[]> {
  const groups: Record<string, AgentConfig[]> = {};
  for (const agent of agents) {
    if (!agent.enabled) continue;
    const role = agent.role || 'custom';
    if (!groups[role]) groups[role] = [];
    groups[role].push(agent);
  }
  return groups;
}

export function WorkflowAgentPalette() {
  const agents = useAgentStore(s => s.agents);
  const grouped = groupByRole(agents);

  const onDragStart = (event: React.DragEvent, agent: AgentConfig) => {
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
              className="flex items-center gap-2 p-2 rounded-md bg-card border cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors mb-1">
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{agent.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {agent.modelId || agent.runtimeKind || agent.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {agents.filter(a => a.enabled).length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No agents configured.</p>
      )}
    </div>
  );
}
