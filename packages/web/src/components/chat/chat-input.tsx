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
  IconSend,
  IconUser,
  IconWand,
  IconWorld,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import tippy from "tippy.js";
import { useDropzone } from "react-dropzone";

import { USERS } from "@/lib/users";
import { COMMANDS } from "@/lib/commands";
import { SuggestionList } from "@/components/composer/suggestion-list";

interface ChatInputProps {
  channelName: string;
  onSend: (message: string) => void;
}

function createSuggestionRenderer() {
  let component: ReactRenderer | null = null;
  let popup: any = null;

  return {
    onStart(props: any) {
      component = new ReactRenderer(SuggestionList, {
        props,
        editor: props.editor,
      });
      if (!props.clientRect) return;
      popup = tippy("body", {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },
    onUpdate(props: any) {
      component?.updateProps(props);
      if (popup?.[0] && props.clientRect) {
        popup[0].setProps({ getReferenceClientRect: props.clientRect });
      }
    },
    onKeyDown(props: any) {
      if (component?.ref && typeof component.ref === 'object' && 'onKeyDown' in component.ref) {
        return (component.ref as any).onKeyDown(props);
      }
      return false;
    },
    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
    },
  };
}

function createSlashExtension(openFilePicker: () => void) {
  return Extension.create({
    name: "slashCommand",
    addOptions() {
      return {
        suggestion: {
          char: "/",
          items: ({ query }: { query: string }) => {
            const keyword = query.toLowerCase();
            return COMMANDS.filter((item) =>
              `${item.title} ${item.description}`.toLowerCase().includes(keyword)
            ).map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description,
            }));
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: any;
            range: { from: number; to: number };
            props: { id: string; title: string; description: string };
          }) => {
            editor.chain().focus().deleteRange(range).run();
            switch (props.id) {
              case "heading1":
                editor.chain().focus().toggleHeading({ level: 1 }).run();
                break;
              case "blockquote":
                editor.chain().focus().toggleBlockquote().run();
                break;
              case "divider":
                editor.chain().focus().setHorizontalRule().run();
                break;
              case "attach":
                openFilePicker();
                break;
            }
          },
          render: () => createSuggestionRenderer(),
        },
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

export function ChatInput({ channelName, onSend }: ChatInputProps) {
  const [selectedModel, setSelectedModel] = useState("Local");
  const [selectedAgent, setSelectedAgent] = useState("Agent");
  const [selectedPerformance, setSelectedPerformance] = useState("High");
  const [autoMode, setAutoMode] = useState(false);

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
            return USERS.filter((user) =>
              `${user.name} ${user.email}`.toLowerCase().includes(keyword)
            )
              .slice(0, 6)
              .map((user) => ({
                id: user.id,
                label: user.name,
                email: user.email,
              }));
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: any;
            range: { from: number; to: number };
            props: Record<string, any>;
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
    []
  );

  const slashExtension = useMemo(
    () => createSlashExtension(openFilePicker),
    [openFilePicker]
  );

  const editor = useEditor({
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
          event.preventDefault();
          handleSubmit();
          return true;
        }
        return false;
      },
    },
    content: "",
  });

  const handleSubmit = () => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) return;
    onSend(editor.getHTML());
    editor.commands.clearContent();
  };

  const canSubmit = !!editor?.getText().trim();

  return (
    <div className="border-t px-4 py-2">
      <div className="bg-background border border-border rounded-2xl overflow-hidden" {...getRootProps()}>
        <input {...getInputProps()} />

        <div className="px-3 pt-3 pb-2 grow">
          <EditorContent editor={editor} />
        </div>

        <div className="mb-2 px-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
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
          </div>

          <div>
            <Button
              disabled={!canSubmit}
              className="size-7 p-0 rounded-full bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSubmit}
            >
              <IconSend className="size-3 fill-primary" />
            </Button>
          </div>
        </div>
      </div>

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
