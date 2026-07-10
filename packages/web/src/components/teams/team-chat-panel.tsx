"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentConfig, Channel, ExecutionLog, Message, Workflow } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Loader2, PanelRight, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageItem } from "@/components/chat/message-item";
import { MessageNavigator } from "@/components/chat/message-navigator";
import { ChatInput } from "@/components/chat/chat-input";
import { useAgentStore } from "@/stores/agent";
import { sdk } from "@/lib/sdk";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentEditor } from "@/components/sidebar/agent-editor";
import { normalizeAgent, type AgentPreset } from "@/components/sidebar/agent-shared";
import type {
  TeamInboxItemView,
  TeamRuntimeView,
  TeamRuntimeMessageView,
  TeamRuntimeResponse,
  TeamSessionView,
} from "@agent-spaces/sdk";
import { WorkspaceWS } from "@/lib/ws";
import { WorkflowPreview } from "@/components/workflow/workflow-preview";

const TEAM_RUNTIME_WORKSPACE_ID = "__team__";
const TEAM_USER_ACTOR_ID = "admin";

type TeamChatPanelProps = {
  teamId: string;
  actorAgentId: string;
  initialSessionId?: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  teamDescription?: string;
};

type TeamParticipant = NonNullable<TeamRuntimeResponse["participants"]>[number];

function isRuntimeThinkingDelivery(delivery: TeamInboxItemView): boolean {
  return delivery.preview.trim() === "Thinking"
    && (!delivery.subject || delivery.subject.trim() === "Thinking")
    && (!delivery.body || delivery.body.trim() === "Thinking");
}

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
    channelId: item.sessionId,
    senderId: isUser ? "user" : item.senderAgentId,
    content: item.content,
    parts: item.parts,
    type: "text",
    status: item.status === "running" ? "streaming" : item.status === "error" ? "error" : "completed",
    createdAt: item.createdAt,
  };
}

type TeamTranslator = (key: string, params?: Record<string, string | number>) => string;

