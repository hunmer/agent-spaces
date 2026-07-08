"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Team, TeamInboxItem, TeamMembership, TeamMessage, Workspace } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Loader2, MessagesSquare, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { sdk } from "@/lib/sdk";
import { useAgentStore } from "@/stores/agent";

type TeamView = Team & {
  team_id: string;
  created_by: string;
  created_at: string;
  member_count: number;
  my_role: string | null;
};

type TeamMembershipView = TeamMembership & {
  membership_id: string;
  team_id: string;
  agent_id: string;
  joined_at: string;
  updated_at: string;
};

type TeamMessageView = TeamMessage & {
  message_id: string;
  team_id: string;
  sender_agent_id: string;
  message_type: string;
  body_format: string;
  requires_ack: boolean;
  requires_action: boolean;
  due_at: string | null;
  thread_id: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  sent_at: string;
  recipient_count: number;
};

type TeamInboxItemView = TeamInboxItem & {
  delivery_id: string;
  message_id: string;
  team_id: string;
  recipient_agent_id: string;
  sender_agent_id: string;
  message_type: string;
  inbox_status: string;
  execution_status: string;
  requires_ack: boolean;
  requires_action: boolean;
  due_at: string | null;
  sent_at: string;
  read_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  unread_comment_count: number;
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

type TeamFormState = {
  name: string;
  description: string;
  purpose: string;
  visibility: "private" | "open";
};

const EMPTY_FORM: TeamFormState = {
  name: "",
  description: "",
  purpose: "",
  visibility: "private",
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
  if (value === "open" || value === "in_progress") return "secondary";
  if (value === "urgent" || value === "failed" || value === "dissolved") return "destructive";
  return "outline";
}

function TeamFormDialog({
  open,
  mode,
  loading,
  value,
  onChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  loading: boolean;
  value: TeamFormState;
  onChange: (next: TeamFormState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => Promise<void>;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("dialog.createTitle") : t("dialog.editTitle")}</DialogTitle>
          <DialogDescription>{mode === "create" ? t("dialog.createDescription") : t("dialog.editDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder={t("form.name")} />
          <Textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} placeholder={t("form.description")} />
          <Textarea value={value.purpose} onChange={(e) => onChange({ ...value, purpose: e.target.value })} placeholder={t("form.purpose")} />
          <Select value={value.visibility} onValueChange={(next) => {
            if (!next) return;
            onChange({ ...value, visibility: next as "private" | "open" });
          }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">{t("visibility.private")}</SelectItem>
              <SelectItem value="open">{t("visibility.open")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} disabled={loading || !value.name.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "create" ? tc("create") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamManagementPage({
  initialWorkspaces,
  embedded = false,
}: {
  initialWorkspaces: Workspace[];
  embedded?: boolean;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const ensureAgents = useAgentStore((store) => store.ensure);
  const agents = useAgentStore((store) => store.agents);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedActorId, setSelectedActorId] = useState("");
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [teamMessages, setTeamMessages] = useState<TeamInboxItemView[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<TeamMessageView | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [error, setError] = useState("");
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM);

  const workspaces = useMemo(
    () => initialWorkspaces.filter((workspace) => !workspace.isWorktree),
    [initialWorkspaces],
  );
  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.enabled !== false),
    [agents],
  );
  const selectedTeam = teams.find((team) => team.team_id === selectedTeamId) ?? null;

  useEffect(() => {
    void ensureAgents();
  }, [ensureAgents]);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces[0]?.id) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [selectedWorkspaceId, workspaces]);

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
        `/api/workspaces/${selectedWorkspaceId}/teams?actor_agent_id=${encodeURIComponent(selectedActorId)}&scope=visible&page_size=100`,
      );
      setTeams(data.teams);
      const nextId = nextSelectedTeamId && data.teams.some((item) => item.team_id === nextSelectedTeamId)
        ? nextSelectedTeamId
        : data.teams.find((item) => item.team_id === selectedTeamId)?.team_id ?? data.teams[0]?.team_id ?? "";
      setSelectedTeamId(nextId);
      if (!nextId) {
        setTeamDetail(null);
        setTeamMessages([]);
        setSelectedDeliveryId("");
        setSelectedMessage(null);
      }
    } catch (err) {
      setTeams([]);
      setSelectedTeamId("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTeams(false);
    }
  }, [selectedActorId, selectedTeamId, selectedWorkspaceId]);

  const loadTeamDetail = useCallback(async (teamId: string) => {
    try {
      const data = await requestTeamApi<TeamDetail>(
        `/api/workspaces/${selectedWorkspaceId}/teams/${teamId}?actor_agent_id=${encodeURIComponent(selectedActorId)}&include_members_preview=true`,
      );
      setTeamDetail(data);
    } catch (err) {
      setTeamDetail(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedActorId, selectedWorkspaceId]);

  const loadTeamMessages = useCallback(async (teamId: string) => {
    try {
      const data = await requestTeamApi<{ inbox_items: TeamInboxItemView[] }>(
        `/api/workspaces/${selectedWorkspaceId}/team-inbox?actor_agent_id=${encodeURIComponent(selectedActorId)}&team_id=${encodeURIComponent(teamId)}&page_size=100`,
      );
      setTeamMessages(data.inbox_items);
      setSelectedDeliveryId((current) => data.inbox_items.find((item) => item.delivery_id === current)?.delivery_id ?? data.inbox_items[0]?.delivery_id ?? "");
    } catch (err) {
      setTeamMessages([]);
      setSelectedDeliveryId("");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedActorId, selectedWorkspaceId]);

  const loadMessage = useCallback(async (deliveryId: string) => {
    setLoadingMessage(true);
    try {
      const data = await requestTeamApi<{ message: TeamMessageView }>(
        `/api/workspaces/${selectedWorkspaceId}/team-inbox/${deliveryId}?actor_agent_id=${encodeURIComponent(selectedActorId)}`,
      );
      setSelectedMessage(data.message);
    } catch (err) {
      setSelectedMessage(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(false);
    }
  }, [selectedActorId, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedActorId) return;
    void loadTeams();
  }, [loadTeams, selectedActorId, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedActorId || !selectedTeamId) {
      setTeamDetail(null);
      setTeamMessages([]);
      setSelectedDeliveryId("");
      setSelectedMessage(null);
      return;
    }
    void Promise.all([loadTeamDetail(selectedTeamId), loadTeamMessages(selectedTeamId)]);
  }, [loadTeamDetail, loadTeamMessages, selectedActorId, selectedTeamId, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedActorId || !selectedDeliveryId) {
      setSelectedMessage(null);
      return;
    }
    void loadMessage(selectedDeliveryId);
  }, [loadMessage, selectedActorId, selectedDeliveryId, selectedWorkspaceId]);

  function openCreateDialog() {
    setDialogMode("create");
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(team: TeamView) {
    setDialogMode("edit");
    setForm({
      name: team.name,
      description: team.description ?? "",
      purpose: team.purpose ?? "",
      visibility: team.visibility,
    });
    setDialogOpen(true);
  }

  async function submitTeam() {
    if (!selectedWorkspaceId || !selectedActorId) return;
    setSavingTeam(true);
    setError("");
    try {
      if (dialogMode === "create") {
        const data = await requestTeamApi<{ team: TeamView }>(`/api/workspaces/${selectedWorkspaceId}/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_agent_id: selectedActorId,
            name: form.name.trim(),
            description: form.description.trim(),
            purpose: form.purpose.trim(),
            visibility: form.visibility,
          }),
        });
        await loadTeams(data.team.team_id);
      } else if (selectedTeamId) {
        const data = await requestTeamApi<{ team: TeamView }>(`/api/workspaces/${selectedWorkspaceId}/teams/${selectedTeamId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_agent_id: selectedActorId,
            name: form.name.trim(),
            description: form.description.trim(),
            purpose: form.purpose.trim(),
            visibility: form.visibility,
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
    if (!selectedWorkspaceId || !selectedActorId) return;
    if (!confirm(t("deleteConfirm", { name: team.name }))) return;
    setError("");
    try {
      await requestTeamApi<{ team_id: string }>(`/api/workspaces/${selectedWorkspaceId}/teams/${team.team_id}/dissolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_agent_id: selectedActorId,
          confirm: true,
        }),
      });
      await loadTeams(team.team_id === selectedTeamId ? undefined : selectedTeamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className={embedded ? "flex h-full flex-col" : "flex min-h-dvh w-full flex-col"}>
      <main className={embedded ? "flex size-full flex-1 flex-col gap-4 px-4 py-4 sm:px-6" : "mx-auto flex size-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6"}>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {embedded ? null : <h1 className="text-2xl font-semibold">{t("title")}</h1>}
              <p className="text-sm text-muted-foreground">{t("description")}</p>
            </div>
            <Button onClick={openCreateDialog} disabled={!selectedWorkspaceId || !selectedActorId}>
              <Plus className="size-4" />
              {t("newTeam")}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Select value={selectedWorkspaceId} onValueChange={(next) => setSelectedWorkspaceId(next ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("filters.workspace")} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedActorId} onValueChange={(next) => setSelectedActorId(next ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("filters.actor")} />
              </SelectTrigger>
              <SelectContent>
                {availableAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name || agent.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        {!selectedWorkspaceId || !selectedActorId ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("empty.setup")}
          </div>
        ) : (
          <div className="grid flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,1.1fr)]">
            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium">{t("list.title")}</h2>
                {loadingTeams ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              </div>
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
            </section>

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
                    <div className="mb-2 text-sm font-medium">{t("detail.members")}</div>
                    <div className="flex flex-wrap gap-2">
                      {(teamDetail.members_preview ?? []).length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t("detail.noMembers")}</span>
                      ) : (
                        (teamDetail.members_preview ?? []).map((member) => {
                          const agent = availableAgents.find((item) => item.id === member.agent_id);
                          return (
                            <Badge key={member.membership_id} variant="outline" className="gap-1 px-2 py-1">
                              <span>{agent?.name || member.agent_id}</span>
                              <span className="text-muted-foreground">· {member.role}</span>
                            </Badge>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 rounded-xl border border-border p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <MessagesSquare className="size-4 text-muted-foreground" />
                      <div className="text-sm font-medium">{t("messages.title")}</div>
                    </div>
                    {teamMessages.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t("messages.empty")}</div>
                    ) : (
                      <div className="flex max-h-[24rem] flex-col gap-2 overflow-auto pr-1">
                        {teamMessages.map((item) => (
                          <button
                            key={item.delivery_id}
                            type="button"
                            onClick={() => setSelectedDeliveryId(item.delivery_id)}
                            className={`rounded-xl border px-3 py-3 text-left ${item.delivery_id === selectedDeliveryId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{item.subject}</div>
                                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.preview}</div>
                              </div>
                              <Badge variant={badgeTone(item.inbox_status)}>{t(`inboxStatus.${item.inbox_status}`)}</Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">{formatTime(item.sent_at)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("empty.teamDetail")}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 font-medium">{t("messages.detailTitle")}</h2>
              {!selectedDeliveryId ? (
                <div className="text-sm text-muted-foreground">{t("messages.pickMessage")}</div>
              ) : loadingMessage ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("messages.loading")}
                </div>
              ) : selectedMessage ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-lg font-semibold">{selectedMessage.subject}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={badgeTone(selectedMessage.priority)}>{t(`priority.${selectedMessage.priority}`)}</Badge>
                      <Badge variant="outline">{t(`messageType.${selectedMessage.message_type}`)}</Badge>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">{t("messages.sentAt", { value: formatTime(selectedMessage.sent_at) })}</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-6">{selectedMessage.body}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">{t("messages.sender")}</div>
                      <div className="mt-1">{availableAgents.find((agent) => agent.id === selectedMessage.sender_agent_id)?.name || selectedMessage.sender_agent_id}</div>
                    </div>
                    <div className="rounded-xl border border-border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">{t("messages.recipientCount")}</div>
                      <div className="mt-1">{selectedMessage.recipient_count}</div>
                    </div>
                    <div className="rounded-xl border border-border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">{t("messages.requiresAction")}</div>
                      <div className="mt-1">{selectedMessage.requires_action ? t("messages.yes") : t("messages.no")}</div>
                    </div>
                    <div className="rounded-xl border border-border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">{t("messages.dueAt")}</div>
                      <div className="mt-1">{formatTime(selectedMessage.due_at)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">{t("messages.empty")}</div>
              )}
            </section>
          </div>
        )}
      </main>

      <TeamFormDialog
        open={dialogOpen}
        mode={dialogMode}
        loading={savingTeam}
        value={form}
        onChange={setForm}
        onOpenChange={setDialogOpen}
        onSubmit={submitTeam}
      />
    </div>
  );
}
