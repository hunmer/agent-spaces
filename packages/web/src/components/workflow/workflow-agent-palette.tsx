'use client';

import { useState, useCallback } from 'react';
import type { AgentConfig, WorkflowNode } from '@agent-spaces/shared';
import type { Node } from '@xyflow/react';
import { AgentDialog } from '@/components/sidebar/agent-dialog';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Eye, Plus, Terminal, ChevronRight } from 'lucide-react';

// XYFlow node types for the palette — data matches legacy agent/command shapes
type AgentNodeData = { label: string; agentConfigId: string; role: string; avatarUrl?: string; modelId?: string };
type CommandNodeData = { label: string; script: string };
type PaletteNode = Node<AgentNodeData, 'agent'> | Node<CommandNodeData, 'command'>;

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent', scheduler: 'Scheduler', bot: 'Bot',
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
  onNodeAdd?: (node: PaletteNode) => void;
}

export function WorkflowAgentPalette({ agents, onNodeAdd }: WorkflowAgentPaletteProps) {
  const uniqueAgents = agents.filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index);
  const grouped = groupByRole(uniqueAgents);
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

  const onCommandDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/x-workflow-command', 'true');
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleAddToCanvas = useCallback((agent: AgentConfig) => {
    if (!onNodeAdd) return;
    onNodeAdd({
      id: `node-${Date.now()}`,
      type: 'agent',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { label: agent.name, agentConfigId: agent.id, role: agent.role, avatarUrl: agent.avatarUrl, modelId: agent.modelId },
    });
  }, [onNodeAdd]);

  const handleAddCommand = useCallback(() => {
    if (!onNodeAdd) return;
    onNodeAdd({
      id: `node-${Date.now()}`,
      type: 'command',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { label: 'Command', script: '' },
    });
  }, [onNodeAdd]);

  const enabledAgents = uniqueAgents.filter(a => a.enabled);

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <div className="hidden md:block w-56 border-r bg-muted/30 p-3 overflow-y-auto">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Nodes</h3>

        {Object.entries(grouped).map(([role, roleAgents]) => (
          <Collapsible key={role} defaultOpen className="mb-1">
            <CollapsibleTrigger className="flex items-center gap-1 w-full text-left py-1 group/trigger cursor-pointer">
              <ChevronRight className="size-3 text-muted-foreground transition-transform [[data-panel-open]>&]:rotate-90" />
              <span className="text-[10px] font-medium uppercase text-muted-foreground/60 group-hover/trigger:text-muted-foreground">
                {ROLE_LABELS[role] || role}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {roleAgents.map(agent => (
                <div key={agent.id} draggable onDragStart={(e) => onDragStart(e, agent)}
                  className="group flex items-center gap-2 p-2 rounded-md bg-card border cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors mb-1 ml-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{agent.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {agent.modelId || agent.runtimeKind || agent.role}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openAgentDialog(agent); }}
                    className="shrink-0 flex items-center justify-center size-5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity cursor-pointer"
                  >
                    <Eye className="size-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}

        {/* Tools section */}
        <Collapsible defaultOpen className="mb-1 mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 w-full text-left py-1 group/trigger cursor-pointer">
            <ChevronRight className="size-3 text-muted-foreground transition-transform [[data-panel-open]>&]:rotate-90" />
            <span className="text-[10px] font-medium uppercase text-muted-foreground/60 group-hover/trigger:text-muted-foreground">
              Tools
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              draggable
              onDragStart={onCommandDragStart}
              className="group flex items-center gap-2 p-2 rounded-md bg-zinc-900 border border-zinc-700 cursor-grab active:cursor-grabbing hover:bg-zinc-800 transition-colors mb-1 ml-2"
            >
              <div className="flex items-center justify-center size-6 rounded bg-zinc-800 text-green-400">
                <Terminal className="size-3" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-100 font-mono">Command</div>
                <div className="text-[10px] text-zinc-400">Shell script node</div>
              </div>
              {onNodeAdd && (
                <button
                  type="button"
                  onClick={handleAddCommand}
                  className="shrink-0 flex items-center justify-center size-5 rounded hover:bg-zinc-700 transition-opacity cursor-pointer"
                >
                  <Plus className="size-3 text-zinc-400" />
                </button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

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
                className="flex items-center justify-center size-4 rounded hover:bg-accent cursor-pointer"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
        ))}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 shrink-0 cursor-grab active:cursor-grabbing"
          draggable
          onDragStart={onCommandDragStart}
        >
          <Terminal className="size-3 text-green-400" />
          <span className="text-xs font-medium whitespace-nowrap text-zinc-100">Command</span>
          {onNodeAdd && (
            <button type="button" onClick={handleAddCommand} className="flex items-center justify-center size-4 rounded hover:bg-zinc-700 cursor-pointer">
              <Plus className="size-3 text-zinc-400" />
            </button>
          )}
        </div>
        {enabledAgents.length === 0 && (
          <p className="text-xs text-muted-foreground">No agents configured.</p>
        )}
      </div>
      <AgentDialog open={dialogOpen} onOpenChange={handleDialogClose} initialAgentId={dialogAgentId} />
    </>
  );
}
