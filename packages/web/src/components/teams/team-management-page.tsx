"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { Team, TeamMembership } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { sdk } from "@/lib/sdk";
import { useAgentStore } from "@/stores/agent";
import { CreateTeamDialog, type TeamFormDefaults, type TeamFormValues } from "@/components/teams/create-team-dialog";
import { TeamMemberList } from "@/components/teams/team-member-list";
import { TeamChatPanel } from "@/components/teams/team-chat-panel";

type TeamView = Team & {
  team_id: string;
  created_by: string;
  created_at: string;
  member_count: number;
  my_role: string | null;
  dissolved_at?: string;
};

type TeamMembershipView = TeamMembership & {
  membership_id: string;
  team_id: string;
  agent_id: string;
  joined_at: string;
  updated_at: string;
};

type TeamDetail = {
  team: TeamView;
  members_preview?: TeamMembershipView[];
  stats: {
    unread_count: number;
    active_member_count: number;
    last_activity_at: string | null;
  };
};

type TeamApiResponse<T> = {
  success: boolean;
  code: string;
  message: string;
  data?: T;
};

async function requestTeamApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await sdk.http.raw(path, init);
  const payload = await response.json() as TeamApiResponse<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.message || response.statusText);
  }
  return payload.data;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function badgeTone(value: string): "default" | "secondary" | "destructive" | "outline" {
  if (value === "active" || value === "done" || value === "read") return "default";
  if (value === "open" || value === "in_progress" || value === "running") return "secondary";
  if (value === "urgent" || value === "failed" || value === "dissolved") return "destructive";
  return "outline";
}

export type TeamManagementPageHandle = {
  openCreateDialog: () => void;
  openCreateDialogWithDefaults: (defaults: TeamFormDefaults) => void;
};

