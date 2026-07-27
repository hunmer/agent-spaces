'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ComposerShell } from '@/components/composer/composer-shell';
import { createSuggestionRenderer } from '@/components/composer/create-suggestion-renderer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { WorkflowAgentTimelineItem, WorkflowAgentToolCall, AgentUsageRecord, AgentUsageSessionDetail } from '@agent-spaces/shared';
import type { Editor, Range } from '@tiptap/core';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { useEditor, useEditorState } from '@tiptap/react';
import { motion, type Variants } from 'framer-motion';
import { ArrowDown, Lightbulb, MessageCircle, Pencil, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  toolCalls?: WorkflowAgentToolCall[];
  timeline?: WorkflowAgentTimelineItem[];
  /** 控制消息级按钮的元数据（如 agentSessionId 触发"查看上下文"按钮） */
  metadata?: {
    agentSessionId?: string;
    agentId?: string;
    runtime?: string;
    model?: string;
    duration?: number;
    summary?: string;
  };
}

export interface ChatAgentInfo {
  name: string;
  role?: string;
  avatar?: string;
  status?: 'online' | 'busy' | 'offline';
}

export interface ChatPanelMentionFile {
  path: string;
  name?: string;
}

export interface ChatPanelProps {
  onClose: () => void;
  agent: ChatAgentInfo;
  messages: ChatMessage[];
  sending?: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (text?: string) => void;
  onStop?: () => void;
  inputPlaceholder?: string;
  suggestions?: string[];
  /** 空态展示的介绍文本（无消息时显示在 suggestions 上方） */
  introduction?: string;
  mentionFiles?: ChatPanelMentionFile[];
  inputContext?: ReactNode;
  markdown?: boolean;
  workspaceId?: string;
  headerActions?: ReactNode;
  renderMessageContent?: (message: ChatMessage) => ReactNode;
  renderMessageExtras?: (message: ChatMessage) => ReactNode;
  onDeleteMessage?: (messageId: string) => void;
  serializeForCopy?: (message: ChatMessage) => string;
  onRerunTool?: (message: ChatMessage, item: Extract<WorkflowAgentTimelineItem, { type: 'tool' }>) => void;
  onAnswerAskUserQuestion?: (message: ChatMessage, item: Extract<WorkflowAgentTimelineItem, { type: 'tool' }>, answer: string) => void | Promise<void>;
  /** 重新生成 agent 消息（删除该消息后基于上一条 user 消息重跑） */
  onRegenerateMessage?: (message: ChatMessage) => void;
  /** 提供"查看上下文"对话框数据；返回非 null 时显示按钮 */
  sessionDetailForMessage?: (message: ChatMessage) => { record: AgentUsageRecord; detail: AgentUsageSessionDetail } | null | undefined;
  width?: number;
  height?: number;
  className?: string;
  messageListClassName?: string;
  style?: CSSProperties;
  fillContainer?: boolean;
}

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95, transformOrigin: 'bottom right' },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, damping: 25, stiffness: 300, staggerChildren: 0.05 },
  },
  exit: { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.2 } },
};

