"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentConfig } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Loader2, Mail, MailOpen, Trash2 } from "lucide-react";
import { sdk } from "@/lib/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgentIcon } from "@/components/common/agent-icon";
import { Markdown } from "@/components/ui/markdown";
import type { TeamInboxItemView, TeamMembershipView } from "@agent-spaces/sdk";

interface TeamInboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  actorAgentId: string;
  sessionId?: string;
  members: TeamMembershipView[];
  agents: AgentConfig[];
  initialAgentId?: string;
  onChanged?: () => void;
}

export function TeamInboxDialog({
  open,
  onOpenChange,
  teamId,
  actorAgentId,
  sessionId,
  members,
  agents,
  initialAgentId,
  onChanged,
}: TeamInboxDialogProps) {
  const t = useTranslations("teams");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [items, setItems] = useState<TeamInboxItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string>("");
  const [error, setError] = useState("");

  // 成员 → agent 配置映射（用于解析头像/名字）
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentConfig>();
    for (const a of agents) map.set(a.id, a);
    return map;
  }, [agents]);

  const resolveAgent = useCallback(
    (agentId: string): { name: string; agent?: AgentConfig } => {
      const member = members.find((m) => m.agent_id === agentId);
      const stored = agentMap.get(agentId);
      const agent = member?.agent ?? stored;
      const name = (agent as { name?: string } | undefined)?.name || member?.agent?.name || agentId;
      return { name: String(name), agent: stored };
    },
    [agentMap, members],
  );

  // 打开时默认选中首个有未读的成员，否则选第一个成员
  useEffect(() => {
    if (!open) {
      setSelectedAgentId("");
      return;
    }
    if (members.some((member) => member.agent_id === selectedAgentId)) return;
    if (initialAgentId) {
      setSelectedAgentId(initialAgentId);
      return;
    }
    const firstUnread = members.find((m) => (m.unread_count ?? 0) > 0);
    const fallback = firstUnread ?? members[0];
    if (fallback) setSelectedAgentId(fallback.agent_id);
  }, [open, initialAgentId, members, selectedAgentId]);

  // 拉取选中成员的 inbox
  const loadInbox = useCallback(async () => {
    if (!selectedAgentId || !teamId || !actorAgentId) return;
    setLoading(true);
    setError("");
    try {
      const res = await sdk.team.listInbox({
        actor_agent_id: actorAgentId,
        team_id: teamId,
        session_id: sessionId,
        recipient_agent_id: selectedAgentId,
        page_size: 100,
      });
      setItems(res.inbox_items.filter((item) => !(item.preview.trim() === "Thinking"
        && (!item.subject || item.subject.trim() === "Thinking")
        && (!item.body || item.body.trim() === "Thinking"))));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [actorAgentId, selectedAgentId, sessionId, teamId]);

  useEffect(() => {
    if (open) void loadInbox();
  }, [loadInbox, open]);

  const reload = useCallback(() => {
    void loadInbox();
    onChanged?.();
  }, [loadInbox, onChanged]);

  const handleToggleRead = useCallback(
    async (item: TeamInboxItemView) => {
      if (busyId) return;
      setBusyId(item.delivery_id);
      const next = item.inbox_status === "unread" ? "read" : "unread";
      try {
        await sdk.team.updateInboxStatus(item.delivery_id, { actor_agent_id: actorAgentId, inbox_status: next });
        await loadInbox();
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId("");
      }
    },
    [actorAgentId, busyId, loadInbox, onChanged],
  );

  const handleDelete = useCallback(
    async (item: TeamInboxItemView) => {
      if (busyId) return;
      setBusyId(item.delivery_id);
      try {
        await sdk.team.deleteInboxItem(item.delivery_id, actorAgentId);
        await loadInbox();
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId("");
      }
    },
    [actorAgentId, busyId, loadInbox, onChanged],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>{t("inbox.title")}</DialogTitle>
          <DialogDescription>{t("inbox.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* 左栏：成员列表 */}
          <div className="w-56 shrink-0 overflow-y-auto border-r bg-muted/20 p-2">
            {members.length === 0 ? (
              <div className="px-2 py-4 text-xs text-muted-foreground">{t("detail.noMembers")}</div>
            ) : (
              <div className="space-y-0.5">
                {members.map((member) => {
                  const { name, agent } = resolveAgent(member.agent_id);
                  const unread = member.unread_count ?? 0;
                  const selected = member.agent_id === selectedAgentId;
                  return (
                    <button
                      key={member.membership_id}
                      type="button"
                      onClick={() => setSelectedAgentId(member.agent_id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        selected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <AgentIcon
                        agentId={member.agent_id}
                        name={name}
                        avatarUrl={agent?.avatarUrl}
                        icon={agent?.icon}
                        apiBase={agent?.apiBase}
                        modelId={agent?.modelId}
                        providerId={agent?.providerId}
                        modelProvider={agent?.modelProvider}
                        className="size-5 shrink-0"
                        bordered={false}
                      />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      {unread > 0 ? (
                        <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-500/10 px-1.5 py-0 text-xs text-orange-600">
                          {unread}
                        </Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右栏：消息列表 */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {error ? (
              <div className="m-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
            ) : null}

            {!selectedAgentId ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t("inbox.pickMember")}</div>
            ) : loading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("inbox.loading")}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t("inbox.empty")}</div>
            ) : (
              <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto p-3">
                {items.map((item) => {
                  const { name: senderName, agent } = resolveAgent(item.sender_agent_id);
                  const isUnread = item.inbox_status === "unread";
                  return (
                    <div
                      key={item.delivery_id}
                      className={`relative min-w-0 rounded-xl border bg-card p-3 pr-20 ${
                        isUnread ? "border-orange-500/40" : "border-border"
                      }`}
                    >
                      {/* 右上角操作 */}
                      <div className="absolute right-2 top-2 flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={busyId === item.delivery_id}
                          onClick={() => void handleToggleRead(item)}
                          title={isUnread ? t("inbox.markRead") : t("inbox.markUnread")}
                        >
                          {isUnread ? <MailOpen className="size-3.5" /> : <Mail className="size-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          disabled={busyId === item.delivery_id}
                          onClick={() => void handleDelete(item)}
                          title={t("inbox.delete")}
                        >
                          {busyId === item.delivery_id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        </Button>
                      </div>

                      {/* 标题行 */}
                      <div className="mb-1.5 flex min-w-0 items-center gap-2 pr-1">
                        <AgentIcon
                          agentId={item.sender_agent_id}
                          name={senderName}
                          avatarUrl={agent?.avatarUrl}
                          icon={agent?.icon}
                          apiBase={agent?.apiBase}
                          modelId={agent?.modelId}
                          providerId={agent?.providerId}
                          modelProvider={agent?.modelProvider}
                          className="size-5 shrink-0"
                          bordered={false}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{senderName}</span>
                        {isUnread ? (
                          <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 px-1.5 py-0 text-xs text-orange-600">
                            {t("inboxStatus.unread")}
                          </Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground">{formatTime(item.sent_at)}</span>
                      </div>

                      {/* 正文 */}
                      <div className="min-w-0 text-sm">
                        <Markdown content={item.body || item.subject || item.preview || ""} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
