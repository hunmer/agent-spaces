"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { IconUserPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { AgentIcon } from "@/components/common/agent-icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AgentEditor } from "@/components/sidebar/agent-editor";
import { normalizeAgent } from "@/components/sidebar/agent-shared";
import { useAgentStore } from "@/stores/agent";
import { MemberHoverCard } from "./member-hover-card";
import type { MentionedAgent } from "./chat-input-utils";
import { ShinyBadge } from "@/components/ui/shiny-badge";

interface ChatInputAgentBarProps {
  agents: MentionedAgent[];
  activeAgent?: MentionedAgent;
  lastActiveAgentId?: string;
  onActivateAgent: (agent: MentionedAgent) => void;
  onOpenAddMember: () => void;
  onAgentActivated?: (agent: MentionedAgent) => void;
}

export function ChatInputAgentBar({
  agents,
  activeAgent,
  lastActiveAgentId,
  onActivateAgent,
  onOpenAddMember,
  onAgentActivated,
}: ChatInputAgentBarProps) {
  const t = useTranslations("chat");
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const storeAgents = useAgentStore((s) => s.agents);
  const visibleAgents = [...new Map(agents.map((agent) => [agent.id, agent])).values()];

  return (
    <>
      <div className="flex items-center gap-1 mb-1.5">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
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
              <MemberHoverCard key={agent.id} agentId={agent.id} displayName={agent.name || agent.role} side="top" align="start" onConfigure={() => setConfigAgentId(agent.id)}>
                <ShinyBadge
                  shiny={isActive}
                  shinySpeed={3}
                  onClick={() => { onActivateAgent(agent); onAgentActivated?.(agent); }}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 h-6 pl-0.5 pr-1.5 rounded-full text-xs transition-all cursor-pointer",
                    isActive && "bg-primary/10 text-primary border border-primary/30"
                  )}
                >
                  <AgentIcon
                    agentId={agent.id}
                    name={agent.name || agent.role}
                    avatarUrl={agent.avatarUrl}
                    className="size-5 rounded-full text-[9px]"
                  />
                  <span className="max-w-[80px] truncate">{agent.name || agent.role}</span>
                </ShinyBadge>
              </MemberHoverCard>
            );
          })}
        </div>
      </div>
      {configAgentId && (() => {
        const agent = storeAgents.find((a) => a.id === configAgentId);
        if (!agent) return null;
        return (
          <Dialog open={Boolean(configAgentId)} onOpenChange={(open) => { if (!open) setConfigAgentId(null); }}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="border-b px-5 py-3">
                <DialogTitle>{t('messageItem.configureAgent')}</DialogTitle>
                <DialogDescription />
              </DialogHeader>
              <AgentEditor
                agent={normalizeAgent(agent)}
                onSaved={() => setConfigAgentId(null)}
                onBack={() => setConfigAgentId(null)}
                showFooter
              />
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}
