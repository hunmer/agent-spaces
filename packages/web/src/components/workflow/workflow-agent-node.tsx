'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { AgentIcon } from '@/components/common/agent-icon';

type AgentNodeData = {
  label: string;
  agentConfigId: string;
  role: string;
  avatarUrl?: string;
  modelId?: string;
  taskTitleTemplate?: string;
  taskDescriptionTemplate?: string;
};

type AgentNode = Node<AgentNodeData, 'agent'>;

const ROLE_COLORS: Record<string, string> = {
  agent: 'bg-gray-100 text-gray-700 border-gray-200',
  scheduler: 'bg-blue-100 text-blue-700 border-blue-200',
  task_creator: 'bg-green-100 text-green-700 border-green-200',
  bot: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

function WorkflowAgentNodeComponent({ data, selected }: NodeProps<AgentNode>) {
  const roleColor = ROLE_COLORS[data.role] || 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className={`rounded-lg border-2 bg-card p-3 shadow-sm min-w-[160px] transition-colors duration-150 ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-background hover:!bg-primary" />
      <div className="flex items-center gap-2.5">
        <AgentIcon
          avatarUrl={data.avatarUrl}
          name={data.label}
          className="size-8 rounded-md"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{data.label}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${roleColor}`}>
              {data.role}
            </Badge>
            {data.modelId && (
              <span className="text-[10px] text-muted-foreground truncate">{data.modelId}</span>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-background hover:!bg-primary" />
    </div>
  );
}

export const WorkflowAgentNode = memo(WorkflowAgentNodeComponent);
