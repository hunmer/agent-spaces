// packages/web/src/components/chat/inline-chat-panel.tsx
"use client";

import { Button } from "@/components/ui/button";
import { AgentIcon } from "@/components/common/agent-icon";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Eraser, MessageSquare, PanelRightOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import type { AgentUsageRecord, AgentUsageSessionDetail, Attachment as MessageAttachment, BuiltInAgentToolName } from "@agent-spaces/shared";
import type { WorkflowAgentTimelineItem } from "@agent-spaces/shared";
import { useAgentStore } from "@/stores/agent";
import { useChatStore } from "@/stores/chat";
import { ChatComposerInput, type ChatComposerInputHandle, type ChatComposerInputState } from "./chat-composer-input";
import { ChatInputInfoBar } from "./chat-input-info-bar";
import { ChatMessageList } from "./chat-message-list";
import type { ChatMessage } from "@agent-spaces/sdk";
import type { MentionedAgent } from "./chat-input-utils";

const EMPTY_COMPOSER_STATE: ChatComposerInputState = {
  mentionedAgentIds: [],
  activeMcps: [],
  activeSkills: [],
  activeTools: [],
  activeWorkflowIds: [],
  activeWorkflowPluginTools: [],
};

function normalizeSkills(skills?: Array<string | { name: string; content?: string }>): string[] | undefined {
  return skills?.map((item) => typeof item === "string" ? item : item.name).filter(Boolean);
}

type InlineChatMessage = ChatMessage & {
  metadata?: {
    systemPrompt?: string;
    fullPrompt?: string;
  };
};

interface InlineChatPanelProps {
  sessionId: string;
  agentId: string;
  agentName: string;
  agentAvatar?: string;
  agentIcon?: string;
  agentDescription?: string;
  agentSystemPrompt?: string;
  agentMcps?: Record<string, unknown>;
  agentSkills?: string[];
  agentTools?: BuiltInAgentToolName[];
  messages: ChatMessage[];
  sending: boolean;
  error?: string;
  streamingContent?: string;
  streamingThinking?: string;
  streamingTimeline?: WorkflowAgentTimelineItem[];
  workspaceId?: string;
  onSend: (content: string, mentions: string[], attachments: MessageAttachment[], contextLength: number) => void;
  onStop: () => void;
  onClearMessages: (agentId: string) => void;
  onEditAgent: (agentId: string) => void;
  onToggleRightPanel?: () => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  archived?: boolean;
}

