"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Channel, Message } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Loader2, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageItem } from "@/components/chat/message-item";
import { ChatInput } from "@/components/chat/chat-input";
import { useAgentStore } from "@/stores/agent";
import { sdk } from "@/lib/sdk";
import { WorkspaceWS } from "@/lib/ws";

const TEAM_RUNTIME_WORKSPACE_ID = "__team__";

type TeamRuntimeView = {
  id: string;
  teamId: string;
  actorAgentId: string;
  leaderAgentId: string;
  status: "idle" | "running" | "completed" | "error";
  updatedAt: string;
  team_id: string;
  actor_agent_id: string;
  leader_agent_id: string;
  updated_at: string;
};

type TeamRuntimeMessageView = {
  id: string;
  runtimeId: string;
  teamId: string;
  messageId: string;
  deliveryId?: string;
  senderAgentId: string;
  recipientAgentId: string;
  content: string;
  createdAt: string;
  status: "running" | "completed" | "error";
};

type TeamRuntimeResponse = {
  runtime: TeamRuntimeView;
  leader?: {
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string;
    icon?: string;
    role?: string;
  };
  participants?: Array<{
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string;
    icon?: string;
    role?: string;
  }>;
  messages: TeamRuntimeMessageView[];
};

type TeamChatPanelProps = {
  teamId: string;
  actorAgentId: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
};

type TeamApiResponse<T> = {
  success: boolean;
  code: string;
  message: string;
  data?: T;
};

const EMPTY_CHANNEL: Channel = {
  id: "__team_runtime__",
  workspaceId: "",
  name: "team",
  type: "agent",
  members: [],
  createdAt: "",
};

async function requestTeamApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await sdk.http.raw(path, init);
  const payload = await response.json() as TeamApiResponse<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.message || response.statusText);
  }
  return payload.data;
}

function toChannelMessage(item: TeamRuntimeMessageView, actorAgentId: string): Message {
  const isUser = item.senderAgentId === actorAgentId;
  return {
    id: item.id,
    channelId: item.runtimeId,
    senderId: isUser ? "user" : item.senderAgentId,
    content: item.content,
    type: "text",
    status: item.status === "running" ? "streaming" : item.status === "error" ? "error" : "completed",
    createdAt: item.createdAt,
  };
}

export function TeamChatPanel({ teamId, actorAgentId, sidebarOpen = true, onToggleSidebar }: TeamChatPanelProps) {
  const t = useTranslations("teams");
  const agents = useAgentStore((store) => store.agents);
  const ensureAgents = useAgentStore((store) => store.ensure);
  const [runtime, setRuntime] = useState<TeamRuntimeView | null>(null);
  const [messages, setMessages] = useState<TeamRuntimeMessageView[]>([]);
  const [leaderProfile, setLeaderProfile] = useState<TeamRuntimeResponse["leader"] | null>(null);
  const [participants, setParticipants] = useState<NonNullable<TeamRuntimeResponse["participants"]>>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const leader = useMemo(() => {
    if (leaderProfile?.id) return leaderProfile;
    const agent = agents.find((item) => item.id === runtime?.leader_agent_id);
    if (!agent) return null;
    return {
      id: agent.id,
      name: agent.name || agent.id,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      icon: agent.icon,
      role: agent.role,
    };
  }, [agents, leaderProfile, runtime?.leader_agent_id]);

  const channel = useMemo<Channel>(() => ({
    ...EMPTY_CHANNEL,
    id: runtime?.id ?? "__team_runtime__",
    name: leader?.name || t("chat.leaderFallback"),
    members: runtime?.leader_agent_id ? [runtime.leader_agent_id] : [],
    pinnedMentionId: runtime?.leader_agent_id,
  }), [leader?.name, runtime?.id, runtime?.leader_agent_id, t]);

  const composerAgents = useMemo(() => {
    return participants.map((participant) => ({
      id: participant.id,
      name: participant.name || participant.id,
      role: participant.role || "agent",
      description: participant.description,
      avatarUrl: participant.avatarUrl,
      icon: participant.icon,
      enabled: true,
    }));
  }, [participants]);

  const viewMessages = useMemo(
    () => messages.map((item) => toChannelMessage(item, actorAgentId)),
    [actorAgentId, messages],
  );

  const loadRuntime = useCallback(async () => {
    if (!teamId || !actorAgentId) return;
    setLoading(true);
    setError("");
    try {
      const data = await requestTeamApi<TeamRuntimeResponse>(
        `/api/teams/${teamId}/runtime?actor_agent_id=${encodeURIComponent(actorAgentId)}`,
      );
      setRuntime(data.runtime);
      setLeaderProfile(data.leader ?? null);
      setParticipants(data.participants ?? []);
      setMessages(data.messages);
    } catch (err) {
      setRuntime(null);
      setLeaderProfile(null);
      setParticipants([]);
      setMessages([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [actorAgentId, teamId]);

  useEffect(() => {
    void ensureAgents();
  }, [ensureAgents]);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  useEffect(() => {
    if (runtime?.status !== "running") return;
    const timer = setInterval(() => {
      void loadRuntime();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadRuntime, runtime?.status]);

  useEffect(() => {
    const ws = new WorkspaceWS(TEAM_RUNTIME_WORKSPACE_ID);
    ws.connect();
    const handleEvent = (payload: unknown) => {
      const data = payload as { teamId?: string; actorAgentId?: string };
      if (data.teamId !== teamId || data.actorAgentId !== actorAgentId) return;
      void loadRuntime();
    };
    const offCreated = ws.on("team.message.created", handleEvent);
    const offUpdated = ws.on("team.runtime.updated", handleEvent);
    return () => {
      offCreated();
      offUpdated();
      ws.disconnect();
    };
  }, [actorAgentId, loadRuntime, teamId]);

  const handleSend = useCallback(async (content: string, mentions: string[], _attachments?: unknown, _replyToMessageId?: string, contextLength?: number) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    try {
      await requestTeamApi(
        `/api/teams/${teamId}/runtime/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_agent_id: actorAgentId,
            content: trimmed,
            target_agent_id: mentions[0],
            context_length: contextLength,
          }),
        },
      );
      await loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [actorAgentId, loadRuntime, teamId]);

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-medium">{t("chat.title")}</h2>
          <div className="text-xs text-muted-foreground">
            {leader?.name
              ? t("chat.subtitle", { leader: leader.name })
              : t("chat.loadingLeader")}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(loading || sending) ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          {onToggleSidebar ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onToggleSidebar}
              title={sidebarOpen ? t("chat.hideSidebar") : t("chat.showSidebar")}
            >
              <PanelRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!teamId ? (
        <div className="text-sm text-muted-foreground">{t("chat.pickTeam")}</div>
      ) : loading && !runtime ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("chat.loading")}
        </div>
      ) : !runtime ? (
        <div className="text-sm text-muted-foreground">{t("chat.empty")}</div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {viewMessages.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("chat.empty")}</div>
            ) : (
              <div className="flex flex-col py-2">
                {viewMessages.map((message) => (
                  <div key={message.id}>
                    <MessageItem message={message} workspaceId="" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <ChatInput
            channelName={channel.name}
            channelId={channel.id}
            workspaceId=""
            channel={channel}
            agents={composerAgents}
            messages={viewMessages}
            onSend={(content, mentions, attachments, replyToMessageId, contextLength) => void handleSend(content, mentions, attachments, replyToMessageId, contextLength)}
            isProcessing={sending}
            showAgentBar
            showAddMember={false}
          />
        </>
      )}
    </section>
  );
}
