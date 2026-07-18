"use client";

import type { AgentConfig } from "@agent-spaces/shared";
import { useEffect, useState } from "react";
import type { TeamDetail, TeamRuntimeResponse, TeamView } from "@agent-spaces/sdk";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Pencil, Trash2, Clock, Loader2, Check, XCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamMemberList } from "@/components/teams/team-member-list";
import { Markdown } from "@/components/ui/markdown";
import { sdk } from "@/lib/sdk";

const SkyOfficeApp = dynamic(
  () => import("@/features/skyoffice/SkyOfficeApp").then((module) => module.SkyOfficeApp),
  { ssr: false },
);

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
  const [copied, setCopied] = useState(false);

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
    <section className="h-full w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 [contain:inline-size]">
      {selectedTeam && teamDetail ? (
        <div className="flex h-full w-full min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto">
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

          <div className="w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-xl border border-border p-3">
            <TeamMemberList
              teamId={selectedTeam.team_id}
              actorAgentId={selectedActorId}
              members={teamDetail.members_preview ?? []}
              agents={availableAgents}
              sessionId={activeSessionId}
              myRole={teamDetail.team.my_role}
              teamRunning={sessionDetail?.runtime.status === "running"}
              onChange={() => onRefreshDetail(selectedTeam.team_id)}
            />
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
                        {task.status === "running" ? (
                          <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-blue-500" />
                        ) : task.status === "completed" ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                        ) : task.status === "failed" ? (
                          <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                        ) : (
                          <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        )}
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{t("detail.finalOutput")}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(sessionDetail.runtime.output ?? "");
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch {
                          /* noop */
                        }
                      }}
                    >
                      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                  <div className="mt-2 max-h-[500px] overflow-auto">
                    <Markdown content={sessionDetail.runtime.output} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="w-full min-w-0 shrink-0 overflow-hidden rounded-xl border border-border bg-background">
            <SkyOfficeApp key={selectedTeam.team_id} teamId={selectedTeam.team_id} />
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