export function InlineChatPanel({
  sessionId,
  agentId,
  agentName,
  agentAvatar,
  agentIcon,
  agentDescription,
  agentSystemPrompt,
  agentMcps,
  agentSkills,
  agentTools,
  messages,
  sending,
  error = "",
  streamingContent = "",
  streamingThinking = "",
  streamingTimeline = [],
  workspaceId,
  onSend,
  onStop,
  onClearMessages,
  onEditAgent,
  onToggleRightPanel,
  onRegenerate,
  onDelete,
  archived = false,
}: InlineChatPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerInputHandle>(null);
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({});
  const [regeneratingVersionKey, setRegeneratingVersionKey] = useState<string | null>(null);
  const [regenerationStartedAt, setRegenerationStartedAt] = useState<string | null>(null);
  const [contextLength, setContextLength] = useState(0);
  const [composerState, setComposerState] = useState<ChatComposerInputState>(EMPTY_COMPOSER_STATE);
  const ensureAgents = useAgentStore((s) => s.ensure);
  const storeAgents = useAgentStore((s) => s.agents);
  const chatAgents = useChatStore((s) => s.agents);
  const storedAgent = useMemo(
    () => storeAgents.find((agent) => agent.id === agentId) ?? chatAgents.find((agent) => agent.id === agentId),
    [agentId, chatAgents, storeAgents],
  );
  const composerAgents = useMemo<MentionedAgent[]>(() => [{
    id: agentId,
    name: storedAgent?.name || agentName,
    role: storedAgent?.role || "agent",
    description: storedAgent?.description || agentDescription,
    enabled: storedAgent?.enabled ?? true,
    mcps: storedAgent?.mcps ?? agentMcps,
    skills: normalizeSkills(storedAgent?.skills) ?? agentSkills,
    tools: storedAgent?.tools ?? agentTools,
    boundWorkflowIds: storedAgent?.boundWorkflowIds ?? [],
    boundWorkflowPluginTools: storedAgent?.boundWorkflowPluginTools ?? [],
    suggestions: storedAgent?.suggestions ?? [],
    avatarUrl: storedAgent?.avatarUrl || agentAvatar,
  }], [agentId, agentName, agentDescription, agentMcps, agentSkills, agentTools, agentAvatar, storedAgent]);
  const messageItems = useMemo(() => groupMessageVersions(messages), [messages]);
  const t = useTranslations('chat.inlineChat');
  const isRegenerating = sending && regeneratingVersionKey !== null;
  const sessionRecordForMessage = useCallback((message: ChatMessage) => (
    buildInlineSessionRecord(message, sessionId, workspaceId, agentId)
  ), [agentId, sessionId, workspaceId]);
  const sessionDetailForMessage = useCallback((message: ChatMessage) => (
    buildInlineSessionDetail(
      sessionId,
      agentId,
      messages,
      (message as InlineChatMessage).metadata?.systemPrompt ?? agentSystemPrompt,
      (message as InlineChatMessage).metadata?.fullPrompt,
    )
  ), [agentId, agentSystemPrompt, messages, sessionId]);

  useEffect(() => {
    void ensureAgents();
  }, [ensureAgents]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, error, streamingContent, streamingThinking]);

  useEffect(() => {
    if (sending) return;
    setRegeneratingVersionKey(null);
    setRegenerationStartedAt(null);
  }, [sending]);

  const handleSend = (
    content: string,
    mentions: string[],
    attachments: MessageAttachment[],
    contextLength: number,
  ) => {
    setRegeneratingVersionKey(null);
    setRegenerationStartedAt(null);
    onSend(content, mentions, attachments, contextLength);
  };

  const createStreamingMessage = (key: string, timeline?: WorkflowAgentTimelineItem[]): ChatMessage => ({
    id: `${agentId}:regenerating:${key}`,
    agentId,
    role: "agent",
    content: streamingThinking ? `<think>${streamingThinking}</think>${streamingContent}` : streamingContent,
    timestamp: regenerationStartedAt ?? new Date().toISOString(),
    timeline,
  });

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex min-w-0 shrink-0 items-center gap-3 border-b px-4 py-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-left hover:opacity-80 transition-opacity"
          onClick={() => onEditAgent(agentId)}
          type="button"
        >
          <div className="relative flex flex-shrink-0 items-end">
            <AgentIcon agentId={agentId} name={agentName} avatarUrl={agentAvatar} icon={agentIcon} className="size-9" bordered />
            <span className="-bottom-0 absolute right-0 flex items-center">
              <span
                aria-label={sending ? "running" : "idle"}
                className={`inline-block size-2.5 rounded-full border-2 border-background ${sending ? "bg-blue-500 animate-pulse" : "bg-green-500"}`}
              />
            </span>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <h3 className="truncate text-base font-semibold text-primary decoration-primary/30 hover:decoration-primary transition-colors">{agentName}</h3>
            <span className="truncate text-xs text-muted-foreground">
              {agentDescription || (sending ? t('typing') : t('online'))}
            </span>
          </div>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            aria-label={t('clearMessages')}
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => onClearMessages(agentId)}
            size="icon"
            variant="ghost"
            type="button"
          >
            <Eraser className="size-4" />
          </Button>
                {onToggleRightPanel && (
            <Button
              aria-label={t('togglePanel')}
              className="size-8 text-muted-foreground"
              onClick={onToggleRightPanel}
              size="icon"
              variant="ghost"
              type="button"
            >
              <PanelRightOpen className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex min-h-full flex-col gap-3">
          {messages.length === 0 && !sending && (() => {
            const openingMessage = storedAgent?.openingMessage?.trim();
            const suggestions = (storedAgent?.suggestions ?? []).filter((s) => s.trim());
            return (
              <>
                {openingMessage ? (
                  <div className="flex gap-3">
                    <AgentIcon agentId={agentId} name={agentName} avatarUrl={agentAvatar} icon={agentIcon} className="size-7" bordered />
                    <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-none border bg-muted/50 px-4 py-3 text-sm">
                      {openingMessage}
                    </div>
                  </div>
                ) : (
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <MessageSquare />
                      </EmptyMedia>
                      <EmptyTitle>{t('startConversation')}</EmptyTitle>
                      <EmptyDescription>{t('startConversationDesc')}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                {suggestions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {openingMessage && (
                      <div className="px-1 text-xs font-medium text-muted-foreground">{t('suggestions')}</div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion}-${index}`}
                          type="button"
                          onClick={() => composerRef.current?.insertText(suggestion)}
                          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent hover:border-foreground/30 cursor-pointer"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          {messageItems.map((item) => {
            if (item.type === "single") {
              return (
                <ChatMessageList
                  key={item.message.id}
                  messages={[item.message]}
                  sending={false}
                  workspaceId={workspaceId}
                  showTypingIndicator={false}
                  onDeleteMessage={onDelete}
                  sessionRecordForMessage={sessionRecordForMessage}
                  sessionDetailForMessage={sessionDetailForMessage}
                />
              );
            }

            const streamingMessage = isRegenerating && regeneratingVersionKey === item.key
              ? createStreamingMessage(item.key, streamingTimeline)
              : null;
            const versionMessages = streamingMessage ? [...item.messages, streamingMessage] : item.messages;
            const selectedIndex = selectedVersions[item.key] ?? versionMessages.length - 1;
            const clampedIndex = Math.min(selectedIndex, versionMessages.length - 1);
            const selectedMessage = versionMessages[clampedIndex];
            if (!selectedMessage) return null;
            const isStreamingVersion = selectedMessage?.id === streamingMessage?.id;

            return (
              <ChatMessageList
                key={item.key}
                messages={[selectedMessage]}
                sending={false}
                workspaceId={workspaceId}
                showTypingIndicator={false}
                onDeleteMessage={!isStreamingVersion ? onDelete : undefined}
                onRegenerateMessage={!sending && onRegenerate ? (message) => {
                  setRegeneratingVersionKey(item.key);
                  setRegenerationStartedAt(new Date().toISOString());
                  setSelectedVersions((prev) => ({ ...prev, [item.key]: item.messages.length }));
                  onRegenerate(message.id);
                } : undefined}
                versionInfo={() => ({
                  index: clampedIndex,
                  count: versionMessages.length,
                  onChange: (index) => setSelectedVersions((prev) => ({ ...prev, [item.key]: index })),
                })}
                isStreamingMessage={(message) => message.id === streamingMessage?.id}
                sessionRecordForMessage={sessionRecordForMessage}
                sessionDetailForMessage={sessionDetailForMessage}
              />
            );
          })}
          {error && (
            <div className="flex gap-3">
              <AgentIcon agentId={agentId} name={agentName} avatarUrl={agentAvatar} icon={agentIcon} className="size-7" bordered />
              <div className="max-w-[78%] rounded-2xl rounded-tl-none border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <div className="font-medium">{t('requestFailed')}</div>
                <div className="mt-1 whitespace-pre-wrap break-words text-xs">{error}</div>
              </div>
            </div>
          )}
          {sending && !isRegenerating && (streamingContent || streamingThinking || streamingTimeline.length > 0) && (
            <ChatMessageList
              messages={[createStreamingMessage("current", streamingTimeline)]}
              sending={false}
              workspaceId={workspaceId}
              showTypingIndicator={false}
              isStreamingMessage={() => true}
              sessionRecordForMessage={sessionRecordForMessage}
              sessionDetailForMessage={sessionDetailForMessage}
            />
          )}
          {sending && !isRegenerating && !streamingContent && !streamingThinking && streamingTimeline.length === 0 && (
            <div className="flex gap-3">
              <AgentIcon agentId={agentId} name={agentName} avatarUrl={agentAvatar} icon={agentIcon} className="size-7" bordered />
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-none bg-muted/50 px-4 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-foreground/40" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      {!archived && (
        <div className="shrink-0 border-t p-3">
          <ChatComposerInput
            ref={composerRef}
            workspaceId={workspaceId || ""}
            agents={composerAgents}
            placeholder={t('messagePlaceholder', { name: agentName })}
            contextLength={contextLength}
            onSubmit={handleSend}
            isProcessing={sending}
            onStop={onStop}
            disableMentionSuggestions
            enableAttachments
            enableVoice
            enableAutoMode={false}
            enableSlashCommands={false}
            enableAgentResources={false}
            enableModelSelector={false}
            implicitActiveAgentId={agentId}
            onStateChange={setComposerState}
          />
          <ChatInputInfoBar
            workspaceId={workspaceId || ""}
            mcps={composerState.activeMcps}
            skills={composerState.activeSkills}
            tools={composerState.activeTools}
            activeAgent={composerState.activeAgent}
            workflowIds={composerState.activeWorkflowIds}
            workflowPluginTools={composerState.activeWorkflowPluginTools}
            todos={[]}
            contextLength={contextLength}
            onContextLengthChange={setContextLength}
            enableRecentCode={false}
            onInsertText={(text) => composerRef.current?.insertText(text)}
          />
        </div>
      )}
    </div>
  );
}

type MessageRenderItem =
  | { type: "single"; message: ChatMessage }
  | { type: "versions"; key: string; messages: ChatMessage[] };

function buildInlineSessionRecord(
  message: ChatMessage,
  sessionId: string,
  workspaceId: string | undefined,
  agentId: string,
): AgentUsageRecord | null {
  if (message.role !== "agent") return null;
  const timestamp = message.timestamp || new Date().toISOString();
  return {
    id: message.id,
    workspaceId: workspaceId ?? "",
    agentSessionId: sessionId,
    agentConfigId: agentId,
    role: "assistant",
    status: "completed",
    model: undefined,
    inputTokens: message.usage?.inputTokens ?? 0,
    outputTokens: message.usage?.outputTokens ?? 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: message.usage?.totalTokens ?? 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
    startedAt: timestamp,
    completedAt: timestamp,
    durationMs: 0,
  } as AgentUsageRecord;
}

function buildInlineSessionDetail(
  sessionId: string,
  agentId: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  fullPrompt?: string,
): AgentUsageSessionDetail {
  return {
    session: null,
    usage: null,
    source: "none",
    systemPrompt,
    fullPrompt,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.timestamp,
      senderId: message.role === "agent" ? agentId : "user",
      timeline: message.timeline,
    })),
    rawSession: { id: sessionId, agentId, systemPrompt, fullPrompt, messages },
  };
}

function groupMessageVersions(messages: ChatMessage[]): MessageRenderItem[] {
  const items: MessageRenderItem[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;

    if (message.role === "user") {
      items.push({ type: "single", message });

      const replies: ChatMessage[] = [];
      let replyIndex = index + 1;
      while (replyIndex < messages.length && messages[replyIndex]?.role === "agent") {
        replies.push(messages[replyIndex]);
        replyIndex += 1;
      }

      if (replies.length > 0) {
        items.push({ type: "versions", key: `${message.id}-replies`, messages: replies });
        index = replyIndex - 1;
      }
      continue;
    }

    const orphanReplies: ChatMessage[] = [message];
    let replyIndex = index + 1;
    while (replyIndex < messages.length && messages[replyIndex]?.role === "agent") {
      orphanReplies.push(messages[replyIndex]);
      replyIndex += 1;
    }
    items.push({ type: "versions", key: message.id, messages: orphanReplies });
    index = replyIndex - 1;
  }

  return items;
}
