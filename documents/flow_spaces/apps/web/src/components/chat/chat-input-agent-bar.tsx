"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { IconUserPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { AgentIcon } from "@/components/common/agent-icon";
import { useChatStore } from "@/stores/chat";
import { MemberHoverCard } from "./member-hover-card";
import type { MentionedAgent } from "./chat-input-utils";
import { ShinyBadge } from "@/components/ui/shiny-badge";
import { AddChatAgentDialog } from "./add-chat-agent-dialog";
import type { ChatAgent, TeamView } from "@agent-spaces/sdk";
import { TeamHoverCard } from "@/components/teams/team-hover-card";

interface ChatInputAgentBarProps {
  agents: MentionedAgent[];
  activeAgent?: MentionedAgent;
  lastActiveAgentId?: string;
  onActivateAgent: (agent: MentionedAgent) => void;
  onOpenAddMember: () => void;
  onAgentActivated?: (agent: MentionedAgent) => void;
  onConfigureAgent?: (agentId: string, agent?: MentionedAgent) => void;
  teams?: TeamView[];
  activeMentionId?: string;
}

export function ChatInputAgentBar({
  agents,
  activeAgent,
  lastActiveAgentId: _lastActiveAgentId,
  onActivateAgent,
  onOpenAddMember,
  onAgentActivated,
  onConfigureAgent,
  teams = [],
  activeMentionId,
}: ChatInputAgentBarProps) {
  const t = useTranslations("chat");
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const storeAgents = useChatStore((s) => s.agents);
  const updateAgent = useChatStore((s) => s.updateAgent);
  const visibleAgents = [...new Map(agents.map((agent) => [agent.id, agent])).values()];
  const configAgent = configAgentId
    ? storeAgents.find((agent) => agent.id === configAgentId) ?? toChatAgent(visibleAgents.find((agent) => agent.id === configAgentId))
    : undefined;

  return (
    <>
      <div className="flex items-center gap-1 mb-1.5">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0 ms-2">
          <button
            type="button"
            onClick={onOpenAddMember}
            className="shrink-0 inline-flex items-center justify-center size-6 rounded-full text-muted-foreground border border-dashed border-muted-foreground/40 hover:bg-accent hover:text-foreground transition-all cursor-pointer"
            title={t("input.manageMembers")}
          >
            <IconUserPlus className="size-3.5" />
          </button>
          {visibleAgents.map((agent) => {
            const isActive = agent.id === activeAgent?.id;
            return (
              <MemberHoverCard
                key={agent.id}
                agentId={agent.id}
                displayName={agent.name || agent.role}
                side="top"
                align="start"
                onConfigure={() => {
                  if (onConfigureAgent) {
                    onConfigureAgent(agent.id, agent);
                    return;
                  }
                  setConfigAgentId(agent.id);
                }}
                agent={agent}
              >
                <ShinyBadge
                  shiny={isActive}
                  shinySpeed={3}
                  onClick={() => { onActivateAgent(agent); onAgentActivated?.(agent); }}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 h-6 pl-0.5 pr-1.5 rounded-full text-xs transition-all cursor-pointer",
                    !isActive && "dark:!text-gray-200",
                    isActive && "bg-primary/10 text-primary border border-primary/30"
                  )}
                >
                  <AgentIcon
                    agentId={agent.id}
                    name={agent.name || agent.role}
                    avatarUrl={agent.avatarUrl}
                    icon={agent.icon}
                    apiBase={agent.apiBase}
                    modelId={agent.modelId}
                    providerId={agent.providerId}
                    modelProvider={agent.modelProvider}
                    className="size-5 rounded-full text-[9px]"
                  />
                  <span className="max-w-[80px] truncate">{agent.name || agent.role}</span>
                </ShinyBadge>
              </MemberHoverCard>
            );
          })}
          {teams.map((team) => {
            const mention: MentionedAgent = {
              id: `team:${team.team_id}`,
              name: team.name,
              role: 'team',
              description: team.description,
              enabled: true,
              kind: 'team',
            };
            const isActive = mention.id === activeMentionId;
            return (
              <TeamHoverCard key={team.team_id} team={team}>
                <ShinyBadge
                  shiny={isActive}
                  shinySpeed={3}
                  onClick={() => onActivateAgent(mention)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 h-6 pl-0.5 pr-1.5 rounded-full text-xs transition-all cursor-pointer",
                    !isActive && "dark:!text-gray-200",
                    isActive && "bg-primary/10 text-primary border border-primary/30"
                  )}
                >
                  <AgentIcon
                    name={team.name}
                    avatarUrl={team.avatarUrl ?? team.avatar_url}
                    icon={team.icon}
                    className="size-5 rounded-full text-[9px]"
                  />
                  <span className="max-w-[80px] truncate">{team.name}</span>
                </ShinyBadge>
              </TeamHoverCard>
            );
          })}
        </div>
      </div>
      {!onConfigureAgent && (
        <AddChatAgentDialog
          open={Boolean(configAgent)}
          onOpenChange={(open) => { if (!open) setConfigAgentId(null); }}
          initialData={configAgent}
          onSubmit={async (data) => {
            if (!configAgentId) return;
            await updateAgent(configAgentId, data);
            setConfigAgentId(null);
          }}
        />
      )}
    </>
  );
}

function toChatAgent(agent?: MentionedAgent): ChatAgent | undefined {
  if (!agent) return undefined;
  const { kind: _kind, ...config } = agent;
  return {
    ...config,
    name: agent.name || agent.role || agent.id,
    role: "agent",
    model: agent.modelId || "",
    runtimeKind: agent.runtimeKind === 'langchain' ? 'langchain' : undefined,
    createdAt: "",
    updatedAt: "",
  };
}
