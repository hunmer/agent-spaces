'use client';

import { AgentIcon } from '@/components/common/agent-icon';

interface MemberCardProps {
  name: string;
  agentId?: string;
  description?: string;
  onClick?: () => void;
}

export function MemberCard({ name, agentId, description, onClick }: MemberCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left transition-colors cursor-pointer"
    >
      <AgentIcon agentId={agentId} name={name} className="size-7 rounded-full" />
      <span className="min-w-0">
        <span className="block text-sm truncate">{name}</span>
        {description && <span className="block text-xs text-muted-foreground truncate">{description}</span>}
      </span>
    </button>
  );
}
