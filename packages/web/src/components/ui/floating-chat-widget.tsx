'use client';

import { ChatPanel, type ChatMessage, type ChatAgentInfo } from '@/components/ui/chat-panel';
import { cn } from '@/lib/utils';
import type { WorkflowAgentTimelineItem } from '@agent-spaces/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';

export type { ChatMessage, ChatAgentInfo } from '@/components/ui/chat-panel';

export interface FloatingChatPanelProps {
  /** Panel control */
  isOpen: boolean;
  onClose: () => void;
  onToggle?: () => void;

  /** Agent info displayed in header */
  agent: ChatAgentInfo;

  /** Messages */
  messages: ChatMessage[];
  /** Show typing indicator */
  sending?: boolean;

  /** Input */
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  inputPlaceholder?: string;
  /** Optional content rendered above the input row. */
  inputContext?: React.ReactNode;

  /** Whether to render agent messages as Markdown */
  markdown?: boolean;
  /** workspaceId passed to Markdown component */
  workspaceId?: string;

  /** Extra header actions (settings, etc.) */
  headerActions?: React.ReactNode;
  /** Optional custom renderer for message body */
  renderMessageContent?: (message: ChatMessage) => React.ReactNode;
  /** Optional custom renderer for content below each message bubble */
  renderMessageExtras?: (message: ChatMessage) => React.ReactNode;
  /** Optional delete handler. When provided, each message shows a delete action on hover. */
  onDeleteMessage?: (messageId: string) => void;
  /** Optional custom serializer for copy action. Defaults to `message.content`. */
  serializeForCopy?: (message: ChatMessage) => string;
  /** Optional handler for rerunning a timeline tool call. */
  onRerunTool?: (message: ChatMessage, item: Extract<WorkflowAgentTimelineItem, { type: 'tool' }>) => void;

  /** Panel size */
  width?: number;
  height?: number;
}

/**
 * 悬浮壳：仅负责定位、显隐切换与开合按钮。面板 UI 见 {@link ChatPanel}。
 */
export function FloatingChatPanel({
  isOpen,
  onClose,
  onToggle,
  agent,
  messages,
  sending,
  input,
  onInputChange,
  onSend,
  onStop,
  inputPlaceholder,
  inputContext,
  markdown,
  workspaceId,
  headerActions,
  renderMessageContent,
  renderMessageExtras,
  onDeleteMessage,
  serializeForCopy,
  onRerunTool,
  width,
  height,
}: FloatingChatPanelProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
      <AnimatePresence>
        {isOpen && (
          <ChatPanel
            onClose={onClose}
            agent={agent}
            messages={messages}
            sending={sending}
            input={input}
            onInputChange={onInputChange}
            onSend={onSend}
            onStop={onStop}
            inputPlaceholder={inputPlaceholder}
            inputContext={inputContext}
            markdown={markdown}
            workspaceId={workspaceId}
            headerActions={headerActions}
            renderMessageContent={renderMessageContent}
            renderMessageExtras={renderMessageExtras}
            onDeleteMessage={onDeleteMessage}
            serializeForCopy={serializeForCopy}
            onRerunTool={onRerunTool}
            width={width}
            height={height}
          />
        )}
      </AnimatePresence>

      {/* Floating toggle button */}
      {onToggle && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggle}
          className={cn(
            'cursor-pointer group relative flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300',
            isOpen
              ? 'bg-destructive text-destructive-foreground rotate-90'
              : 'bg-primary text-primary-foreground hover:shadow-primary/25'
          )}
        >
          <span className="absolute inset-0 -z-10 rounded-full bg-inherit opacity-20 blur-xl transition-opacity duration-300 group-hover:opacity-40" />
          {isOpen ? <X className="h-6 w-6 text-white" /> : <MessageSquare className="h-6 w-6" />}
        </motion.button>
      )}
    </div>
  );
}