function createTeamMessageWorkflow(
  teamId: string,
  sessionId: string,
  deliveries: TeamInboxItemView[],
  participants: TeamParticipant[],
  t: TeamTranslator,
): { workflow: Workflow; executionLog: ExecutionLog } {
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const workflowId = `team-message-flow-${sessionId}`;
  const timestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  };
  const displayName = (agentId: string) => agentId === TEAM_USER_ACTOR_ID
    ? t("chat.user")
    : participantById.get(agentId)?.name || agentId;
  const nodes = deliveries.map((delivery, index) => {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const recipient = participantById.get(delivery.recipient_agent_id);
    const content = delivery.body || delivery.preview;
    return {
      id: `delivery-${delivery.delivery_id}`,
      type: "agent_run",
      label: `${displayName(delivery.recipient_agent_id)}：${(delivery.subject || content).slice(0, 28) || t("chat.processing")}`,
      position: { x: (row % 2 === 0 ? column : 3 - column) * 440, y: row * 320 },
      data: {
        agent: recipient
          ? { ...recipient, role: recipient.role || "agent", enabled: true }
          : { id: delivery.recipient_agent_id, name: displayName(delivery.recipient_agent_id), role: "agent", enabled: true },
        prompt: content,
        permissionMode: "dontAsk",
      },
    };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `message-flow-${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
    middleLabel: `${displayName(deliveries[index + 1].sender_agent_id)} → ${displayName(deliveries[index + 1].recipient_agent_id)}`,
  }));
  const startedAt = deliveries.length > 0 ? timestamp(deliveries[0].sent_at) : Date.now();
  const status = deliveries.some((delivery) => delivery.execution_status === "failed")
    ? "error"
    : deliveries.some((delivery) => ["pending", "running", "in_progress"].includes(delivery.execution_status)) ? "running" : "completed";
  const workflow: Workflow = {
    id: workflowId,
    name: t("chat.workflowName"),
    folderId: null,
    nodes,
    edges,
    createdAt: startedAt,
    updatedAt: Date.now(),
  };
  return {
    workflow,
    executionLog: {
      id: `${workflowId}-execution`,
      workflowId,
      startedAt,
      finishedAt: status === "running" ? undefined : Date.now(),
      status,
      steps: deliveries.map((delivery, index) => ({
        nodeId: nodes[index].id,
        nodeLabel: nodes[index].label,
        startedAt: timestamp(delivery.sent_at),
        finishedAt: ["pending", "running", "in_progress"].includes(delivery.execution_status)
          ? undefined
          : timestamp(delivery.completed_at || delivery.failed_at || delivery.updated_at),
        status: delivery.execution_status === "failed"
          ? "error"
          : ["pending", "running", "in_progress"].includes(delivery.execution_status) ? "running" : "completed",
        input: { senderAgentId: delivery.sender_agent_id, content: delivery.body || delivery.preview },
      })),
    },
  };
}

export function TeamChatPanel({ teamId, actorAgentId, initialSessionId, sidebarOpen = true, onToggleSidebar, teamDescription }: TeamChatPanelProps) {
  const t = useTranslations("teams");
  const agents = useAgentStore((store) => store.agents);
  const ensureAgents = useAgentStore((store) => store.ensure);
  const [runtime, setRuntime] = useState<TeamRuntimeView | null>(null);
  const [sessionId, setSessionId] = useState(() => initialSessionId || crypto.randomUUID());
  const [sessions, setSessions] = useState<TeamSessionView[]>([]);
  const [messages, setMessages] = useState<TeamRuntimeMessageView[]>([]);
  const [pendingAssistantSince, setPendingAssistantSince] = useState<string | null>(null);
  const [leaderProfile, setLeaderProfile] = useState<TeamRuntimeResponse["leader"] | null>(null);
  const [participants, setParticipants] = useState<TeamParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [configAgent, setConfigAgent] = useState<{ id: string; agent?: Partial<TeamParticipant> } | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowDeliveries, setWorkflowDeliveries] = useState<TeamInboxItemView[]>([]);

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
    id: runtime?.session_id ?? "__team_runtime__",
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

  const messageWorkflow = useMemo(
    () => createTeamMessageWorkflow(teamId, runtime?.session_id ?? teamId, workflowDeliveries, participants, t),
    [participants, runtime?.session_id, teamId, workflowDeliveries, t],
  );

  const viewMessages = useMemo(() => {
    const rendered = messages.map((item) => toChannelMessage(item, TEAM_USER_ACTOR_ID));
    if (!pendingAssistantSince) return rendered;

    const hasRealAssistantMessage = messages.some((item) => (
      item.senderAgentId !== TEAM_USER_ACTOR_ID
      && new Date(item.createdAt).getTime() >= new Date(pendingAssistantSince).getTime()
    ));
    if (hasRealAssistantMessage) return rendered;

    const pendingMessage: Message = {
      id: "__team_pending_assistant__",
      channelId: runtime?.session_id ?? "__team_runtime__",
      senderId: runtime?.leader_agent_id || leader?.id || "assistant",
      content: "",
      type: "text",
      status: "pending",
      createdAt: pendingAssistantSince,
    };
    return [...rendered, pendingMessage];
  }, [leader?.id, messages, pendingAssistantSince, runtime?.leader_agent_id, runtime?.session_id]);

  const clearPendingAssistantIfResolved = useCallback((items: TeamRuntimeMessageView[]) => {
    if (!pendingAssistantSince) return;
    const resolved = items.some((item) => (
      item.senderAgentId !== TEAM_USER_ACTOR_ID
      && new Date(item.createdAt).getTime() >= new Date(pendingAssistantSince).getTime()
    ));
    if (resolved) {
      setPendingAssistantSince(null);
    }
  }, [pendingAssistantSince]);

  const loadRuntime = useCallback(async () => {
    if (!teamId || !actorAgentId) return;
    setLoading(true);
    setError("");
    try {
      const data = await sdk.team.getRuntime(teamId, TEAM_USER_ACTOR_ID, sessionId);
      const sessionData = await sdk.team.listSessions(teamId);
      setRuntime(data.runtime);
      setLeaderProfile(data.leader ?? null);
      setParticipants(data.participants ?? []);
      setMessages(data.messages);
      setSessions(sessionData.sessions);
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
  }, [actorAgentId, clearPendingAssistantIfResolved, sessionId, teamId]);

  const handleSessionChange = useCallback((value: string | null) => {
    if (!value || value === sessionId) return;
    setPendingAssistantSince(null);
    setWorkflowDeliveries([]);
    setSessionId(value);
  }, [sessionId]);

  const handleSend = useCallback(async (content: string, mentions: string[], _attachments?: unknown, _replyToMessageId?: string, contextLength?: number) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const startedAt = new Date().toISOString();
    setPendingAssistantSince(startedAt);
    setSending(true);
    setError("");
    try {
      await sdk.team.sendRuntimeMessage(teamId, {
        session_id: sessionId,
        actor_agent_id: TEAM_USER_ACTOR_ID,
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
  }, [actorAgentId, loadRuntime, sessionId, teamId]);

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
      if (data.teamId !== teamId || data.actorAgentId !== TEAM_USER_ACTOR_ID) return;
      void loadRuntime();
    };
    const offCreated = ws.on("team.message.created", handleEvent);
    const offMessageUpdated = ws.on("team.message.updated", handleEvent);
    const offUpdated = ws.on("team.runtime.updated", handleEvent);
    return () => {
      offCreated();
      offMessageUpdated();
      offUpdated();
      ws.disconnect();
    };
  }, [actorAgentId, loadRuntime, teamId]);

  const handleDeleteMessage = useCallback(async (message: Message) => {
    setError("");
    try {
      await sdk.team.deleteMessage(teamId, sessionId, message.id, actorAgentId);
      await loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [actorAgentId, loadRuntime, sessionId, teamId]);

  const handleClearMessages = useCallback(async () => {
    setError("");
    try {
      await sdk.team.clearMessages(teamId, sessionId, actorAgentId);
      await loadRuntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [actorAgentId, loadRuntime, sessionId, teamId]);

  const handleOpenWorkflow = useCallback(async () => {
    setWorkflowLoading(true);
    setError("");
    try {
      const recipientIds = Array.from(new Set([TEAM_USER_ACTOR_ID, actorAgentId, ...participants.map((participant) => participant.id)]));
      const responses = await Promise.all(recipientIds.map((recipientAgentId) => sdk.team.listInbox({
        actor_agent_id: actorAgentId,
        team_id: teamId,
        session_id: sessionId,
        recipient_agent_id: recipientAgentId,
        // ponytail: 单个收件箱先取最近 100 条；出现超长历史时再补分页。
        page_size: 100,
      })));
      const deliveries = Array.from(new Map(
        responses.flatMap((response) => response.inbox_items).map((delivery) => [delivery.delivery_id, delivery]),
      ).values())
        .filter((delivery) => !isRuntimeThinkingDelivery(delivery))
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      setWorkflowDeliveries(deliveries);
      setWorkflowOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkflowLoading(false);
    }
  }, [actorAgentId, participants, sessionId, teamId]);

  const configStoreAgent = configAgent ? agents.find((item) => item.id === configAgent.id) : undefined;
  const configCustomAgent = configAgent && !configStoreAgent ? configAgent.agent : undefined;

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            {t("chat.title")}
            {runtime?.status === "running" ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-xs font-normal text-emerald-600">
                <Loader2 className="size-3 animate-spin" />
                {t("chat.running")}
              </Badge>
            ) : null}
          </h2>
          <div className="text-xs text-muted-foreground">
            {teamDescription
              || (leader?.name ? t("chat.subtitle", { leader: leader.name }) : t("chat.loadingLeader"))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={sessionId} onValueChange={handleSessionChange}>
            <SelectTrigger className="h-7 w-32 font-mono text-xs" title={sessionId} aria-label={t("chat.selectSession")}>
              <SelectValue>{sessionId.slice(0, 8)}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {sessions.map((session) => (
                <SelectItem key={session.session_id} value={session.session_id} className="font-mono text-xs">
                  {session.session_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void handleOpenWorkflow()}
            disabled={!teamId || workflowLoading}
            title={t("chat.viewWorkflow")}
            aria-label={t("chat.viewWorkflow")}
          >
            {workflowLoading ? <Loader2 className="size-3.5 animate-spin" /> : <WorkflowIcon className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleClearMessages}
            disabled={viewMessages.length === 0 || sending}
            title={t("chat.clearMessages")}
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
                        workspaceId={TEAM_RUNTIME_WORKSPACE_ID}
                        agent={participantsById.get(message.senderId)}
                        teamId={teamId}
                        actorAgentId={actorAgentId}
                        onAgentUpdated={() => { void loadRuntime(); }}
                        onConfigureAgent={(agentId, agent) => {
                          setConfigAgent({ id: agentId, agent });
                        }}
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
            onConfigureAgent={(agentId, agent) => {
              setConfigAgent({ id: agentId, agent });
            }}
            onAgentBindingsChange={async (agentId, updates) => {
              const response = await fetch(`/api/teams/${teamId}/update-agent`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  actor_agent_id: actorAgentId,
                  agent_id: agentId,
                  agent: { ...participantsById.get(agentId), ...updates, id: agentId },
                }),
              });
              const payload = await response.json() as { success?: boolean; message?: string };
              if (!response.ok || payload.success === false) {
                throw new Error(payload.message || t("chat.saveFailed"));
              }
              await loadRuntime();
            }}
            showAgentBar
            showAddMember={false}
          />
        </>
      )}
      {configAgent && (configStoreAgent || configCustomAgent) ? (
        <Dialog open onOpenChange={(open) => { if (!open) setConfigAgent(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
            <DialogHeader className="border-b px-5 py-3">
              <DialogTitle>{t("chat.configureAgent")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>
            {configStoreAgent ? (
              <AgentEditor
                agent={normalizeAgent(configStoreAgent)}
                onSaved={() => setConfigAgent(null)}
                onBack={() => setConfigAgent(null)}
                showFooter
              />
            ) : configCustomAgent ? (
              <AgentEditor
                agent={normalizeAgent({ id: configAgent.id, ...configCustomAgent } as AgentConfig)}
                commit={async (draft: AgentPreset) => {
                  const response = await fetch(`/api/teams/${teamId}/update-agent`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      actor_agent_id: actorAgentId,
                      agent_id: configAgent.id,
                      agent: { ...draft, id: configAgent.id },
                    }),
                  });
                  const payload = await response.json() as { success?: boolean; message?: string };
                  if (!response.ok || payload.success === false) {
                    throw new Error(payload.message || t("chat.saveFailed"));
                  }
                  return { ...draft, id: configAgent.id };
                }}
                onSaved={() => {
                  setConfigAgent(null);
                  void loadRuntime();
                }}
                onBack={() => setConfigAgent(null)}
                showFooter
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog open={workflowOpen} onOpenChange={setWorkflowOpen}>
        <DialogContent className="flex h-[80vh] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle>{t("chat.workflowTitle")}</DialogTitle>
            <DialogDescription>{t("chat.workflowDescription", { count: workflowDeliveries.length })}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <WorkflowPreview
              workflowId={messageWorkflow.workflow.id}
              workflow={messageWorkflow.workflow}
              selectedExecutionLog={messageWorkflow.executionLog}
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
