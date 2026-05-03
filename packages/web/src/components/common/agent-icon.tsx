'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent';

export function getProviderIconUrl(providerName?: string): string {
  if (!providerName) return '';
  return `/static/provider-icons/${providerName.toLowerCase()}.svg`;
}

export interface AgentIconProps {
  agentId?: string;
  name?: string;
  avatarUrl?: string;
  modelProvider?: string;
  providerName?: string;
  className?: string;
  onClick?: () => void;
}

export function AgentIcon({ agentId, name, avatarUrl, modelProvider, providerName, className, onClick }: AgentIconProps) {
  const workspaceId = useWorkspaceId();
  const agents = useAgentStore((s) => s.agents);
  const ensure = useAgentStore((s) => s.ensure);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (agentId && workspaceId) ensure(workspaceId);
  }, [agentId, workspaceId, ensure]);

  const agent = agentId ? agents.find((a) => a.id === agentId) : undefined;
  const displayName = name || agent?.name || agentId || '?';
  const resolvedAvatarUrl = avatarUrl ?? agent?.avatarUrl;
  const resolvedProviderName = providerName ?? agent?.providerName;
  const src = resolvedAvatarUrl || (!imgError ? getProviderIconUrl(resolvedProviderName) : '');
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-lg bg-muted shrink-0',
        src && 'bg-transparent',
        !onClick && 'pointer-events-none',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className,
      )}
    >
      {src ? (
        <img src={src} alt={displayName} className="size-full object-cover rounded-[inherit]" onError={() => setImgError(true)} />
      ) : (
        <span className="text-xs font-semibold select-none">{initial}</span>
      )}
    </div>
  );
}

function useWorkspaceId() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const match = path.match(/\/workspace\/([^/]+)/);
  return match?.[1] ?? '';
}
