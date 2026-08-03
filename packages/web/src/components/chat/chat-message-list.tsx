"use client";

import { Markdown } from "@/components/ui/markdown";
import { cn, copyToClipboard } from "@/lib/utils";
import type { AgentUsageRecord, AgentUsageSessionDetail, WorkflowAgentTimelineItem, WorkflowAgentToolCall } from "@agent-spaces/shared";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Copy,
  FileText,
  GitBranch,
  RefreshCw,
  Trash2,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { UsageDashboardSessionDialog } from "@/components/home/usage-dashboard-session-dialog";
import { ChatToolTimeline, normalizeChatTimeline } from "./chat-tool-timeline";
import { AskUserQuestion } from "./ask-user-question";

export interface DisplayChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date | string;
  agentId?: string;
  metadata?: {
    agentSessionId?: string;
    runtime?: string;
    model?: string;
    duration?: number;
    summary?: string;
    systemPrompt?: string;
    fullPrompt?: string;
  };
  toolCalls?: WorkflowAgentToolCall[];
  timeline?: WorkflowAgentTimelineItem[];
}

export interface ChatMessageListProps<TMessage extends DisplayChatMessage> {
  messages: TMessage[];
  sending?: boolean;
  markdown?: boolean;
  workspaceId?: string;
  className?: string;
  messageClassName?: string;
  animated?: boolean;
  showTypingIndicator?: boolean;
  renderEmpty?: React.ReactNode;
  renderMessageContent?: (message: TMessage) => React.ReactNode;
  renderMessageExtras?: (message: TMessage) => React.ReactNode;
  onDeleteMessage?: (messageId: string) => void;
  serializeForCopy?: (message: TMessage) => string;
  versionInfo?: (message: TMessage) => {
    index: number;
    count: number;
    onChange?: (index: number) => void;
  } | null | undefined;
  onRegenerateMessage?: (message: TMessage) => void;
  onBranchMessage?: (message: TMessage) => void | Promise<void>;
  isStreamingMessage?: (message: TMessage) => boolean;
  onRerunTool?: (message: TMessage, item: Extract<WorkflowAgentTimelineItem, { type: "tool" }>) => void;
  onAnswerAskUserQuestion?: (message: TMessage, item: Extract<WorkflowAgentTimelineItem, { type: "tool" }>, answer: string) => void | Promise<void>;
  sessionRecordForMessage?: (message: TMessage) => AgentUsageRecord | null | undefined;
  sessionDetailForMessage?: (message: TMessage) => AgentUsageSessionDetail | null | undefined;
}

const messageVariants: Variants = {
  hidden: { opacity: 0, y: 10, x: -10 },
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
    transition: { type: "spring" as const, stiffness: 500, damping: 30 },
  },
};

export function extractThinkingContent(content: string): { thinking: string | null; message: string } {
  const match = content.match(/^<think\s*>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
  if (match) return { thinking: match[1].trim(), message: match[2].trim() };
  return { thinking: null, message: content };
}

function formatTime(timestamp: Date | string) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getMessageTimeline(message: DisplayChatMessage): WorkflowAgentTimelineItem[] {
  return message.timeline?.length
    ? message.timeline
    : message.toolCalls?.map((toolCall) => ({ ...toolCall, type: "tool" as const })) ?? [];
}

function buildSessionRecord(message: DisplayChatMessage, workspaceId?: string): AgentUsageRecord | null {
  const sessionId = message.metadata?.agentSessionId;
  if (!sessionId) return null;
  const timestamp = message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp;
  return {
    id: message.id,
    workspaceId: workspaceId ?? "",
    agentSessionId: sessionId,
    agentConfigId: message.agentId ?? "",
    role: "assistant",
    status: "completed",
    runtime: message.metadata?.runtime,
    model: message.metadata?.model,
    summary: message.metadata?.summary,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
    startedAt: timestamp,
    completedAt: timestamp,
    durationMs: message.metadata?.duration ?? 0,
  } as AgentUsageRecord;
}

function parseAskUserQuestionInput(input: unknown): { question: string; choices: string[] } | null {
  if (!input || typeof input !== "object") return null;
  const questions = Array.isArray((input as { questions?: unknown }).questions)
    ? (input as { questions: unknown[] }).questions
    : [];
  const first = questions.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const question = typeof first?.question === "string" && first.question.trim()
    ? first.question.trim()
    : typeof first?.header === "string" && first.header.trim()
      ? first.header.trim()
      : "";
  if (!question) return null;
  const options = Array.isArray(first?.options) ? first.options : [];
  const choices = options
    .map((option) => {
      if (typeof option === "string") return option;
      if (!option || typeof option !== "object") return "";
      const record = option as Record<string, unknown>;
      return typeof record.label === "string" ? record.label : "";
    })
    .filter(Boolean);
  return { question, choices };
}

function getAskUserQuestionAnswer(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const answer = (result as { answer?: unknown }).answer;
  return typeof answer === "string" && answer.trim() ? answer : undefined;
}

function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("chat.messageBubble");

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        <Brain className="size-3" />
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRightIcon className="size-3" />}
        <span>{t("thinking")}</span>
      </button>
      {expanded && (
        <div className="mt-1 whitespace-pre-wrap break-words border-l-2 border-muted-foreground/20 pl-3 text-xs text-muted-foreground/70">
          {content}
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ animated }: { animated: boolean }) {
  const content = (
    <div className="flex gap-3" aria-label="AI is typing">
      <div className="flex flex-col gap-1">
        <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-tl-none border border-border/20 bg-muted/50 px-4 py-3 shadow-sm backdrop-blur-sm">
          <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-foreground/40" />
        </div>
      </div>
    </div>
  );

  if (!animated) return content;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      {content}
    </motion.div>
  );
}

function InlineLoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40" />
    </div>
  );
}

export function ChatMessageList<TMessage extends DisplayChatMessage>({
  messages,
  sending = false,
  markdown = true,
  workspaceId,
  className,
  messageClassName,
  animated = false,
  showTypingIndicator = true,
  renderEmpty,
  renderMessageContent,
  renderMessageExtras,
  onDeleteMessage,
  serializeForCopy,
  versionInfo,
  onRegenerateMessage,
  onBranchMessage,
  isStreamingMessage,
  onRerunTool,
  onAnswerAskUserQuestion,
  sessionRecordForMessage,
  sessionDetailForMessage,
}: ChatMessageListProps<TMessage>) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [visibleToolTimelineMessageIds, setVisibleToolTimelineMessageIds] = useState<Record<string, boolean>>({});
  const [selectedSessionRecord, setSelectedSessionRecord] = useState<AgentUsageRecord | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<AgentUsageSessionDetail | null>(null);
  const t = useTranslations("chat.messageBubble");

  const handleCopyMessage = async (message: TMessage) => {
    const text = serializeForCopy
      ? serializeForCopy(message)
      : extractThinkingContent(message.content).message || message.content;
    await copyToClipboard(text);
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === message.id ? null : current));
    }, 1200);
  };

  const messageNodes = messages.map((msg) => {
    const { thinking, message } =
      msg.role === "agent" ? extractThinkingContent(msg.content) : { thinking: null, message: msg.content };
    const streaming = isStreamingMessage?.(msg) ?? false;
    const timeline = msg.role === "agent" ? normalizeChatTimeline(getMessageTimeline(msg)) : [];
    const hasTimelineMessage = timeline.some((item) => item.type === "message" && item.content.trim().length > 0);
    const hasVisibleTimeline = timeline.some(
      (item) => item.type === "tool" || item.type === "thinking" || (item.type === "message" && item.content.trim().length > 0),
    );
    const showStreamingPlaceholder = streaming && !thinking && !message && !hasVisibleTimeline;
    const hasToolTimeline = timeline.some((item) => item.type === "tool");
    const showTimelineMessages = hasVisibleTimeline && (streaming || hasTimelineMessage);
    const visibleTimeline = showTimelineMessages ? timeline : timeline.filter((item) => item.type !== "message");
    const showTools = streaming || visibleToolTimelineMessageIds[msg.id] !== false;
    const showTimeline = visibleTimeline.some(
      (item) => item.type !== "tool" || showTools || (item.name === "askUserQuestions" && Boolean(parseAskUserQuestionInput(item.input))),
    );
    const canToggleTimeline = msg.role === "agent" && hasToolTimeline && !streaming;
    const bodyMessage = showTimelineMessages ? "" : message;
    const hasMessageBody =
      showStreamingPlaceholder || msg.role === "user" || thinking !== null || bodyMessage.trim().length > 0;
    if (!hasMessageBody && !renderMessageExtras && !showTimeline) return null;

    const versions = versionInfo?.(msg);
    const hasVersions = msg.role === "agent" && versions && versions.count > 1 && versions.onChange;
    const versionNumber = versions ? Math.min(versions.index + 1, versions.count) : 1;
    const sessionRecord = sessionRecordForMessage?.(msg) ?? buildSessionRecord(msg, workspaceId);

    const content = (
      <div
        className={cn(
          "group/message flex w-full min-w-0 max-w-full gap-3",
          messageClassName,
        )}
      >
        <div
          className={cn(
            "flex min-w-0 max-w-[85%] flex-col gap-1",
            msg.role === "user" ? "ml-auto items-end" : "mr-auto",
          )}
        >
          {hasMessageBody ? (
            <div
              className={cn(
                "min-w-0 max-w-full overflow-hidden border border-border/20 px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                msg.role === "user"
                  ? "rounded-2xl rounded-tr-none bg-primary text-primary-foreground"
                  : "rounded-2xl rounded-tl-none bg-muted/50 backdrop-blur-sm",
              )}
            >
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <>
                  {thinking !== null && !streaming && <ThinkingBlock content={thinking} />}
                  {showStreamingPlaceholder ? (
                    <InlineLoadingDots />
                  ) : bodyMessage.trim().length > 0 ? (
                    renderMessageContent ? (
                      renderMessageContent({ ...msg, content: bodyMessage })
                    ) : markdown ? (
                      <Markdown content={bodyMessage} workspaceId={workspaceId} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{bodyMessage}</p>
                    )
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {showTimeline ? (
            <ChatToolTimeline
              timeline={visibleTimeline}
              workspaceId={workspaceId}
              onRerunTool={onRerunTool ? (item) => onRerunTool(msg, item) : undefined}
              renderToolItem={(item) => {
                if (item.name !== "askUserQuestions") return null;
                const parsed = parseAskUserQuestionInput(item.input);
                if (!parsed) return null;
                const answer = getAskUserQuestionAnswer(item.result);
                return (
                  <AskUserQuestion
                    question={parsed.question}
                    choices={parsed.choices}
                    answer={answer}
                    status={answer ? "answered" : "requested"}
                    onAnswer={onAnswerAskUserQuestion ? (value) => {
                      void Promise.resolve(onAnswerAskUserQuestion(msg, item, value)).catch(() => {});
                    } : undefined}
                  />
                );
              }}
              showTools={showTools}
              streaming={streaming}
            />
          ) : null}
          {renderMessageExtras?.(msg)}
          {streaming && !showStreamingPlaceholder ? <InlineLoadingDots /> : null}
          <div className={cn("flex items-center gap-1", msg.role === "user" && "flex-row-reverse")}>
            <span
              className={cn(
                "text-[10px] font-mono",
                msg.role === "user" ? "text-primary-foreground/50" : "text-muted-foreground/60",
              )}
            >
              {formatTime(msg.timestamp)}
            </span>
            {hasVersions && versions ? (
              <div className="flex items-center gap-0.5 rounded border border-border/70 bg-background px-0.5">
                <button
                  type="button"
                  onClick={() => versions.onChange?.(Math.max(0, versions.index - 1))}
                  disabled={versions.index <= 0}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  title={t("previousVersion")}
                  aria-label={t("previousVersion")}
                >
                  <ChevronLeft className="size-3" />
                </button>
                <span className="min-w-8 text-center text-[10px] tabular-nums text-muted-foreground">
                  {versionNumber} / {versions.count}
                </span>
                <button
                  type="button"
                  onClick={() => versions.onChange?.(Math.min(versions.count - 1, versions.index + 1))}
                  disabled={versions.index >= versions.count - 1}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  title={t("nextVersion")}
                  aria-label={t("nextVersion")}
                >
                  <ChevronRight className="size-3" />
                </button>
              </div>
            ) : null}
            {msg.role === "agent" && onRegenerateMessage ? (
              <button
                type="button"
                onClick={() => onRegenerateMessage(msg)}
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={t("regenerate")}
                aria-label={t("regenerate")}
              >
                <RefreshCw className="size-3" />
              </button>
            ) : null}
            {canToggleTimeline ? (
              <button
                type="button"
                onClick={() => {
                  setVisibleToolTimelineMessageIds((current) => ({
                    ...current,
                    [msg.id]: current[msg.id] === false,
                  }));
                }}
                className={cn(
                  "flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  showTools && "bg-muted text-foreground",
                )}
                title={showTools ? t("hideToolCalls") : t("showToolCalls")}
                aria-label={showTools ? t("hideToolCalls") : t("showToolCalls")}
                aria-pressed={showTools}
              >
                <Wrench className="size-3" />
              </button>
            ) : null}
            {sessionRecord ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedSessionRecord(sessionRecord);
                  setSelectedSessionDetail(sessionDetailForMessage?.(msg) ?? null);
                }}
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={t("viewSessionContext")}
                aria-label={t("viewSessionContext")}
              >
                <FileText className="size-3" />
              </button>
            ) : null}
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
              {onBranchMessage && !streaming ? (
                <button
                  type="button"
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => void onBranchMessage(msg)}
                  title={t("branch")}
                  aria-label={t("branch")}
                >
                  <GitBranch className="size-3" />
                </button>
              ) : null}
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => void handleCopyMessage(msg)}
                title={copiedMessageId === msg.id ? t("copied") : t("copy")}
              >
                <Copy className="size-3" />
              </button>
              {onDeleteMessage ? (
                <button
                  type="button"
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onDeleteMessage(msg.id)}
                  title={t("delete")}
                >
                  <Trash2 className="size-3" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );

    if (!animated) return <div key={msg.id}>{content}</div>;

    return (
      <motion.div key={msg.id} variants={messageVariants}>
        {content}
      </motion.div>
    );
  });

  return (
    <>
      <div className={cn("flex flex-col gap-3", className)}>
        {messages.length === 0 && !sending ? renderEmpty : null}
        {animated ? <AnimatePresence>{messageNodes}</AnimatePresence> : messageNodes}
        {sending && showTypingIndicator ? <TypingIndicator animated={animated} /> : null}
      </div>
      <UsageDashboardSessionDialog
        record={selectedSessionRecord}
        open={Boolean(selectedSessionRecord)}
        detailOverride={selectedSessionDetail}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSessionRecord(null);
            setSelectedSessionDetail(null);
          }
        }}
      />
    </>
  );
}
