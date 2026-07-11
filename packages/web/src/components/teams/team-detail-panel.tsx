"use client";

import type { AgentConfig } from "@agent-spaces/shared";
import type { TeamDetail, TeamView } from "@agent-spaces/sdk";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamMemberList } from "@/components/teams/team-member-list";

interface TeamDetailPanelProps {
  selectedTeam: TeamView | null;
  teamDetail: TeamDetail | null;
  selectedActorId: string;
  availableAgents: AgentConfig[];
  activeSessionId?: string;
  onEditTeam: (team: TeamView) => void;
  onDissolveTeam: (team: TeamView) => void;
  onRefreshDetail: (teamId: string) => void;
}

export function TeamDetailPanel({
  selectedTeam,
  teamDetail,
  selectedActorId,
  availableAgents,
  activeSessionId,
  onEditTeam,
  onDissolveTeam,
  onRefreshDetail,
}: TeamDetailPanelProps) {
  const t = useTranslations("teams");

  return (
    <section className="rounded-2xl border border-border bg-card p-4 h-full">
      {selectedTeam && teamDetail ? (
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <div>
              <h2 className="text-xl font-semibold">{teamDetail.team.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{teamDetail.team.description || t("detail.noDescription")}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEditTeam(selectedTeam)}>
                <Pencil className="size-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDissolveTeam(selectedTeam)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-sm font-medium">{t("detail.purpose")}</div>
            <p className="mt-1 text-sm text-muted-foreground">{teamDetail.team.purpose || t("detail.noPurpose")}</p>
          </div>

          <div className="rounded-xl border border-border p-3">
            <TeamMemberList
              teamId={selectedTeam.team_id}
              actorAgentId={selectedActorId}
              members={teamDetail.members_preview ?? []}
              agents={availableAgents}
              sessionId={activeSessionId}
              myRole={teamDetail.team.my_role}
              onChange={() => onRefreshDetail(selectedTeam.team_id)}
            />
          </div>

        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("empty.teamDetail")}
        </div>
      )}
    </section>
  );
}
