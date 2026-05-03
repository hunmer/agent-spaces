"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  IconChevronDown,
  IconCircleCheck,
  IconCircleDashed,
  IconCode,
  IconHistory,
  IconLoader2,
  IconPaperclip,
  IconPin,
  IconPinFilled,
  IconPlug,
  IconPlus,
  IconPuzzle,
  IconTools,
  IconWand,
  IconWorld,
} from "@tabler/icons-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Range } from "@tiptap/core";
import { useDropzone } from "react-dropzone";

import { ComposerShell } from "@/components/composer/composer-shell";
import { createSuggestionRenderer } from "@/components/composer/create-suggestion-renderer";
import { createSlashExtension } from "@/components/composer/create-slash-extension";
import type { AgentConfig, Attachment as MessageAttachment, Channel, TodoItem } from "@agent-spaces/shared";
import { useChannelStore } from "@/stores/channel";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  type AttachmentData,
} from "./attachments";

type MentionedAgent = Pick<AgentConfig, "id" | "name" | "role" | "description" | "enabled" | "mcps" | "skills">;

interface ChatInputProps {
  channelName: string;
  channelId: string;
  workspaceId: string;
  channel: Channel;
  agents: MentionedAgent[];
  onSend: (message: string, mentions: string[], attachments?: MessageAttachment[]) => void;
  isProcessing?: boolean;
  onStop?: () => void;
}

