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
  IconBolt,
  IconChevronDown,
  IconCircle,
  IconCircleDashed,
  IconCloud,
  IconCode,
  IconDeviceLaptop,
  IconHistory,
  IconPaperclip,
  IconPlus,
  IconProgress,
  IconRobot,
  IconUser,
  IconWand,
  IconWorld,
} from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useState } from "react";
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
import type { AgentConfig } from "@agent-spaces/shared";

type MentionedAgent = Pick<AgentConfig, "id" | "name" | "role" | "description" | "enabled">;

interface ChatInputProps {
  channelName: string;
  agents: MentionedAgent[];
  onSend: (message: string, mentions: string[]) => void;
  isProcessing?: boolean;
  onStop?: () => void;
}

export function ChatInput({ channelName, agents, onSend, isProcessing = false, onStop }: ChatInputProps) {
  const [selectedModel, setSelectedModel] = useState("Local");
  const [selectedAgent, setSelectedAgent] = useState("Agent");
  const [selectedPerformance, setSelectedPerformance] = useState("High");
  const [autoMode, setAutoMode] = useState(false);
  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: true,
    onDrop: () => {},
  });

  const mentionExtension = useMemo(
    () =>
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          char: "@",
          items: ({ query }: { query: string }) => {
            const keyword = query.toLowerCase();
            return agents.filter((agent) =>
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
            editor
              .chain()
              .focus()
              .insertContentAt(range, [{ type: "mention", attrs: props }])
              .run();
          },
          render: () => createSuggestionRenderer(),
        },
      }),
    [agents]
  );

  const slashExtension = useMemo(
    () => createSlashExtension(() => {
      document.querySelector<HTMLInputElement>("[data-chat-file-input]")?.click();
    }),
    []
  );

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
        handleKeyDown: (view, event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            const hasPopup = document.querySelector('.suggestion-menu');
            if (hasPopup) return false;
            event.preventDefault();
            if (!editor || isProcessingRef.current) return true;
            const text = editor.getText().trim();
            if (!text) return true;
            const mentions = collectMentionIds(editor.getJSON());
            onSendRef.current(editor.getHTML(), mentions);
            editor.commands.clearContent();
            return true;
          }
          return false;
        },
      },
      content: "",
    },
    [mentionExtension, slashExtension, channelName],
  );

  const handleSubmit = useCallback(() => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) return;
    const mentions = collectMentionIds(editor.getJSON());
    onSend(editor.getHTML(), mentions);
    editor.commands.clearContent();
  }, [editor, onSend]);

  const canSubmit = useEditorState({
    editor,
    selector: (ctx) => !!ctx.editor?.getText().trim(),
  });

  const chatActions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full border border-border hover:bg-accent" />}><IconPlus className="size-3" /></DropdownMenuTrigger>
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
      <ComposerShell
        editor={editor}
        canSubmit={canSubmit}
        onSubmit={handleSubmit}
        onStop={onStop}
        isProcessing={isProcessing}
        actions={chatActions}
        dropzoneProps={getRootProps()}
        hiddenInput={<input {...getInputProps()} data-chat-file-input="" />}
      />

      <div className="flex items-center gap-0 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs" />}><IconDeviceLaptop className="size-3" /><span>{selectedModel}</span><IconChevronDown className="size-3" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5 bg-popover border-border">
            <DropdownMenuGroup className="space-y-1">
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => setSelectedModel("Local")}>
                <IconDeviceLaptop size={16} className="opacity-60" />Local
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => setSelectedModel("Cloud")}>
                <IconCloud size={16} className="opacity-60" />Cloud
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs" />}><IconUser className="size-3" /><span>{selectedAgent}</span><IconChevronDown className="size-3" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5 bg-popover border-border">
            <DropdownMenuGroup className="space-y-1">
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => setSelectedAgent("Agent")}>
                <IconUser size={16} className="opacity-60" />Agent
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => setSelectedAgent("Assistant")}>
                <IconRobot size={16} className="opacity-60" />Assistant
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs" />}><IconBolt className="size-3" /><span>{selectedPerformance}</span><IconChevronDown className="size-3" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5 bg-popover border-border">
            <DropdownMenuGroup className="space-y-1">
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => setSelectedPerformance("High")}>
                <IconCircle size={16} className="opacity-60" />High
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => setSelectedPerformance("Medium")}>
                <IconProgress size={16} className="opacity-60" />Medium
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs" onClick={() => setSelectedPerformance("Low")}>
                <IconCircleDashed size={16} className="opacity-60" />Low
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />
      </div>
    </div>
  );
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
