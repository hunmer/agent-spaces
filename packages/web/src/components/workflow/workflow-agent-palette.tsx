'use client';

import { useState } from 'react';
import type { AgentConfig } from '@agent-spaces/shared';
import type { Node } from '@xyflow/react';
import type { WorkflowNode } from '@agent-spaces/shared';
import { AgentDialog } from '@/components/sidebar/agent-dialog';
import { Eye, Plus } from 'lucide-react';

type AgentNodeData = WorkflowNode['data'];
type AgentNode = Node<AgentNodeData, 'agent'>;

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent', scheduler: 'Scheduler', task_creator: 'Task Creator', bot: 'Bot',
};

function groupByRole(agents: AgentConfig[]): Record<string, AgentConfig[]> {
  const groups: Record<string, AgentConfig[]> = {};
  for (const agent of agents) {
    if (!agent.enabled) continue;
    const role = agent.role || 'agent';
    if (!groups[role]) groups[role] = [];
    groups[role].push(agent);
  }
  return groups;
}

interface WorkflowAgentPaletteProps {
  agents: AgentConfig[];
  onNodeAdd?: (node: AgentNode) => void;
}

export function WorkflowAgentPalette({ agents, onNodeAdd }: WorkflowAgentPaletteProps) {
  const grouped = groupByRole(agents);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAgentId, setDialogAgentId] = useState<string | undefined>();

  const openAgentDialog = (agent: AgentConfig) => {
    setDialogAgentId(agent.id);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setDialogAgentId(undefined);
  };

  const onDragStart = (event: React.DragEvent, agent: AgentConfig) => {
    event.dataTransfer.setData('application/json', JSON.stringify(agent));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleAddToCanvas = (agent: AgentConfig) => {
    if (!onNodeAdd) return;
    onNodeAdd({
      id: `node-${Date.now()}`,
      type: 'agent',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { label: agent.name, agentConfigId: agent.id, role: agent.role, avatarUrl: agent.avatarUrl, modelId: agent.modelId },
    });
  };

  // Mobile: horizontal scrollable strip
  const enabledAgents = agents.filter(a => a.enabled);

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <div className="hidden md:block w-56 border-r bg-muted/30 p-3 overflow-y-auto">
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
        {enabledAgents.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No agents configured.</p>
        )}
      </div>
      {/* Mobile: horizontal strip */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b bg-muted/30 overflow-x-auto shrink-0">
        {enabledAgents.map(agent => (
          <div key={agent.id}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-card border shrink-0 cursor-grab active:cursor-grabbing"
            draggable
            onDragStart={(e) => onDragStart(e, agent)}
          >
            <span className="text-xs font-medium whitespace-nowrap">{agent.name}</span>
            {onNodeAdd && (
              <button
                type="button"
                onClick={() => handleAddToCanvas(agent)}
                className="flex items-center justify-center size-4 rounded hover:bg-accent"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
        ))}
        {enabledAgents.length === 0 && (
          <p className="text-xs text-muted-foreground">No agents configured.</p>
        )}
      </div>
      <AgentDialog open={dialogOpen} onOpenChange={handleDialogClose} initialAgentId={dialogAgentId} />
    </>
  );
}
