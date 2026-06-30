"use client";

import { useTranslations } from "next-intl";
import { AgentIcon } from "@/components/common/agent-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bot, Copy, Trash2 } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import type { AgentPreset } from "./agent-shared";

const AGENT_GENERATOR_PRESET_ID = "agent-generator";
const AGENT_COMMIT_PRESET_ID = "commit-agent";
const AGENT_TITLE_GENERATOR_PRESET_ID = "title-generator";
const BUILT_IN_AGENT_IDS = new Set([
  AGENT_GENERATOR_PRESET_ID,
  AGENT_COMMIT_PRESET_ID,
  AGENT_TITLE_GENERATOR_PRESET_ID,
]);

export function AgentList({
  agents,
  onSelect,
  onDelete,
  onToggleEnabled,
}: {
  agents: AgentPreset[];
  onSelect: (agent: AgentPreset) => void;
  onDelete: (id: string) => void;
  onToggleEnabled?: (id: string) => void;
}) {
  const t = useTranslations('agent');
  const visibleAgents = agents.filter((agent) => !agent.hideInAgentList);
  const sortedAgents = [...visibleAgents].sort((a, b) => Number(!BUILT_IN_AGENT_IDS.has(a.id)) - Number(!BUILT_IN_AGENT_IDS.has(b.id)));
  return (
    <div className="flex flex-col p-2">
      {sortedAgents.map((agent) => {
        const fixed = BUILT_IN_AGENT_IDS.has(agent.id);
        return (
          <div
            key={agent.id}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors",
              !agent.enabled && !fixed && "opacity-50",
            )}
            onClick={() => onSelect(agent)}
          >
            <AgentIcon
              agentId={agent.id}
              name={agent.name}
              avatarUrl={agent.avatarUrl}
              icon={agent.icon}
              apiBase={agent.apiBase}
              className="size-8"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{agent.name}</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {fixed ? "system" : agent.role}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">{agent.modelId.split("-").slice(0, 2).join("-")}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{agent.description || t('list.noDescription')}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); copyToClipboard(agent.id); }}
            >
              <Copy className="size-3" />
            </Button>
            {!fixed && (
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDelete(agent.id); }}
              >
                <Trash2 className="size-3 text-destructive" />
              </Button>
            )}
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                size="sm"
                checked={fixed || agent.enabled}
                disabled={fixed}
                onCheckedChange={() => onToggleEnabled?.(agent.id)}
              />
            </div>
          </div>
        );
      })}
      {visibleAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bot className="size-10 mb-2 opacity-30" />
          <p className="text-sm">{t('list.empty')}</p>
        </div>
      )}
    </div>
  );
}
