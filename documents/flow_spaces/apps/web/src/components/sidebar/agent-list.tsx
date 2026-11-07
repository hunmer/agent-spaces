"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bot, Copy as CloneIcon, Trash2 } from "lucide-react";
import type { AgentPreset } from "./agent-shared";
import { AgentCard } from "./agent-card";
import type { FeatureCardColor } from "@/components/ui/feature-card";

const AGENT_COLORS: FeatureCardColor[] = ["orange", "purple", "blue", "green"];
function colorForAgent(id: string): FeatureCardColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[hash % AGENT_COLORS.length];
}

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
  onClone,
}: {
  agents: AgentPreset[];
  onSelect: (agent: AgentPreset) => void;
  onDelete: (id: string) => void;
  onToggleEnabled?: (id: string) => void;
  onClone?: (agent: AgentPreset) => void;
}) {
  const t = useTranslations('agent');
  const visibleAgents = agents.filter((agent) => !agent.hideInAgentList);
  const sortedAgents = [...visibleAgents].sort((a, b) => Number(!BUILT_IN_AGENT_IDS.has(a.id)) - Number(!BUILT_IN_AGENT_IDS.has(b.id)));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2">
      {sortedAgents.map((agent) => {
        const fixed = BUILT_IN_AGENT_IDS.has(agent.id);
        return (
          <AgentCard
            key={agent.id}
            agentId={agent.id}
            color={fixed ? "default" : colorForAgent(agent.id)}
            name={agent.name}
            description={agent.description || t('list.noDescription')}
            avatarUrl={agent.avatarUrl}
            icon={agent.icon}
            apiBase={agent.apiBase}
            muted={!agent.enabled && !fixed}
            onClick={() => onSelect(agent)}
            meta={
              <>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {fixed ? "system" : agent.role}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">{agent.modelId.split("-").slice(0, 2).join("-")}</span>
              </>
            }
            corner={
              <Switch
                size="sm"
                checked={fixed || agent.enabled}
                disabled={fixed}
                onCheckedChange={() => onToggleEnabled?.(agent.id)}
              />
            }
            actions={
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title={t('list.clone')}
                  onClick={(e) => { e.stopPropagation(); onClone?.(agent); }}
                >
                  <CloneIcon className="size-3" />
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
              </>
            }
          />
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
