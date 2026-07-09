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
import { normalizeAgent } from "@/components/sidebar/agent-shared";
import { TeamMemberRow } from "@/components/teams/team-member-row";
import { MemberSelectDialog, buildCandidates } from "@/components/teams/member-select-panel";
import type { TeamMembershipView } from "@agent-spaces/sdk";

export type { TeamMembershipView };

interface TeamMemberListProps {
  teamId: string;
  actorAgentId: string;
  members: TeamMembershipView[];
  agents: AgentConfig[];
  myRole?: string | null;
  onChange: () => void;
}

export function TeamMemberList({ teamId, actorAgentId, members, agents, myRole, onChange }: TeamMemberListProps) {
  const t = useTranslations("teams");
  const tm = useTranslations("chat.messageItem");
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string>("");
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);

  const canManage = myRole === "owner" || myRole === "admin";
  const memberIds = useMemo(() => new Set(members.map((m) => m.agent_id)), [members]);
  const candidates = useMemo(() => buildCandidates(agents, memberIds), [agents, memberIds]);

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
          disabled={busyId === "__add" || !canManage}
          title={canManage ? undefined : t("detail.noPermission")}
        >
          {busyId === "__add" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {t("detail.addMember")}
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
                onConfigure={storedAgent ? () => setConfigAgentId(member.agent_id) : undefined}
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
    </div>
  );
}
