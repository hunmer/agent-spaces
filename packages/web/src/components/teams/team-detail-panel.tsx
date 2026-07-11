"use client";

import type { AgentConfig } from "@agent-spaces/shared";
import { useEffect, useState } from "react";
import type { TeamDetail, TeamRuntimeResponse, TeamView } from "@agent-spaces/sdk";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeamMemberList } from "@/components/teams/team-member-list";
import { sdk } from "@/lib/sdk";

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
  const [sessionDetail, setSessionDetail] = useState<TeamRuntimeResponse | null>(null);

  useEffect(() => {
    if (!selectedTeam?.team_id || !activeSessionId) {
      setSessionDetail(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const detail = await sdk.team.getRuntime(selectedTeam.team_id, "admin", activeSessionId);
        if (!cancelled) setSessionDetail(detail);
      } catch {
        if (!cancelled) setSessionDetail(null);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSessionId, selectedTeam?.team_id]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 h-full">
      {selectedTeam && teamDetail ? (
        <div className="flex h-full flex-col gap-4 overflow-auto">
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

          {activeSessionId ? (
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-sm font-medium">{t("detail.tasks")}</div>
              {sessionDetail?.tasks.length ? (
                <div className="mt-2 space-y-2">
                  {sessionDetail.tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-border p-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{task.title}</span>
                        <Badge variant="outline">{t(`detail.taskStatus.${task.status}`)}</Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground">{task.assigneeAgentId}</div>
                      {task.agentSessionId ? <div className="mt-1 break-all font-mono text-muted-foreground">{task.agentSessionId}</div> : null}
                      {task.error ? <div className="mt-1 text-destructive">{task.error}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">{t("detail.noTasks")}</div>
              )}

              {sessionDetail?.runtime.output ? (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-sm font-medium">{t("detail.finalOutput")}</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-5">{sessionDetail.runtime.output}</pre>
                </div>
              ) : null}
            </div>
          ) : null}

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
