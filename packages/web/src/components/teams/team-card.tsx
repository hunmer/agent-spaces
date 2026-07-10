"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Loader2, MoreVertical, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamView } from "@agent-spaces/sdk";
import { AgentIcon } from "@/components/common/agent-icon";
import { AvatarGroup } from "@/components/ui/avatar-group";

function badgeTone(value: string): "default" | "secondary" | "destructive" | "outline" {
  if (value === "active" || value === "done" || value === "read") return "default";
  if (value === "open" || value === "in_progress" || value === "running") return "secondary";
  if (value === "urgent" || value === "failed" || value === "dissolved") return "destructive";
  return "outline";
}

export type TeamCardMode = "active" | "archived";

interface AgentLike {
  id: string;
  name?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  modelId?: string;
  providerId?: string;
  modelProvider?: string;
}

interface TeamCardProps {
  team: TeamView;
  mode: TeamCardMode;
  selected?: boolean;
  onSelect?: (team: TeamView) => void;
  onEdit?: (team: TeamView) => void;
  onDelete?: (team: TeamView) => void;
  onRestore?: (team: TeamView) => void;
  agents: AgentLike[];
  archivedAtLabel?: string;
}

export function TeamCard({
  team,
  mode,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onRestore,
  agents,
  archivedAtLabel,
}: TeamCardProps) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const archived = mode === "archived";
  const running = !archived && (team.members_preview?.some((m) => m.runtime_status === "running") ?? false);

  const trigger = (
    <div
      onClick={(e) => {
        if (archived) return;
        e.stopPropagation();
        onSelect?.(team);
      }}
      className={`relative rounded-xl border px-3 py-3 text-left transition-colors ${
        archived
          ? "border-border opacity-70"
          : selected
            ? "cursor-pointer border-primary bg-primary/5"
            : "cursor-pointer border-border hover:bg-muted/50"
      }`}
    >
      {/* 右上角 dropdown 触发器 */}
      <div className="absolute right-2 top-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="more"
              >
                <MoreVertical className="size-4" />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            {archived ? (
              <>
                <DropdownMenuItem onClick={() => onRestore?.(team)}>
                  <RotateCcw className="size-4" />
                  {t("archived.restore")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete?.(team)}
                >
                  <Trash2 className="size-4" />
                  {tc("delete")}
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => onEdit?.(team)}>
                  <Pencil className="size-4" />
                  {tc("edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete?.(team)}
                >
                  <Trash2 className="size-4" />
                  {tc("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-start justify-between gap-3 pr-7">
        <div className="flex min-w-0 items-center gap-2.5">
          <AgentIcon
            name={team.name}
            avatarUrl={team.avatarUrl ?? team.avatar_url}
            icon={team.icon}
            className="size-9 shrink-0 rounded-lg"
            bordered
            rounded="rounded-lg"
            textSize="text-sm"
          />
          <div className="min-w-0">
            <div className="truncate font-medium">{team.name}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant={badgeTone(team.status)}>{t(`status.${team.status}`)}</Badge>
              <Badge variant={badgeTone(team.visibility)}>{t(`visibility.${team.visibility}`)}</Badge>
              {running ? (
                <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-xs text-emerald-600">
                  <Loader2 className="size-3 animate-spin" />
                  running
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        {!archived ? <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
      </div>

      {archived ? (
        <div className="mt-2 text-xs text-muted-foreground">{archivedAtLabel ?? ""}</div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("list.memberCount", { count: team.member_count })}
          </span>
          {team.members_preview && team.members_preview.length > 0 ? (
            <AvatarGroup
              size="sm"
              avatarUrls={team.members_preview.slice(0, 5).map((m) => {
                const agent = agents.find((a) => a.id === m.agent_id) ?? m.agent;
                const name = agent?.name || m.agent_id;
                return {
                  imageUrl: "",
                  name,
                  avatarNode: (
                    <AgentIcon
                      agentId={m.agent_id}
                      name={name}
                      avatarUrl={agent?.avatarUrl}
                      icon={agent?.icon}
                      apiBase={agent?.apiBase}
                      modelId={agent?.modelId}
                      providerId={agent?.providerId}
                      modelProvider={agent?.modelProvider}
                      className="size-5 rounded-full border object-cover"
                      rounded="rounded-full"
                    />
                  ) as ReactNode,
                };
              })}
            />
          ) : null}
        </div>
      )}
    </div>
  );

  return trigger;
}
