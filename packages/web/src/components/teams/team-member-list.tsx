"use client";

import { useMemo, useState } from "react";
import type { AgentConfig } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Trash2, UserPlus, Loader2, Crown } from "lucide-react";
import { sdk } from "@/lib/sdk";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgentEditor } from "@/components/sidebar/agent-editor";
import { normalizeAgent, type AgentPreset } from "@/components/sidebar/agent-shared";
import { TeamMemberRow } from "@/components/teams/team-member-row";
import { TeamInboxDialog } from "@/components/teams/team-inbox-dialog";
import { MemberSelectDialog, buildCandidates } from "@/components/teams/member-select-panel";
import type { TeamMembershipView } from "@agent-spaces/sdk";

export type { TeamMembershipView };

interface TeamMemberListProps {
  teamId: string;
  actorAgentId: string;
  members: TeamMembershipView[];
  agents: AgentConfig[];
  sessionId?: string;
  myRole?: string | null;
  onChange: () => void;
}

export function TeamMemberList({ teamId, actorAgentId, members, agents, sessionId, myRole, onChange }: TeamMemberListProps) {
  const t = useTranslations("teams");
  const tm = useTranslations("chat.messageItem");
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string>("");
  const [removeOwnerOpen, setRemoveOwnerOpen] = useState(false);
  const [ownerToRemoveId, setOwnerToRemoveId] = useState<string | null>(null);
  const [replacementOwnerId, setReplacementOwnerId] = useState<string>("");
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const [configCustomMemberId, setConfigCustomMemberId] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxAgentId, setInboxAgentId] = useState<string>("");

  const canManage = myRole === "owner" || myRole === "admin";
  const memberIds = useMemo(() => new Set(members.map((m) => m.agent_id)), [members]);
  const candidates = useMemo(() => buildCandidates(agents, memberIds), [agents, memberIds]);
  const replacementOwnerCandidates = useMemo(
    () => members.filter((member) => member.agent_id !== ownerToRemoveId),
    [members, ownerToRemoveId],
  );

  async function setOwner(targetId: string) {
    if (busyId) return;
    setBusyId(targetId);
    try {
      await sdk.team.setRole(teamId, actorAgentId, targetId, "owner");
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  }

  async function removeMember(targetId: string) {
    if (busyId) return;
    const target = members.find((member) => member.agent_id === targetId);
    if (target?.role === "owner") {
      const candidates = members.filter((member) => member.agent_id !== targetId);
      if (candidates.length === 0) {
        alert(t("detail.noPermission"));
        return;
      }
      setOwnerToRemoveId(targetId);
      setReplacementOwnerId(candidates[0]?.agent_id ?? "");
      setRemoveOwnerOpen(true);
      return;
    }
    if (!confirm(t("detail.removeConfirm"))) return;
    setBusyId(targetId);
    try {
      await sdk.team.remove(teamId, actorAgentId, targetId);
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  }

  async function confirmRemoveOwner() {
    if (!ownerToRemoveId || !replacementOwnerId || busyId) return;
    if (!confirm(t("detail.removeConfirm"))) return;
    setBusyId(ownerToRemoveId);
    try {
      await sdk.team.setRole(teamId, actorAgentId, replacementOwnerId, "owner");
      await sdk.team.remove(teamId, actorAgentId, ownerToRemoveId);
      setRemoveOwnerOpen(false);
      setOwnerToRemoveId(null);
      setReplacementOwnerId("");
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  }

  async function handleAdd(newIds: string[]) {
    if (!newIds.length) return;
    setBusyId("__add");
    try {
      for (const agent_id of newIds) {
        await sdk.team.invite(teamId, actorAgentId, agent_id, "member");
      }
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">
          {t("detail.members")}
          <span className="ml-1.5 text-muted-foreground">({members.length})</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          disabled={busyId === "__add"}
        >
          {busyId === "__add" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("detail.noMembers")}</p>
      ) : (
        <div className="space-y-1">
          {members.map((member) => {
            const storedAgent = agents.find((a) => a.id === member.agent_id);
            const agent = member.agent ?? storedAgent;
            const name = agent?.name || member.agent_id;
            const isOwner = member.role === "owner";
            const isBusy = busyId === member.agent_id;

            const row = (
              <TeamMemberRow
                agent={agent}
                name={name}
                role={member.role}
                busy={isBusy}
                unreadCount={member.unread_count ?? 0}
                runtimeStatus={member.runtime_status ?? "idle"}
                onInboxOpen={() => {
                  setInboxAgentId(member.agent_id);
                  setInboxOpen(true);
                }}
                onConfigure={() => {
                  if (storedAgent) {
                    setConfigAgentId(member.agent_id);
                    return;
                  }
                  if (member.agent) {
                    setConfigCustomMemberId(member.agent_id);
                  }
                }}
                onRemove={canManage ? () => void removeMember(member.agent_id) : undefined}
              />
            );

            if (!canManage) {
              return <div key={member.membership_id}>{row}</div>;
            }

            return (
              <ContextMenu key={member.membership_id}>
                <ContextMenuTrigger>{row}</ContextMenuTrigger>
                <ContextMenuContent>
                  {!isOwner && (
                    <ContextMenuItem onClick={() => void setOwner(member.agent_id)} disabled={isBusy}>
                      <Crown className="size-4" />
                      {t("detail.setOwner")}
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => void removeMember(member.agent_id)}
                    disabled={isBusy}
                  >
                    <Trash2 className="size-4" />
                    {t("detail.removeMember")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      )}

      <MemberSelectDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidates={candidates}
        title={t("detail.addMember")}
        confirmLabel={t("detail.addMember")}
        onConfirm={(ids) => void handleAdd(ids)}
      />

      <Dialog open={removeOwnerOpen} onOpenChange={(open) => {
        setRemoveOwnerOpen(open);
        if (!open) {
          setOwnerToRemoveId(null);
          setReplacementOwnerId("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("detail.setOwner")}</DialogTitle>
            <DialogDescription>移除 owner 前，必须先选择新的 owner。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {replacementOwnerCandidates.map((member) => {
              const agent = member.agent ?? agents.find((item) => item.id === member.agent_id);
              const name = agent?.name || member.agent_id;
              const checked = replacementOwnerId === member.agent_id;
              return (
                <button
                  key={member.membership_id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${checked ? "border-primary bg-primary/5" : "border-border"}`}
                  onClick={() => setReplacementOwnerId(member.agent_id)}
                >
                  <span>{name}</span>
                  <span className="text-muted-foreground">{member.role}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoveOwnerOpen(false)}>取消</Button>
            <Button onClick={() => void confirmRemoveOwner()} disabled={!replacementOwnerId || Boolean(busyId)}>
              {busyId ? <Loader2 className="size-4 animate-spin" /> : "确认移除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {configAgentId && (() => {
        const agent = agents.find((item) => item.id === configAgentId);
        if (!agent) return null;
        return (
          <Dialog open={Boolean(configAgentId)} onOpenChange={(open) => { if (!open) setConfigAgentId(null); }}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="border-b px-5 py-3">
                <DialogTitle>{tm("configureAgent")}</DialogTitle>
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

      {configCustomMemberId && (() => {
        const member = members.find((item) => item.agent_id === configCustomMemberId);
        if (!member?.agent) return null;
        const preset = normalizeAgent({ ...member.agent, id: member.agent_id } as AgentConfig);
        return (
          <Dialog open={Boolean(configCustomMemberId)} onOpenChange={(open) => { if (!open) setConfigCustomMemberId(null); }}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="border-b px-5 py-3">
                <DialogTitle>{tm("configureAgent")}</DialogTitle>
                <DialogDescription />
              </DialogHeader>
              <AgentEditor
                agent={preset}
                commit={async (draft: AgentPreset) => {
                  const response = await fetch(`/api/teams/${teamId}/update-agent`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      actor_agent_id: actorAgentId,
                      agent_id: member.agent_id,
                      agent: { ...draft, id: member.agent_id },
                    }),
                  });
                  const payload = await response.json() as { success?: boolean; message?: string };
                  if (!response.ok || payload.success === false) {
                    throw new Error(payload.message || "save failed");
                  }
                  return { ...draft, id: member.agent_id };
                }}
                onSaved={() => {
                  setConfigCustomMemberId(null);
                  onChange();
                }}
                onBack={() => setConfigCustomMemberId(null)}
                showFooter
              />
            </DialogContent>
          </Dialog>
        );
      })()}

      <TeamInboxDialog
        open={inboxOpen}
        onOpenChange={setInboxOpen}
        teamId={teamId}
        actorAgentId={actorAgentId}
        sessionId={sessionId}
        members={members}
        agents={agents}
        initialAgentId={inboxAgentId}
        onChanged={onChange}
      />
    </div>
  );
}