export const TeamManagementPage = forwardRef<TeamManagementPageHandle, {
  embedded?: boolean;
  onCanCreateChange?: (canCreate: boolean) => void;
}>(function TeamManagementPage({
  embedded = false,
  onCanCreateChange,
}, ref) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const ensureAgents = useAgentStore((store) => store.ensure);
  const agents = useAgentStore((store) => store.agents);
  const [selectedActorId, setSelectedActorId] = useState("");
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [archivedTeams, setArchivedTeams] = useState<TeamView[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [error, setError] = useState("");
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaults, setDialogDefaults] = useState<TeamFormDefaults | undefined>(undefined);
  const [editingTeam, setEditingTeam] = useState<TeamView | null>(null);
  const [infoSidebarOpen, setInfoSidebarOpen] = useState(true);

  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.enabled !== false),
    [agents],
  );
  const selectedTeam = teams.find((team) => team.team_id === selectedTeamId) ?? null;
  const canCreateTeam = Boolean(selectedActorId);

  useEffect(() => {
    onCanCreateChange?.(canCreateTeam);
  }, [canCreateTeam, onCanCreateChange]);

  useImperativeHandle(ref, () => ({
    openCreateDialog,
    openCreateDialogWithDefaults,
  }), []);

  useEffect(() => {
    void ensureAgents();
  }, [ensureAgents]);

  useEffect(() => {
    if (!selectedActorId && availableAgents[0]?.id) {
      setSelectedActorId(availableAgents[0].id);
    }
  }, [availableAgents, selectedActorId]);

  const loadTeams = useCallback(async (nextSelectedTeamId?: string) => {
    setLoadingTeams(true);
    setError("");
    try {
      const data = await requestTeamApi<{ teams: TeamView[] }>(
        `/api/teams?actor_agent_id=${encodeURIComponent(selectedActorId)}&scope=visible&page_size=100`,
      );
      setTeams(data.teams);
      const nextId = nextSelectedTeamId && data.teams.some((item) => item.team_id === nextSelectedTeamId)
        ? nextSelectedTeamId
        : data.teams.find((item) => item.team_id === selectedTeamId)?.team_id ?? data.teams[0]?.team_id ?? "";
      setSelectedTeamId(nextId);
      if (!nextId) {
        setTeamDetail(null);
      }
    } catch (err) {
      setTeams([]);
      setSelectedTeamId("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTeams(false);
    }
  }, [selectedActorId, selectedTeamId]);

  const loadArchivedTeams = useCallback(async () => {
    if (!selectedActorId) {
      setArchivedTeams([]);
      return;
    }
    setLoadingArchived(true);
    try {
      const data = await requestTeamApi<{ teams: TeamView[] }>(
        `/api/teams?actor_agent_id=${encodeURIComponent(selectedActorId)}&archived=true&page_size=100`,
      );
      setArchivedTeams(data.teams);
    } catch {
      setArchivedTeams([]);
    } finally {
      setLoadingArchived(false);
    }
  }, [selectedActorId]);

  const loadTeamDetail = useCallback(async (teamId: string) => {
    try {
      const data = await requestTeamApi<TeamDetail>(
        `/api/teams/${teamId}?actor_agent_id=${encodeURIComponent(selectedActorId)}&include_members_preview=true`,
      );
      setTeamDetail(data);
    } catch (err) {
      setTeamDetail(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedActorId]);

  useEffect(() => {
    if (!selectedActorId) return;
    void loadTeams();
    void loadArchivedTeams();
  }, [loadTeams, loadArchivedTeams, selectedActorId]);

  useEffect(() => {
    if (!selectedActorId || !selectedTeamId) {
      setTeamDetail(null);
      return;
    }
    void loadTeamDetail(selectedTeamId);
  }, [loadTeamDetail, selectedActorId, selectedTeamId]);

  function openCreateDialog() {
    setDialogMode("create");
    setDialogDefaults(undefined);
    setEditingTeam(null);
    setDialogOpen(true);
  }

  function openCreateDialogWithDefaults(defaults: TeamFormDefaults) {
    setDialogMode("create");
    setDialogDefaults(defaults);
    setEditingTeam(null);
    setDialogOpen(true);
  }

  function openEditDialog(team: TeamView) {
    setDialogMode("edit");
    setEditingTeam(team);
    setDialogDefaults(undefined);
    setDialogOpen(true);
  }

  async function submitTeam(values: TeamFormValues) {
    if (!selectedActorId) return;
    setSavingTeam(true);
    setError("");
    try {
      if (dialogMode === "create") {
        const data = await requestTeamApi<{ team: TeamView }>(`/api/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_agent_id: selectedActorId,
            name: values.name,
            description: values.description,
            purpose: values.purpose,
            visibility: values.visibility,
            initial_members: values.members
              .filter((id) => id !== selectedActorId)
              .map((agent_id) => ({ agent_id, role: "member" })),
          }),
        });
        await loadTeams(data.team.team_id);
      } else if (selectedTeamId) {
        const data = await requestTeamApi<{ team: TeamView }>(`/api/teams/${selectedTeamId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_agent_id: selectedActorId,
            name: values.name,
            description: values.description,
            purpose: values.purpose,
            visibility: values.visibility,
          }),
        });
        await loadTeams(data.team.team_id);
      }
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTeam(false);
    }
  }

  async function dissolveTeam(team: TeamView) {
    if (!selectedActorId) return;
    if (!confirm(t("deleteConfirm", { name: team.name }))) return;
    setError("");
    try {
      await requestTeamApi<{ team_id: string }>(`/api/teams/${team.team_id}/dissolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_agent_id: selectedActorId,
          confirm: true,
        }),
      });
      await loadTeams(team.team_id === selectedTeamId ? undefined : selectedTeamId);
      void loadArchivedTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className={embedded ? "flex h-full flex-col" : "flex min-h-dvh w-full flex-col"}>
      <main className={embedded ? "flex size-full flex-1 flex-col gap-4 px-4 py-4 sm:px-6" : "mx-auto flex size-full flex-1 flex-col gap-4 px-4 py-6 sm:px-6"}>
        {!embedded ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold">{t("title")}</h1>
                <p className="text-sm text-muted-foreground">{t("description")}</p>
              </div>
              <Button onClick={openCreateDialog} disabled={!canCreateTeam}>
                <Plus className="size-4" />
                {t("newTeam")}
              </Button>
            </div>
          </div>
        ) : null}

        {!selectedActorId ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("empty.setup")}
          </div>
        ) : (
          <div className={cn(
            "grid flex-1 gap-4 xl:grid-cols-2",
            infoSidebarOpen ? "xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,1.1fr)]" : "xl:grid-cols-[320px_minmax(0,1fr)]",
          )}>
            <section className="flex flex-col rounded-2xl border border-border bg-card p-4">
              {error ? (
                <div className="mb-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
              <div className="mb-3 mt-4 flex items-center justify-between">
                <h2 className="font-medium">{t("list.title")}</h2>
                {loadingTeams || loadingArchived ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              </div>
              <Tabs defaultValue="active" className="min-h-0 flex-1 flex-col gap-2">
                <TabsList className="self-start">
                  <TabsTrigger value="active">{t("tabs.active")}</TabsTrigger>
                  <TabsTrigger value="archived">{t("tabs.archived")}</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="min-h-0 flex-1 overflow-auto">
                  {teams.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      {t("empty.teams")}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {teams.map((team) => (
                        <button
                          key={team.team_id}
                          type="button"
                          onClick={() => setSelectedTeamId(team.team_id)}
                          className={`rounded-xl border px-3 py-3 text-left transition-colors ${team.team_id === selectedTeamId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{team.name}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant={badgeTone(team.status)}>{t(`status.${team.status}`)}</Badge>
                                <Badge variant={badgeTone(team.visibility)}>{t(`visibility.${team.visibility}`)}</Badge>
                              </div>
                            </div>
                            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {t("list.memberCount", { count: team.member_count })} · {t("list.role", { role: team.my_role ?? t("list.noRole") })}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="archived" className="min-h-0 flex-1 overflow-auto">
                  {archivedTeams.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      {t("empty.archived")}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {archivedTeams.map((team) => (
                        <div
                          key={team.team_id}
                          className="rounded-xl border border-border px-3 py-3 text-left opacity-70"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{team.name}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant={badgeTone(team.status)}>{t(`status.${team.status}`)}</Badge>
                                <Badge variant={badgeTone(team.visibility)}>{t(`visibility.${team.visibility}`)}</Badge>
                              </div>
                            </div>
                            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {team.dissolved_at ? `${t("list.archivedAt")} ${formatTime(team.dissolved_at)}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </section>

            <TeamChatPanel
              teamId={selectedTeamId}
              actorAgentId={selectedActorId}
              sidebarOpen={infoSidebarOpen}
              onToggleSidebar={() => setInfoSidebarOpen((v) => !v)}
            />

            {infoSidebarOpen ? (
            <section className="rounded-2xl border border-border bg-card p-4">
              {selectedTeam && teamDetail ? (
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{teamDetail.team.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{teamDetail.team.description || t("detail.noDescription")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(selectedTeam)}>
                        <Pencil className="size-4" />
                        {tc("edit")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void dissolveTeam(selectedTeam)}>
                        <Trash2 className="size-4" />
                        {tc("delete")}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border p-3">
                      <div className="text-xs text-muted-foreground">{t("detail.stats.members")}</div>
                      <div className="mt-1 text-lg font-semibold">{teamDetail.stats.active_member_count}</div>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <div className="text-xs text-muted-foreground">{t("detail.stats.unread")}</div>
                      <div className="mt-1 text-lg font-semibold">{teamDetail.stats.unread_count}</div>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <div className="text-xs text-muted-foreground">{t("detail.stats.activity")}</div>
                      <div className="mt-1 text-sm font-medium">{formatTime(teamDetail.stats.last_activity_at)}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    <div className="text-sm font-medium">{t("detail.purpose")}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{teamDetail.team.purpose || t("detail.noPurpose")}</p>
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    <TeamMemberList
                      teamId={selectedTeam.team_id}
                      actorAgentId={selectedActorId}
                      members={teamDetail.members_preview ?? []}
                      agents={availableAgents}
                      myRole={teamDetail.team.my_role}
                      onChange={() => void loadTeamDetail(selectedTeam.team_id)}
                    />
                  </div>

                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("empty.teamDetail")}
                </div>
              )}
            </section>
            ) : null}

          </div>
        )}
      </main>

      <CreateTeamDialog
        open={dialogOpen}
        mode={dialogMode}
        loading={savingTeam}
        agents={availableAgents}
        defaultValues={dialogMode === "create" ? dialogDefaults : undefined}
        editTarget={
          dialogMode === "edit" && editingTeam
            ? {
                name: editingTeam.name,
                description: editingTeam.description,
                purpose: editingTeam.purpose,
                visibility: editingTeam.visibility,
              }
            : null
        }
        onOpenChange={setDialogOpen}
        onSubmit={submitTeam}
      />
    </div>
  );
});
