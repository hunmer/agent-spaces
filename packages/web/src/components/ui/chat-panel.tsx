'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { cn } from '@/lib/utils';
import type { WorkflowAgentTimelineItem, WorkflowAgentToolCall } from '@agent-spaces/shared';
import { motion, type Variants } from 'framer-motion';
import { Send, X, Square, ArrowDown, Lightbulb, Pencil } from 'lucide-react';
import { useId, useRef, useEffect, useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  toolCalls?: WorkflowAgentToolCall[];
  timeline?: WorkflowAgentTimelineItem[];
}

export interface ChatAgentInfo {
  name: string;
  role?: string;
  avatar?: string;
  status?: 'online' | 'busy' | 'offline';
}

export interface ChatPanelProps {
  /** Close button in header */
  onClose: () => void;

  /** Agent info displayed in header */
  agent: ChatAgentInfo;

  /** Messages */
  messages: ChatMessage[];
  /** Show typing indicator */
  sending?: boolean;

  /** Input */
  input: string;
  onInputChange: (value: string) => void;
  /**
   * 发送当前输入。可传入 text 直接发送指定内容（用于消息建议的「发送」），
   * 不传则发送当前 input。
   */
  onSend: (text?: string) => void;
  onStop?: () => void;
  inputPlaceholder?: string;
  /** 预设消息建议：输入框左侧展示 popover，提供「编辑（填入输入框）/发送」快捷操作 */
  suggestions?: string[];
  /** Optional content rendered above the input row. */
  inputContext?: ReactNode;

  /** Whether to render agent messages as Markdown */
  markdown?: boolean;
  /** workspaceId passed to Markdown component */
  workspaceId?: string;

  /** Extra header actions (settings, etc.) */
  headerActions?: ReactNode;
  /** Optional custom renderer for message body */
  renderMessageContent?: (message: ChatMessage) => ReactNode;
  /** Optional custom renderer for content below each message bubble */
  renderMessageExtras?: (message: ChatMessage) => ReactNode;
  /** Optional delete handler. When provided, each message shows a delete action on hover. */
  onDeleteMessage?: (messageId: string) => void;
  /** Optional custom serializer for copy action. Defaults to `message.content`. */
  serializeForCopy?: (message: ChatMessage) => string;

  /** Panel size */
  width?: number;
  height?: number;
}

const containerVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transformOrigin: 'bottom right',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      damping: 25,
      stiffness: 300,
      staggerChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

function StatusDot({ status }: { status?: string }) {
  return (
    <span
      className={cn(
        'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
        status === 'online' ? 'bg-emerald-500' : status === 'busy' ? 'bg-amber-500' : 'bg-slate-400'
      )}
    />
  );
}

export function ChatPanel({
  onClose,
  agent,
  messages,
  sending = false,
  input,
  onInputChange,
  onSend,
  onStop,
  inputPlaceholder,
  suggestions,
  inputContext,
  markdown = true,
  workspaceId,
  headerActions,
  renderMessageContent,
  renderMessageExtras,
  onDeleteMessage,
  serializeForCopy,
  width = 400,
  height = 360,
}: ChatPanelProps) {
  const widgetId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const isNearBottom = () => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollBtn(!isNearBottom());
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, []);

  const scrollToBottom = () => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };

  /** 将建议填入输入框（编辑模式：不发送） */
  const applySuggestion = (suggestion: string) => {
    onInputChange(suggestion);
    setSuggestionsOpen(false);
  };

  /** 直接发送该建议 */
  const sendSuggestion = (suggestion: string) => {
    setSuggestionsOpen(false);
    onSend(suggestion);
  };

  return (
    <motion.div
      key={`chat-panel-${widgetId}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="relative overflow-hidden rounded-2xl border border-border/40 bg-background/60 shadow-2xl backdrop-blur-xl ring-1 ring-white/10"
      style={{ width, maxHeight: height + 220 }}
    >
      {/* Header */}
      <div className="relative border-b border-border/40 bg-muted/30 p-4 overflow-hidden">
        <div className="relative flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                {agent.avatar && <AvatarImage src={agent.avatar} alt={agent.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {agent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <StatusDot status={agent.status} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {agent.role || (sending ? 'typing…' : 'online')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-background/50"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex flex-col gap-3 overflow-y-auto p-4 bg-gradient-to-b from-background/20 to-background/40"
        style={{ height }}
      >
        <ChatMessageList
          messages={messages}
          sending={sending}
          markdown={markdown}
          workspaceId={workspaceId}
          animated
          renderEmpty={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              暂无消息
            </div>
          }
          renderMessageContent={renderMessageContent}
          renderMessageExtras={renderMessageExtras}
          onDeleteMessage={onDeleteMessage}
          serializeForCopy={serializeForCopy}
        />
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-20 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 shadow-lg border border-border/40 backdrop-blur-sm hover:bg-background transition-colors"
        >
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {/* Input */}
      <div className="border-t border-border/40 bg-background/60 p-3 backdrop-blur-md">
        {inputContext ? <div className="mb-2">{inputContext}</div> : null}
        <form
          className="relative flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (sending) {
              onStop?.();
              return;
            }
            onSend();
          }}
        >
          {suggestions && suggestions.length > 0 && (
            <Popover open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    aria-label="消息建议"
                  />
                }
              >
                <Lightbulb className="h-5 w-5" />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-72 p-1.5">
                <div className="flex flex-col gap-0.5">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={`${index}-${suggestion}`}
                      className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent"
                    >
                      <button
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                        title={suggestion}
                      >
                        {suggestion}
                      </button>
                      <button
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        title="填入输入框"
                        aria-label="填入输入框"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => sendSuggestion(suggestion)}
                        title="发送"
                        aria-label="发送"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-primary group-hover:opacity-100"
                      >
                        <Send className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder || `Message ${agent.name}...`}
            className="flex-1 rounded-full border border-border/40 bg-background/50 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/10"
          />
          <Button
            type="submit"
            size={sending ? 'sm' : 'icon'}
            className={cn(
              'h-10 rounded-full text-primary-foreground shadow-lg transition-transform hover:scale-105 cursor-pointer',
              sending
                ? 'w-auto gap-1.5 bg-destructive px-4 hover:bg-destructive/90'
                : 'w-10 bg-primary hover:shadow-primary/25'
            )}
            disabled={!sending && !input.trim()}
          >
            {sending ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span className="text-xs font-medium">停止</span>
              </>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
