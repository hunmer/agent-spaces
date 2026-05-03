'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent';

const PROVIDER_ICON_MAP: Record<string, string> = {
  'anthropic-messages': 'anthropic',
  'openai-chat-completions': 'openai',
  'openai-responses': 'openai',
  'gemini-generate-content': 'gemini',
};

export function getProviderIconUrl(modelProvider?: string): string {
  const iconName = PROVIDER_ICON_MAP[modelProvider ?? ''];
  return iconName ? `/static/provider-icons/${iconName}.svg` : '';
}

export interface AgentIconProps {
  /** Agent ID — will auto-resolve avatarUrl/modelProvider from store */
  agentId?: string;
  /** Display name (fallback to agent.name if agentId given) */
  name?: string;
  avatarUrl?: string;
  modelProvider?: string;
  className?: string;
  onClick?: () => void;
}

export function AgentIcon({ agentId, name, avatarUrl, modelProvider, className, onClick }: AgentIconProps) {
  const workspaceId = useWorkspaceId();
  const agents = useAgentStore((s) => s.agents);
  const ensure = useAgentStore((s) => s.ensure);

  useEffect(() => {
    if ((agentId || name) && workspaceId) ensure(workspaceId);
  }, [agentId, name, workspaceId, ensure]);

  const agent = agentId
    ? agents.find((a) => a.id === agentId)
    : name ? agents.find((a) => a.name === name || a.role === name) : undefined;
  const displayName = name || agent?.name || agentId || '?';
  const resolvedAvatarUrl = avatarUrl ?? agent?.avatarUrl;
  const resolvedProvider = modelProvider ?? agent?.modelProvider;
  const src = resolvedAvatarUrl || getProviderIconUrl(resolvedProvider);
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
        <img src={src} alt={displayName} className="size-full object-cover rounded-[inherit]" />
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
