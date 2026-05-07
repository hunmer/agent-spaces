"use client";

import { useTranslations } from "next-intl";
import { AgentIcon } from "@/components/common/agent-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Trash2 } from "lucide-react";
import type { AgentPreset } from "./agent-shared";

export function AgentList({
  agents,
  onSelect,
  onDelete,
}: {
  agents: AgentPreset[];
  onSelect: (agent: AgentPreset) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('agent');
  return (
    <div className="flex flex-col p-2">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
          onClick={() => onSelect(agent)}
        >
          <AgentIcon
            name={agent.name}
            avatarUrl={agent.avatarUrl}
            apiBase={agent.apiBase}
            className="size-8"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{agent.name}</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {agent.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{agent.description || t('list.noDescription')}</p>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{agent.modelId.split("-").slice(0, 2).join("-")}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onDelete(agent.id); }}
          >
            <Trash2 className="size-3 text-destructive" />
          </Button>
        </div>
      ))}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bot className="size-10 mb-2 opacity-30" />
          <p className="text-sm">{t('list.empty')}</p>
        </div>
      )}
    </div>
  );
}
