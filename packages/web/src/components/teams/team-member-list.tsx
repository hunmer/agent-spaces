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
import { AddMemberDialog, type AddMemberCandidate } from "@/components/chat/add-member-dialog";
import { TeamMemberRow } from "@/components/teams/team-member-row";

/** 与 team-management-page 中的 TeamMembershipView 保持一致 */
export interface TeamMembershipView {
  membership_id: string;
  team_id: string;
  agent_id: string;
  role: "owner" | "admin" | "member" | "observer";
  status: string;
  joined_at?: string;
  updated_at?: string;
}

interface TeamApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data?: T;
}

async function requestTeamApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await sdk.http.raw(path, init);
  const payload = (await response.json()) as TeamApiResponse<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.message || response.statusText);
  }
  return payload.data;
}

interface TeamMemberListProps {
  teamId: string;
  actorAgentId: string;
  members: TeamMembershipView[];
  agents: AgentConfig[];
  /** 当前 actor 在该团队的角色（owner/admin/member/observer/null） */
  myRole?: string | null;
  onChange: () => void;
}

export function TeamMemberList({ teamId, actorAgentId, members, agents, myRole, onChange }: TeamMemberListProps) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string>("");

  const canManage = myRole === "owner" || myRole === "admin";

  const memberIds = useMemo(() => new Set(members.map((m) => m.agent_id)), [members]);

  // 添加成员的候选列表：已启用 agent，排除已在团队中的
  const candidates: AddMemberCandidate[] = useMemo(
    () =>
      agents
        .filter((a) => a.enabled !== false)
        .map((a) => ({ id: a.id, label: a.name || a.id, sortIndex: 0 }))
        .filter((c) => !memberIds.has(c.id)),
    [agents, memberIds],
  );

  async function setOwner(targetId: string) {
    if (busyId) return;
    setBusyId(targetId);
    try {
      await requestTeamApi(`/api/teams/${teamId}/set-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_agent_id: actorAgentId, agent_id: targetId, role: "owner" }),
      });
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
      await requestTeamApi(`/api/teams/${teamId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_agent_id: actorAgentId, agent_id: targetId }),
      });
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
        await requestTeamApi(`/api/teams/${teamId}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor_agent_id: actorAgentId, agent_id, role: "member" }),
        });
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
            const agent = agents.find((a) => a.id === member.agent_id);
            const name = agent?.name || member.agent_id;
            const isOwner = member.role === "owner";
            const isBusy = busyId === member.agent_id;

            const row = (
              <TeamMemberRow
                agent={agent}
                name={name}
                role={member.role}
                busy={isBusy}
                onRemove={canManage ? () => void removeMember(member.agent_id) : undefined}
              />
            );

            // 无管理权限时只渲染行，不提供右键菜单
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

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidates={candidates}
        onAdd={(ids) => void handleAdd(ids)}
      />
    </div>
  );
}
