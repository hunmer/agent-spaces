"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconChevronUp } from "@tabler/icons-react";
import type { Attachment as MessageAttachment, Channel, Message } from "@agent-spaces/shared";
import { cn } from "@/lib/utils";
import { useChannelStore } from "@/stores/channel";
import { useAgentStore } from "@/stores/agent";
import { getAgentDisplayName, normalizeChannelMembersToAgentIds } from "@/lib/agent-members";
import { AddMemberDialog } from "./add-member-dialog";
import { ChatComposerInput, type ChatComposerInputHandle, type ChatComposerInputState } from "./chat-composer-input";
import { ChatInputAgentBar } from "./chat-input-agent-bar";
import { ChatInputInfoBar } from "./chat-input-info-bar";
import type { MentionedAgent } from "./chat-input-utils";

interface ChatInputProps {
  channelName: string;
  channelId: string;
  workspaceId: string;
  channel: Channel;
  agents: MentionedAgent[];
  messages?: Message[];
  onSend: (message: string, mentions: string[], attachments?: MessageAttachment[], replyToMessageId?: string, contextLength?: number) => void;
  isProcessing?: boolean;
  onStop?: () => void;
  replyTo?: { id: string; label: string } | null;
  onCancelReply?: () => void;
  onAgentActivated?: (agent: MentionedAgent) => void;
}

export interface ChatInputHandle {
  setContent: (html: string, agents?: MentionedAgent[]) => void;
  focus: () => void;
}

const EMPTY_COMPOSER_STATE: ChatComposerInputState = {
  mentionedAgentIds: [],
  activeMcps: [],
  activeSkills: [],
  activeTools: [],
};

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { channelName, channelId, workspaceId, channel, agents, messages = [], onSend, isProcessing = false, onStop, replyTo, onCancelReply, onAgentActivated },
  ref,
) {
  const t = useTranslations("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [composerState, setComposerState] = useState<ChatComposerInputState>(EMPTY_COMPOSER_STATE);
  const composerRef = useRef<ChatComposerInputHandle>(null);
  const { saveDraft, clearDraft, updateChannel } = useChannelStore();
  const allAgents = useAgentStore((s) => s.agents);

  const activeAgent = composerState.activeAgent;
  const lastActiveAgentId = channel.pinnedMentionId;

  const agentLastActive = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages) {
      if (msg.senderId && msg.senderId !== "user") {
        map.set(msg.senderId, msg.createdAt);
      }
    }
    return map;
  }, [messages]);

  const sortedAgents = useMemo(() => {
    const activeId = activeAgent?.id;
    return [...agents].sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      const ta = agentLastActive.get(a.id) ?? "";
      const tb = agentLastActive.get(b.id) ?? "";
      return tb.localeCompare(ta);
    });
  }, [agents, activeAgent?.id, agentLastActive]);

  useImperativeHandle(
    ref,
    () => ({
      setContent: (html: string, nextAgents?: MentionedAgent[]) => {
        composerRef.current?.setContent(html, nextAgents);
      },
      focus: () => {
        composerRef.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    if (replyTo) composerRef.current?.focus();
  }, [replyTo]);

  const activateAgent = useCallback((agent: MentionedAgent) => {
    composerRef.current?.setMentionAgent(agent);
    updateChannel(workspaceId, channelId, { pinnedMentionId: agent.id });
  }, [workspaceId, channelId, updateChannel]);

  const handleSubmit = useCallback((content: string, mentions: string[], attachments: MessageAttachment[], contextLength: number) => {
    onSend(content, mentions, attachments, replyTo?.id, contextLength);
  }, [onSend, replyTo?.id]);

  return (
    <>
      <div className="flex justify-center -mt-0.5">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
        >
          <IconChevronUp className={cn("size-3.5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
      {!collapsed && (
        <div className="border-t px-4 py-2">
          {!replyTo && (
            <ChatInputAgentBar
              agents={sortedAgents}
              activeAgent={activeAgent}
              lastActiveAgentId={lastActiveAgentId}
              onActivateAgent={activateAgent}
              onAgentActivated={onAgentActivated}
              onOpenAddMember={() => setAddMemberOpen(true)}
            />
          )}

          <ChatComposerInput
            ref={composerRef}
            workspaceId={workspaceId}
            agents={agents}
            placeholder={t("input.placeholder", { channel: channelName })}
            onSubmit={handleSubmit}
            isProcessing={isProcessing}
            onStop={onStop}
            replyLabel={replyTo?.label}
            onCancelReply={onCancelReply}
            draftKey={channelId}
            draftContent={channel.draft?.content}
            initialMentionAgentId={channel.pinnedMentionId}
            onDraftSave={(content) => saveDraft(workspaceId, channelId, content)}
            onDraftClear={() => clearDraft(workspaceId, channelId)}
            disableMentionSuggestions={Boolean(replyTo)}
            onStateChange={setComposerState}
          />

          <ChatInputInfoBar
            mcps={composerState.activeMcps}
            skills={composerState.activeSkills}
            tools={composerState.activeTools}
            todos={channel.todos}
            onClearTodos={() => updateChannel(workspaceId, channelId, { todos: [] })}
            onInsertText={(text) => composerRef.current?.insertText(text)}
          />
        </div>
      )}

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        candidates={allAgents.filter((agent) => agent.enabled !== false).map((agent) => ({
          id: agent.id,
          label: getAgentDisplayName(agent),
          description: agent.role,
        }))}
        defaultSelected={channel.members}
        onAdd={(newMembers) => {
          const enabled = allAgents.filter((agent) => agent.enabled !== false);
          updateChannel(workspaceId, channelId, {
            members: normalizeChannelMembersToAgentIds(enabled, newMembers),
          });
        }}
      />
    </>
  );
});
