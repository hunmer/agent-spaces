"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconChevronUp } from "@tabler/icons-react";
import type { Attachment as MessageAttachment, BuiltInAgentToolName, Channel, Message } from "@agent-spaces/shared";
import { cn } from "@/lib/utils";
import { useChannelStore } from "@/stores/channel";
import { useAgentStore } from "@/stores/agent";
import { getAgentDisplayName, normalizeChannelMembersToAgentIds } from "@/lib/agent-members";
import { AddMemberDialog } from "./add-member-dialog";
import {
  ChatComposerInput,
  type ChatComposerInputHandle,
  type ChatComposerInputState,
  type ChatComposerModelOverride,
} from "./chat-composer-input";
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
  onSend: (
    message: string,
    mentions: string[],
    attachments?: MessageAttachment[],
    replyToMessageId?: string,
    contextLength?: number,
    modelOverride?: ChatComposerModelOverride,
  ) => void;
  isProcessing?: boolean;
  onStop?: () => void;
  replyTo?: { id: string; label: string } | null;
  onCancelReply?: () => void;
  onAgentActivated?: (agent: MentionedAgent) => void;
  onConfigureAgent?: (agentId: string, agent?: MentionedAgent) => void;
  onAgentBindingsChange?: (agentId: string, updates: {
    boundWorkflowIds?: string[];
    boundWorkflowPluginTools?: Array<{ pluginId: string; toolName: string }>;
    skills?: string[];
    tools?: BuiltInAgentToolName[];
    mcps?: Record<string, unknown>;
  }) => void | Promise<void>;
  showAgentBar?: boolean;
  showAddMember?: boolean;
}

export interface ChatInputHandle {
  setContent: (html: string, agents?: MentionedAgent[]) => void;
  setAttachments: (attachments?: MessageAttachment[]) => void;
  focus: () => void;
}

const EMPTY_COMPOSER_STATE: ChatComposerInputState = {
  mentionedAgentIds: [],
  activeMcps: [],
  activeSkills: [],
  activeTools: [],
  activeWorkflowIds: [],
  activeWorkflowPluginTools: [],
};

const DEFAULT_CONTEXT_LENGTH = 20;

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { channelName, channelId, workspaceId, channel, agents, messages = [], onSend, isProcessing = false, onStop, replyTo, onCancelReply, onAgentActivated, onConfigureAgent, onAgentBindingsChange, showAgentBar = true, showAddMember = true },
  ref,
) {
  const t = useTranslations("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [contextLength, setContextLength] = useState(DEFAULT_CONTEXT_LENGTH);
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
      setAttachments: (attachments?: MessageAttachment[]) => {
        composerRef.current?.setAttachments(attachments);
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

  const handleSubmit = useCallback((
    content: string,
    mentions: string[],
    attachments: MessageAttachment[],
    contextLength: number,
    modelOverride?: ChatComposerModelOverride,
  ) => {
    onSend(content, mentions, attachments, replyTo?.id, contextLength, modelOverride);
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
          {!replyTo && showAgentBar && (
            <ChatInputAgentBar
              agents={sortedAgents}
              activeAgent={activeAgent}
              lastActiveAgentId={lastActiveAgentId}
              onActivateAgent={activateAgent}
              onAgentActivated={onAgentActivated}
              onConfigureAgent={onConfigureAgent}
              onOpenAddMember={() => {
                if (showAddMember) setAddMemberOpen(true);
              }}
            />
          )}

          <ChatComposerInput
            ref={composerRef}
            workspaceId={workspaceId}
            agents={agents}
            placeholder={t("input.placeholder", { channel: channelName })}
            contextLength={contextLength}
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
            workspaceId={workspaceId}
            mcps={composerState.activeMcps}
            skills={composerState.activeSkills}
            tools={composerState.activeTools}
            activeAgent={composerState.activeAgent}
            workflowIds={composerState.activeWorkflowIds}
            workflowPluginTools={composerState.activeWorkflowPluginTools}
            todos={channel.todos}
            contextLength={contextLength}
            onContextLengthChange={setContextLength}
            onClearTodos={() => updateChannel(workspaceId, channelId, { todos: [] })}
            onInsertText={(text) => composerRef.current?.insertText(text)}
            onAgentBindingsChange={onAgentBindingsChange}
          />
        </div>
      )}

      {showAddMember ? (
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
      ) : null}
    </>
  );
});
