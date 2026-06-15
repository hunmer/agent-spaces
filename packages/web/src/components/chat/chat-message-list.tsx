"use client";

import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import type { WorkflowAgentTimelineItem, WorkflowAgentToolCall } from "@agent-spaces/shared";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Copy,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChatToolTimeline, normalizeChatTimeline } from "./chat-tool-timeline";

export interface DisplayChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date | string;
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
  isStreamingMessage?: (message: TMessage) => boolean;
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
  isStreamingMessage,
}: ChatMessageListProps<TMessage>) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const t = useTranslations("chat.messageBubble");

  const handleCopyMessage = async (message: TMessage) => {
    const text = serializeForCopy
      ? serializeForCopy(message)
      : extractThinkingContent(message.content).message || message.content;
    await navigator.clipboard.writeText(text);
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === message.id ? null : current));
    }, 1200);
  };

  const messageNodes = messages.map((msg) => {
    const { thinking, message } =
      msg.role === "agent" ? extractThinkingContent(msg.content) : { thinking: null, message: msg.content };
    const streaming = isStreamingMessage?.(msg) ?? false;
    const showStreamingPlaceholder = streaming && !thinking && !message;
    const hasMessageBody =
      showStreamingPlaceholder || msg.role === "user" || thinking !== null || message.trim().length > 0;
    const timeline = msg.role === "agent" ? normalizeChatTimeline(getMessageTimeline(msg)) : [];
    const hasTimeline = timeline.length > 0;
    if (!hasMessageBody && !renderMessageExtras && !hasTimeline) return null;

    const versions = versionInfo?.(msg);
    const hasVersions = msg.role === "agent" && versions && versions.count > 1 && versions.onChange;
    const versionNumber = versions ? Math.min(versions.index + 1, versions.count) : 1;

    const content = (
      <div className={cn("flex gap-3 group/message", msg.role === "user" && "flex-row-reverse self-end", messageClassName)}>
        <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1", msg.role === "user" && "items-end")}>
          {hasMessageBody ? (
            <div
              className={cn(
                "border border-border/20 px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                msg.role === "user"
                  ? "rounded-2xl rounded-tr-none bg-primary text-primary-foreground"
                  : "rounded-2xl rounded-tl-none bg-muted/50 backdrop-blur-sm",
              )}
            >
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <>
                  {thinking !== null && <ThinkingBlock content={thinking} />}
                  {showStreamingPlaceholder ? (
                    <div className="flex items-center gap-1 py-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40" />
                    </div>
                  ) : message.trim().length > 0 ? (
                    renderMessageContent ? (
                      renderMessageContent({ ...msg, content: message })
                    ) : markdown ? (
                      <Markdown content={message} workspaceId={workspaceId} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{message}</p>
                    )
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {hasTimeline ? <ChatToolTimeline timeline={timeline} workspaceId={workspaceId} /> : null}
          {renderMessageExtras?.(msg)}
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
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
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
    <div className={cn("flex flex-col gap-3", className)}>
      {messages.length === 0 && !sending ? renderEmpty : null}
      {animated ? <AnimatePresence>{messageNodes}</AnimatePresence> : messageNodes}
      {sending && showTypingIndicator ? <TypingIndicator animated={animated} /> : null}
    </div>
  );
}