export interface ChatInputHandle {
  setContent: (html: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { channelName, channelId, workspaceId, channel, agents, onSend, isProcessing = false, onStop },
  ref
) {
  const [mentionedAgentIds, setMentionedAgentIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const isProcessingRef = useRef(isProcessing);
  const onSendRef = useRef(onSend);
  const editorRef = useRef<Editor | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const restoredChannelRef = useRef<string | null>(null);
  const agentsRef = useRef(agents);
  const channelRef = useRef(channel);

  const { saveDraft, clearDraft, updateChannel } = useChannelStore();
  const pinnedMentionId = channel.pinnedMentionId;
  const isPinned = pinnedMentionId === mentionedAgentIds[0] && !!pinnedMentionId;

  const mentionedAgents = useMemo(() => {
    if (mentionedAgentIds.length === 0) return [];
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    return mentionedAgentIds
      .map((id) => byId.get(id))
      .filter((agent): agent is MentionedAgent => Boolean(agent));
  }, [agents, mentionedAgentIds]);

  const activeAgent = mentionedAgents[0];
  const activeMcps = getMcpLabels(activeAgent?.mcps);
  const activeSkills = activeAgent?.skills ?? [];
  const tools = useMemo(
    () => [
      { label: "Code Interpreter", icon: IconCode },
      { label: "Web Search", icon: IconWorld },
      { label: "Chat History", icon: IconHistory },
    ],
    []
  );

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  // Save draft with debounce
  const scheduleDraftSave = useCallback(
    (content: string) => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        if (content.trim()) {
          saveDraft(workspaceId, channelId, content);
        } else {
          clearDraft(workspaceId, channelId);
        }
      }, 1000);
    },
    [workspaceId, channelId, saveDraft, clearDraft]
  );

  const submitCurrentMessage = useCallback(async () => {
    const currentEditor = editorRef.current;
    if (!currentEditor || isProcessingRef.current || submittingRef.current) return;
    const text = currentEditor.getText().trim();
    if (!text && attachments.length === 0) return;
    const mentions = collectMentionIds(currentEditor.getJSON());
    submittingRef.current = true;
    setSubmitting(true);
    // Cancel pending draft save
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    try {
      const uploaded = await Promise.all(attachments.map(uploadAttachment));
      onSendRef.current(text ? currentEditor.getHTML() : "", mentions, uploaded);
      currentEditor.commands.clearContent();
      setAttachments((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.preview));
        return [];
      });
      setMentionedAgentIds([]);
      clearDraft(workspaceId, channelId);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [attachments, workspaceId, channelId, clearDraft]);

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: true,
    accept: {
      "image/*": [],
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/*": [".txt", ".md", ".csv", ".json"],
    },
    onDrop: (files) => {
      setAttachments((prev) => [
        ...prev,
        ...files.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        })),
      ]);
    },
  });

  useEffect(() => {
    return () => {
      attachments.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, [attachments]);

  // Remove all existing mentions from editor, keep only the last one
  const removeExistingMentions = useCallback((editor: Editor, keepId?: string) => {
    const { tr } = editor.state;
    let removed = false;
    const nodesToRemove: { pos: number; nodeSize: number }[] = [];

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "mention") {
        const nodeId = node.attrs?.id;
        if (nodeId !== keepId) {
          nodesToRemove.push({ pos, nodeSize: node.nodeSize });
        }
      }
    });

    // Remove from end to start to preserve positions
    for (let i = nodesToRemove.length - 1; i >= 0; i--) {
      const { pos, nodeSize } = nodesToRemove[i];
      tr.delete(pos, pos + nodeSize);
      removed = true;
    }

    if (removed) {
      editor.view.dispatch(tr);
    }
  }, []);

  const mentionExtension = useMemo(
    () =>
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          char: "@",
          items: ({ query }: { query: string }) => {
            const keyword = query.toLowerCase();
            return agentsRef.current
              .filter(
                (agent) =>
                  agent.enabled !== false &&
                  `${agent.name} ${agent.role} ${agent.description || ""}`.toLowerCase().includes(keyword)
              )
              .slice(0, 6)
              .map((agent) => ({
                id: agent.id,
                label: agent.name || agent.role,
                description: `${agent.role}${agent.description ? ` · ${agent.description}` : ""}`,
              }));
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: Range;
            props: MentionNodeAttrs;
          }) => {
            // Remove existing mentions first (single mention only)
            removeExistingMentions(editor, props.id as string);
            editor
              .chain()
              .focus()
              .insertContentAt(range, [{ type: "mention", attrs: props }])
              .run();
          },
          render: () => createSuggestionRenderer(),
        },
      }),
    [removeExistingMentions]
  );

  const slashExtension = useMemo(
    () =>
      createSlashExtension(() => {
        document.querySelector<HTMLInputElement>("[data-chat-file-input]")?.click();
      }),
    []
  );

  const submitRef = useRef(submitCurrentMessage);
  submitRef.current = submitCurrentMessage;

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: `Message #${channelName}...  支持 @mention，输入 / 打开命令`,
        }),
        mentionExtension,
        slashExtension,
      ],
      editorProps: {
        attributes: {
          class: "tiptap tiptap-chat",
        },
        handleKeyDown: (_view, event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            const hasPopup = document.querySelector(".suggestion-menu");
            if (hasPopup) return false;
            event.preventDefault();
            submitRef.current();
            return true;
          }
          return false;
        },
      },
      content: "",
      onUpdate: ({ editor }) => {
        const ids = collectMentionIds(editor.getJSON());
        setMentionedAgentIds((prev) => {
          if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
          return ids;
        });
        scheduleDraftSave(editor.getHTML());
      },
    },
    [mentionExtension, slashExtension, channelName]
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || restoredChannelRef.current === channelId) return;
    restoredChannelRef.current = channelId;

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }

    const draft = channelRef.current.draft;
    const pinnedId = channelRef.current.pinnedMentionId;
    const pinnedAgent = pinnedId ? agentsRef.current.find((agent) => agent.id === pinnedId) : undefined;
    const content = draft?.content
      ? draft.content
      : pinnedAgent
        ? [
            { type: "mention", attrs: { id: pinnedAgent.id, label: pinnedAgent.name || pinnedAgent.role } },
            { type: "text", text: " " },
          ]
        : "";

    editor.commands.setContent(content, { emitUpdate: false });
    setMentionedAgentIds(collectMentionIds(editor.getJSON()));
  }, [editor, channelId]);

  useImperativeHandle(
    ref,
    () => ({
      setContent: (html: string) => {
        editor?.commands.setContent(html, { emitUpdate: false });
        editor?.commands.focus("end");
      },
    }),
    [editor]
  );

  const handleSubmit = useCallback(() => {
    submitCurrentMessage();
  }, [submitCurrentMessage]);

  const hasText = useEditorState({
    editor,
    selector: (ctx) => !!ctx.editor?.getText().trim(),
  });
  const canSubmit = (Boolean(hasText) || attachments.length > 0) && !submitting;

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  }, []);

  const togglePin = useCallback(() => {
    const currentMentionId = mentionedAgentIds[0];
    if (!currentMentionId) return;

    const newPinnedId = isPinned ? undefined : currentMentionId;
    updateChannel(workspaceId, channelId, { pinnedMentionId: newPinnedId });
  }, [mentionedAgentIds, isPinned, workspaceId, channelId, updateChannel]);

  const chatActions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded-full border border-border hover:bg-accent"
            />
          }
        >
          <IconPlus className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5">
          <DropdownMenuGroup className="space-y-1">
            <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={openFilePicker}>
              <IconPaperclip size={16} className="opacity-60" />
              Attach Files
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => {}}>
              <IconCode size={16} className="opacity-60" />
              Code Interpreter
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => {}}>
              <IconWorld size={16} className="opacity-60" />
              Web Search
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => {}}>
              <IconHistory size={16} className="opacity-60" />
              Chat History
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAutoMode(!autoMode)}
        className={cn("h-7 px-2 rounded-full border border-border hover:bg-accent", {
          "bg-primary/10 text-primary border-primary/30": autoMode,
          "text-muted-foreground": !autoMode,
        })}
      >
        <IconWand className="size-3" />
        <span className="text-xs">Auto</span>
      </Button>
    </>
  );

  return (
    <div className="border-t px-4 py-2">
      {/* Mention indicator with pin */}
      {activeAgent && (
        <div className="flex items-center gap-1 mb-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
            @{activeAgent.name || activeAgent.role}
          </span>
          <button
            type="button"
            onClick={togglePin}
            className={cn(
              "inline-flex items-center justify-center size-5 rounded-full hover:bg-accent transition-colors",
              isPinned ? "text-primary" : "text-muted-foreground"
            )}
            title={isPinned ? "取消固定" : "固定此 Agent"}
          >
            {isPinned ? <IconPinFilled className="size-3" /> : <IconPin className="size-3" />}
          </button>
        </div>
      )}

      <ComposerShell
        editor={editor}
        canSubmit={canSubmit}
        onSubmit={handleSubmit}
        onStop={onStop}
        isProcessing={isProcessing || submitting}
        actions={chatActions}
        dropzoneProps={getRootProps()}
        hiddenInput={<input {...getInputProps()} data-chat-file-input="" />}
      />
      {attachments.length > 0 && (
        <Attachments variant="inline" className="mt-2 justify-start">
          {attachments.map((item, index) => (
            <Attachment
              key={`${item.file.name}-${item.file.lastModified}-${index}`}
              data={localAttachmentToData(item)}
              onRemove={() => removeAttachment(index)}
            >
              <AttachmentPreview />
              <AttachmentInfo />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      )}

      <div className="flex items-center gap-0 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
              />
            }
          >
            <IconPlug className="size-3" />
            <span>MCP{activeMcps.length ? ` ${activeMcps.length}` : ""}</span>
            <IconChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5 bg-popover border-border">
            <DropdownMenuGroup className="space-y-1">
              {activeMcps.length ? (
                activeMcps.map((mcp) => (
                  <DropdownMenuItem key={mcp} className="rounded-[calc(1rem-6px)] text-xs">
                    <IconPlug size={16} className="opacity-60" />
                    {mcp}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs text-muted-foreground">
                  <IconPlug size={16} className="opacity-60" />
                  No MCP configured
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
              />
            }
          >
            <IconPuzzle className="size-3" />
            <span>Skill{activeSkills.length ? ` ${activeSkills.length}` : ""}</span>
            <IconChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5 bg-popover border-border">
            <DropdownMenuGroup className="space-y-1">
              {activeSkills.length ? (
                activeSkills.map((skill) => (
                  <DropdownMenuItem key={skill} className="rounded-[calc(1rem-6px)] text-xs">
                    <IconPuzzle size={16} className="opacity-60" />
                    {skill}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs text-muted-foreground">
                  <IconPuzzle size={16} className="opacity-60" />
                  No skills configured
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
              />
            }
          >
            <IconTools className="size-3" />
            <span>Tools</span>
            <IconChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5 bg-popover border-border">
            <DropdownMenuGroup className="space-y-1">
              {tools.map(({ label, icon: Icon }) => (
                <DropdownMenuItem key={label} className="rounded-[calc(1rem-6px)] text-xs">
                  <Icon size={16} className="opacity-60" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {channel.todos && channel.todos.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
                />
              }
            >
              <IconCircleCheck className="size-3" />
              <span>Todos {channel.todos.length}</span>
              <IconChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5 bg-popover border-border">
              <DropdownMenuGroup className="space-y-0.5">
                {channel.todos.map((todo) => (
                  <DropdownMenuItem key={todo.id} className="rounded-[calc(1rem-6px)] text-xs gap-2" onSelect={(e) => e.preventDefault()}>
                    {todo.status === 'completed' ? (
                      <IconCircleCheck size={14} className="text-green-500 shrink-0" />
                    ) : todo.status === 'in_progress' ? (
                      <IconLoader2 size={14} className="text-blue-500 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                    ) : (
                      <IconCircleDashed size={14} className="text-muted-foreground shrink-0" />
                    )}
                    <span className={cn("truncate", todo.status === 'completed' && "line-through text-muted-foreground")}>
                      {todo.subject}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1" />
      </div>
    </div>
  );
});

type LocalAttachment = {
  file: File;
  preview: string;
};

async function uploadAttachment(item: LocalAttachment): Promise<MessageAttachment> {
  const formData = new FormData();
  formData.append("file", item.file);
  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${item.file.name}`);
  }
  const uploaded = (await res.json()) as { name: string; size: number; type: string; url: string };
  return {
    name: uploaded.name,
    path: uploaded.url,
    url: uploaded.url,
    type: uploaded.type,
    size: uploaded.size,
  };
}

function localAttachmentToData(item: LocalAttachment): AttachmentData {
  return {
    id: `${item.file.name}-${item.file.lastModified}`,
    type: "file",
    filename: item.file.name,
    mediaType: item.file.type,
    url: item.preview,
  };
}

function collectMentionIds(node: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (current: JSONContent) => {
    if (!current) return;
    if (current.type === "mention" && typeof current.attrs?.id === "string") {
      ids.add(current.attrs.id);
    }
    if (Array.isArray(current.content)) {
      for (const child of current.content) walk(child);
    }
  };
  walk(node);
  return [...ids];
}

function getMcpLabels(mcps: AgentConfig["mcps"] | undefined): string[] {
  if (!mcps) return [];
  const servers = (mcps as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  return Object.keys(servers);
}
