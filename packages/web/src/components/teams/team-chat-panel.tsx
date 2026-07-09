"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Channel, Message } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Loader2, PanelRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageItem } from "@/components/chat/message-item";
import { MessageNavigator } from "@/components/chat/message-navigator";
import { ChatInput } from "@/components/chat/chat-input";
import { useAgentStore } from "@/stores/agent";
import { sdk } from "@/lib/sdk";
import type {
  TeamRuntimeView,
  TeamRuntimeMessageView,
  TeamRuntimeResponse,
} from "@agent-spaces/sdk";
import { WorkspaceWS } from "@/lib/ws";

const TEAM_RUNTIME_WORKSPACE_ID = "__team__";

type TeamChatPanelProps = {
  teamId: string;
  actorAgentId: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
};

const EMPTY_CHANNEL: Channel = {
  id: "__team_runtime__",
  workspaceId: "",
  name: "team",
  type: "agent",
  members: [],
  createdAt: "",
};

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
  const [pendingAssistantSince, setPendingAssistantSince] = useState<string | null>(null);
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
  }), [leader, runtime, t]);

  const composerAgents = useMemo(() => {
    return participants.map((participant) => ({
      id: participant.id,
      name: participant.name || participant.id,
      role: participant.role || "agent",
      description: participant.description,
      avatarUrl: participant.avatarUrl,
      icon: participant.icon,
      runtimeKind: participant.runtimeKind,
      modelProvider: participant.modelProvider,
      providerId: participant.providerId,
      modelId: participant.modelId,
      apiBase: participant.apiBase,
      systemPrompt: participant.systemPrompt,
      backgroundUrl: participant.backgroundUrl,
      skills: participant.skills,
      tools: participant.tools,
      mcps: participant.mcps,
      enabled: true,
    }));
  }, [participants]);

  const participantsById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );

  const viewMessages = useMemo(() => {
    const rendered = messages.map((item) => toChannelMessage(item, actorAgentId));
    if (!pendingAssistantSince) return rendered;

    const hasRealAssistantMessage = messages.some((item) => (
      item.senderAgentId !== actorAgentId
      && new Date(item.createdAt).getTime() >= new Date(pendingAssistantSince).getTime()
    ));
    if (hasRealAssistantMessage) return rendered;

    const pendingMessage: Message = {
      id: "__team_pending_assistant__",
      channelId: runtime?.id ?? "__team_runtime__",
      senderId: runtime?.leader_agent_id || leader?.id || "assistant",
      content: "",
      type: "text",
      status: "pending",
      createdAt: pendingAssistantSince,
    };
    return [...rendered, pendingMessage];
  }, [actorAgentId, leader?.id, messages, pendingAssistantSince, runtime?.id, runtime?.leader_agent_id]);

  const clearPendingAssistantIfResolved = useCallback((items: TeamRuntimeMessageView[]) => {
    if (!pendingAssistantSince) return;
    const resolved = items.some((item) => (
      item.senderAgentId !== actorAgentId
      && new Date(item.createdAt).getTime() >= new Date(pendingAssistantSince).getTime()
    ));
    if (resolved) {
      setPendingAssistantSince(null);
    }
  }, [actorAgentId, pendingAssistantSince]);

  const loadRuntime = useCallback(async () => {
    if (!teamId || !actorAgentId) return;
    setLoading(true);
    setError("");
    try {
      const data = await sdk.team.getRuntime(teamId, actorAgentId);
      setRuntime(data.runtime);
      setLeaderProfile(data.leader ?? null);
      setParticipants(data.participants ?? []);
      setMessages(data.messages);
      clearPendingAssistantIfResolved(data.messages);
    } catch (err) {
      setRuntime(null);
      setLeaderProfile(null);
      setParticipants([]);
      setMessages([]);
      setPendingAssistantSince(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [actorAgentId, clearPendingAssistantIfResolved, teamId]);

  const handleSend = useCallback(async (content: string, mentions: string[], _attachments?: unknown, _replyToMessageId?: string, contextLength?: number) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const startedAt = new Date().toISOString();
    setPendingAssistantSince(startedAt);
    setSending(true);
    setError("");
    try {
      await sdk.team.sendRuntimeMessage(teamId, {
        actor_agent_id: actorAgentId,
        content: trimmed,
        target_agent_id: mentions[0],
        context_length: contextLength,
      });
      await loadRuntime();
    } catch (err) {
      setPendingAssistantSince(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [actorAgentId, loadRuntime, teamId]);

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

  const handleDeleteMessage = useCallback(async (message: Message) => {
    setError("");
    try {
      await sdk.team.deleteMessage(message.id, actorAgentId);
      await loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [actorAgentId, loadRuntime]);

  const handleClearMessages = useCallback(async () => {
    setError("");
    try {
      await sdk.team.clearMessages(teamId, actorAgentId);
      await loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [actorAgentId, loadRuntime, teamId]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card p-4">
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
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleClearMessages}
            disabled={viewMessages.length === 0 || loading || sending}
            title="清空消息"
          >
            <Trash2 className="size-3.5" />
          </Button>
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
          <div className="relative min-h-0 flex-1">
            <div className="h-full overflow-y-auto overflow-x-hidden py-2">
              {viewMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("chat.empty")}</div>
              ) : (
                <div className="flex flex-col py-2">
                  {viewMessages.map((message) => (
                    <div key={message.id} id={`msg-${message.id}`}>
                      <MessageItem
                        message={message}
                        workspaceId=""
                        agent={participantsById.get(message.senderId)}
                        teamId={teamId}
                        actorAgentId={actorAgentId}
                        onAgentUpdated={() => { void loadRuntime(); }}
                        onDelete={handleDeleteMessage}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <MessageNavigator messages={viewMessages} />
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
