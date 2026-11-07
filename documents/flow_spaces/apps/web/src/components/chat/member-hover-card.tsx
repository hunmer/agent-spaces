"use client";

import { lazy, Suspense, type ReactNode } from "react";
import type { AgentConfig } from "@agent-spaces/shared";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { useAgentStore } from "@/stores/agent";

const MemberInfoCard = lazy(() =>
  import("./member-info-card").then((m) => ({ default: m.MemberInfoCard }))
);

interface MemberHoverCardProps {
  agentId: string;
  displayName?: string;
  channels?: string[];
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  onConfigure?: () => void;
  agent?: Partial<AgentConfig>;
  children: ReactNode;
}

export function MemberHoverCard({
  agentId,
  displayName,
  channels,
  side = "top",
  align = "start",
  onConfigure,
  agent: fallbackAgent,
  children,
}: MemberHoverCardProps) {
  const storeAgent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));
  const agent = storeAgent ? { ...fallbackAgent, ...storeAgent } : fallbackAgent;
  const backgroundSrc = agent?.backgroundUrl || '';

  return (
    <HoverCard>
      <HoverCardTrigger render={<div className="inline-flex items-center" />}>{children}</HoverCardTrigger>
      <HoverCardContent side={side} align={align} className={`w-72 relative overflow-hidden p-0 ${backgroundSrc ? 'border-0 shadow-none' : ''}`}>
        {backgroundSrc && (
          <img src={backgroundSrc} alt="" className="absolute inset-0 size-full object-cover opacity-90" />
        )}
        <div className={`relative z-10 p-3 ${backgroundSrc ? 'bg-popover/80' : ''}`}>
          <Suspense fallback={<div className="h-20" />}>
            <MemberInfoCard
              agentId={agentId}
              displayName={displayName}
              channels={channels}
              compact
              onConfigure={onConfigure}
              agent={agent}
            />
          </Suspense>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