function StatusDot({ status }: { status?: string }) {
  return (
    <span
      className={cn(
        'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
        status === 'online' ? 'bg-emerald-500' : status === 'busy' ? 'bg-amber-500' : 'bg-slate-400',
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
  introduction,
  mentionFiles,
  inputContext,
  markdown = true,
  workspaceId,
  headerActions,
  renderMessageContent,
  renderMessageExtras,
  onDeleteMessage,
  serializeForCopy,
  onRerunTool,
  onAnswerAskUserQuestion,
  onRegenerateMessage,
  sessionDetailForMessage,
  width = 400,
  height = 360,
  className,
  messageListClassName,
  style,
  fillContainer = false,
}: ChatPanelProps) {
  const widgetId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const inputRef = useRef(input);
  const submittingRef = useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const mentionExtension = useMemo(() => Mention.configure({
    HTMLAttributes: { class: 'mention' },
    suggestion: {
      char: '@',
      items: ({ query }: { query: string }) => {
        const keyword = query.toLowerCase();
        return (mentionFiles ?? [])
          .filter((file) => `${file.path} ${file.name ?? ''}`.toLowerCase().includes(keyword))
          .slice(0, 8)
          .map((file) => ({
            id: file.path,
            label: file.path,
            description: file.name ?? file.path.split('/').pop() ?? file.path,
          }));
      },
      command: ({ editor, range, props }: { editor: Editor; range: Range; props: MentionNodeAttrs }) => {
        editor.chain().focus().insertContentAt(range, [
          { type: 'mention', attrs: props },
          { type: 'text', text: ' ' },
        ]).run();
      },
      render: () => createSuggestionRenderer(),
    },
  }), [mentionFiles]);

  const submitInput = () => {
    const text = inputRef.current.trim();
    if (!text || submittingRef.current) return;
    submittingRef.current = true;
    onSend(text);
    editorRef.current?.commands.clearContent();
    onInputChange('');
    queueMicrotask(() => { submittingRef.current = false; });
  };

  const submitRef = useRef(submitInput);
  useEffect(() => {
    submitRef.current = submitInput;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: inputPlaceholder || `Message ${agent.name}...` }),
      mentionExtension,
    ],
    editorProps: {
      attributes: { class: 'tiptap tiptap-chat min-h-10 pr-8 outline-none' },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Enter' || event.shiftKey) return false;
        if (document.querySelector('.suggestion-menu')) return false;
        event.preventDefault();
        submitRef.current();
        return true;
      },
    },
    content: input,
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      inputRef.current = text;
      onInputChange(text);
    },
  }, [agent.name, inputPlaceholder, mentionExtension]);

  const hasText = useEditorState({
    editor,
    selector: (ctx) => !!ctx.editor?.getText().trim(),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    inputRef.current = input;
    if (!editor || editor.getText() === input) return;
    editor.commands.setContent(input, { emitUpdate: false });
  }, [editor, input]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight >= 40);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, []);

  const applySuggestion = (suggestion: string) => {
    inputRef.current = suggestion;
    onInputChange(suggestion);
    editor?.commands.setContent(suggestion, { emitUpdate: false });
    editor?.commands.focus('end');
    setSuggestionsOpen(false);
  };

  const sendSuggestion = (suggestion: string) => {
    setSuggestionsOpen(false);
    onSend(suggestion);
  };

  const suggestionAction = suggestions?.length ? (
    <Popover open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-background/60 hover:text-foreground"
            aria-label="消息建议"
          />
        }
      >
        <Lightbulb className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-1.5">
        <div className="flex flex-col gap-0.5">
          {suggestions.map((suggestion, index) => (
            <div key={`${index}-${suggestion}`} className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent">
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
  ) : null;

  return (
    <motion.div
      key={`chat-panel-${widgetId}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/40 bg-background/60 shadow-2xl backdrop-blur-xl ring-1 ring-white/10',
        fillContainer && 'flex h-full flex-col',
        className,
      )}
      style={fillContainer ? { width: '100%', height: '100%', maxHeight: 'none', ...style } : { width, maxHeight: height + 220, ...style }}
    >
      <div className="relative overflow-hidden border-b border-border/40 bg-muted/30 p-4">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                {agent.avatar && <AvatarImage src={agent.avatar} alt={agent.name} />}
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {agent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <StatusDot status={agent.status} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{agent.role || (sending ? 'typing...' : 'online')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-background/50" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        className={cn(
          'flex flex-col gap-3 overflow-y-auto bg-gradient-to-b from-background/20 to-background/40 p-4',
          fillContainer && 'min-h-0 flex-1',
          messageListClassName,
        )}
        style={fillContainer ? undefined : { height }}
      >
        <ChatMessageList
          messages={messages}
          sending={sending}
          markdown={markdown}
          workspaceId={workspaceId}
          animated
          renderEmpty={
            <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-6 text-center">
              {introduction?.trim() ? (
                <div className="flex w-full max-w-md items-start gap-2 rounded-xl border border-border bg-background px-4 py-3 text-left">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="whitespace-pre-wrap break-words text-sm text-foreground">{introduction}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">暂无消息</div>
              )}
              {(suggestions ?? []).filter((s) => s.trim()).length > 0 && (
                <div className="flex w-full max-w-md flex-col items-stretch gap-2">
                  {suggestions!.filter((s) => s.trim()).map((suggestion, index) => (
                    <button
                      key={`${suggestion}-${index}`}
                      type="button"
                      onClick={() => onInputChange(suggestion)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent hover:border-foreground/30 cursor-pointer"
                    >
                      <MessageCircle className="size-3.5 shrink-0 text-muted-foreground" />
                      <span>{suggestion}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
          renderMessageContent={renderMessageContent}
          renderMessageExtras={renderMessageExtras}
          onDeleteMessage={onDeleteMessage}
          serializeForCopy={serializeForCopy}
          onRerunTool={onRerunTool}
          onAnswerAskUserQuestion={onAnswerAskUserQuestion}
          onRegenerateMessage={onRegenerateMessage}
          sessionRecordForMessage={sessionDetailForMessage ? (msg) => sessionDetailForMessage(msg)?.record ?? null : undefined}
          sessionDetailForMessage={sessionDetailForMessage ? (msg) => sessionDetailForMessage(msg)?.detail ?? null : undefined}
        />
      </div>

      {showScrollBtn && (
        <button
          type="button"
          onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })}
          className="absolute bottom-20 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border/40 bg-background/80 shadow-lg backdrop-blur-sm transition-colors hover:bg-background"
        >
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      <div className="border-t border-border/40 bg-background/60 p-3 backdrop-blur-md">
        {inputContext ? <div className="mb-2">{inputContext}</div> : null}
        <ComposerShell
          editor={editor}
          canSubmit={Boolean(hasText)}
          contextLength={0}
          onSubmit={submitInput}
          onStop={onStop}
          isProcessing={sending}
          actions={suggestionAction}
          className="[&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:px-1 [&_.mention]:text-primary [&_.tiptap-chat]:text-sm [&_.tiptap-chat]:leading-6 [&_.tiptap-chat_p]:my-0"
        />
      </div>
    </motion.div>
  );
}
