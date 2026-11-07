"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sdk } from "@/lib/sdk";
import { useAgentStore } from "@/stores/agent";
import { useChatStore } from "@/stores/chat";
import { useInspectorHistoryStore } from "@/stores/inspector-history";
import { McpsDialog } from "@/components/sidebar/mcps-dialog";
import { SkillsDialog } from "@/components/sidebar/skills-dialog";
import { ToolsDialog } from "@/components/sidebar/tools-dialog";
import { cn } from "@/lib/utils";
import {
  IconChevronDown,
  IconCircleCheck,
  IconCircleDashed,
  IconCode,
  IconHistory,
  IconLoader2,
  IconMessageCircle,
  IconPlug,
  IconPuzzle,
  IconSettings,
  IconTools,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { Icon } from "@tabler/icons-react";
import type { BuiltInAgentToolName, Channel, TodoItem } from "@agent-spaces/shared";
import type { MentionedAgent } from "./chat-input-utils";

const EMPTY_HISTORY: never[] = [];
const DEFAULT_CONTEXT_LENGTH = 20;

type DisplayTodoItem = TodoItem & { title?: string; content?: string };

function getTodoTitle(todo: DisplayTodoItem, fallback: string) {
  return todo.subject || todo.title || todo.activeForm || todo.content || fallback;
}

interface ToolEntry {
  name: string;
  label: string;
  icon: Icon;
}

type AgentBindingUpdates = {
  skills?: string[];
  tools?: BuiltInAgentToolName[];
  mcps?: Record<string, unknown>;
};

interface ChatInputInfoBarProps {
  workspaceId: string;
  mcps: string[];
  skills: string[];
  tools: ToolEntry[];
  activeAgent?: MentionedAgent;
  todos: Channel["todos"];
  contextLength: number;
  onContextLengthChange: (contextLength: number) => void;
  enableContextControl?: boolean;
  enableRecentCode?: boolean;
  onClearTodos?: () => void;
  onInsertText?: (text: string) => void;
  onAgentBindingsChange?: (agentId: string, updates: AgentBindingUpdates) => void | Promise<void>;
}

export function ChatInputInfoBar({
  workspaceId,
  mcps,
  skills,
  tools,
  activeAgent,
  todos,
  contextLength,
  onContextLengthChange,
  enableContextControl = true,
  enableRecentCode = true,
  onClearTodos,
  onInsertText,
  onAgentBindingsChange,
}: ChatInputInfoBarProps) {
  const t = useTranslations("chat");
  const tc = useTranslations("composer");
  const tCommon = useTranslations("common");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [mcpsDialogOpen, setMcpsDialogOpen] = useState(false);
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false);
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const [draftMcps, setDraftMcps] = useState<string[]>([]);
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [draftTools, setDraftTools] = useState<BuiltInAgentToolName[]>([]);
  const agents = useAgentStore((s) => s.agents);
  const chatAgents = useChatStore((s) => s.agents);
  const history = useInspectorHistoryStore((s) => s.histories[workspaceId] ?? EMPTY_HISTORY);
  const loadHistory = useInspectorHistoryStore((s) => s.loadHistory);
  const clearHistory = useInspectorHistoryStore((s) => s.clearHistory);

  useEffect(() => {
    if (mcpsDialogOpen) setDraftMcps(mcps);
  }, [mcpsDialogOpen, mcps]);

  useEffect(() => {
    if (skillsDialogOpen) setDraftSkills(skills);
  }, [skillsDialogOpen, skills]);

  useEffect(() => {
    if (toolsDialogOpen) setDraftTools(tools.map((tool) => tool.name as BuiltInAgentToolName));
  }, [toolsDialogOpen, tools]);

  const suggestions = activeAgent?.suggestions?.filter((item) => item.trim().length > 0) ?? [];

  const insertCodeLocation = (path: string, line: number, column: number) => {
    onInsertText?.(`${path}:${line}:${column}`);
    setHistoryOpen(false);
  };

  const persistAgentBindings = async (updates: AgentBindingUpdates) => {
    if (!activeAgent?.id) return;
    if (onAgentBindingsChange) {
      await onAgentBindingsChange(activeAgent.id, updates);
      return;
    }
    const storedAgent = agents.find((agent) => agent.id === activeAgent.id);
    if (storedAgent) {
      const next = { ...storedAgent, ...updates };
      await sdk.agent.updatePreset(storedAgent.id, next);
      useAgentStore.setState((state) => ({
        agents: state.agents.map((agent) => agent.id === storedAgent.id ? next : agent),
      }));
      return;
    }
    const chatAgent = chatAgents.find((agent) => agent.id === activeAgent.id);
    if (!chatAgent) return;
    const next = { ...chatAgent, ...updates };
    await sdk.chat.updateAgent(chatAgent.id, next);
    useChatStore.setState((state) => ({
      agents: state.agents.map((agent) => agent.id === chatAgent.id ? next : agent),
    }));
  };

  const applyMcpSelection = (names: string[], configs: Record<string, unknown>) => {
    const mcpServers: Record<string, unknown> = {};
    for (const name of names) {
      if (configs[name]) mcpServers[name] = configs[name];
    }
    // 合并而非覆盖：保留 agent.mcps 中 mcpServers 以外的字段
    const currentMcps = (activeAgent?.mcps ?? {}) as Record<string, unknown>;
    void persistAgentBindings({ mcps: { ...currentMcps, mcpServers } });
  };

  const barRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => {
      // 临时以非 compact 模式测量真实所需宽度
      el.setAttribute("data-measuring", "true");
      const overflow = el.scrollWidth > el.clientWidth + 1;
      el.removeAttribute("data-measuring");
      setCompact(overflow);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    enableRecentCode,
    enableContextControl,
    mcps.length,
    skills.length,
    tools.length,
    todos?.length,
    suggestions.length,
    history.length,
  ]);

  return (
    <div
      ref={barRef}
      data-compact={compact ? "true" : "false"}
      className="group flex items-center gap-0 pt-2 overflow-hidden"
    >
      {enableRecentCode ? (
      <Popover
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (open) loadHistory(workspaceId);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
              title={tc("shell.recentCode")}
            />
          }
        >
          <IconCode className="size-3" />
          <span className="bar-label">{tc("shell.recentCode")}{history.length ? ` ${history.length}` : ""}</span>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-80 p-1.5 gap-0">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">{tc("shell.recentCode")}</span>
            <button
              type="button"
              onClick={() => clearHistory(workspaceId)}
              disabled={history.length === 0}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              {tc("shell.clear")}
            </button>
          </div>
          {history.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">{tc("shell.noRecords")}</div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {history.map((item) => {
                const label = item.name || item.path.split("/").pop() || item.path;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => insertCodeLocation(item.path, item.line, item.column)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <span className="w-full truncate text-xs font-medium">{label}</span>
                    <span className="w-full truncate font-mono text-[11px] text-muted-foreground">
                      {item.path}:{item.line}:{item.column}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
      ) : null}

      {enableContextControl ? (
        <Popover open={contextOpen} onOpenChange={setContextOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
                title={contextLength === 0 ? tc("shell.newAgent") : tc("shell.contextN", { count: contextLength })}
              />
            }
          >
            <IconHistory className="size-3" />
            <span className="bar-label">{contextLength === 0 ? tc("shell.newAgent") : tc("shell.contextN", { count: contextLength })}</span>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="w-64 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{tc("shell.contextLength")}</span>
              <span className="text-xs font-mono text-foreground">
                {contextLength === 0 ? tc("shell.newAgent") : tc("shell.contextCount", { count: contextLength })}
              </span>
            </div>
            <Slider
              value={contextLength}
              min={0}
              max={20}
              step={1}
              onValueChange={(value) => {
                const nextValue = Array.isArray(value) ? value[0] : value;
                onContextLengthChange(nextValue ?? DEFAULT_CONTEXT_LENGTH);
              }}
            />
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>0</span>
              <span>20</span>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
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
          <IconMessageCircle className="size-3" />
          <span className="bar-label">{t("input.suggestions")}{suggestions.length ? ` ${suggestions.length}` : ""}</span>
          <IconChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px] max-w-sm rounded-2xl p-1.5 bg-popover border-border">
          <DropdownMenuGroup className="space-y-1">
            {suggestions.length ? (
              suggestions.map((suggestion, index) => (
                <DropdownMenuItem
                  key={`${suggestion}-${index}`}
                  className="rounded-[calc(1rem-6px)] text-xs cursor-pointer"
                  onClick={() => onInsertText?.(suggestion)}
                >
                  <IconMessageCircle size={16} className="opacity-60 shrink-0" />
                  <span className="line-clamp-2">{suggestion}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs text-muted-foreground">
                <IconMessageCircle size={16} className="opacity-60 shrink-0" />
                {t("input.noSuggestions")}
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
          <IconPlug className="size-3" />
          <span className="bar-label">{t("input.mcp")}{mcps.length ? ` ${mcps.length}` : ""}</span>
          <IconChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px] max-w-xs rounded-2xl p-1.5 bg-popover border-border">
          <DropdownMenuGroup className="space-y-1">
            {mcps.length ? (
              mcps.map((mcp) => (
                <DropdownMenuItem key={mcp} className="rounded-[calc(1rem-6px)] text-xs truncate cursor-pointer" onClick={() => onInsertText?.(`[use mcp: ${mcp}]`)}>
                  <IconPlug size={16} className="opacity-60 shrink-0" />
                  <span className="truncate">{mcp}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs text-muted-foreground">
                <IconPlug size={16} className="opacity-60" />
                {t("input.noMcp")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="rounded-[calc(1rem-6px)] text-xs gap-2 cursor-pointer text-primary focus:text-primary"
              onClick={() => setMcpsDialogOpen(true)}
            >
              <IconSettings size={16} className="shrink-0" />
              {tCommon("manage")}
            </DropdownMenuItem>
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
          <span className="bar-label">{t("input.skill")}{skills.length ? ` ${skills.length}` : ""}</span>
          <IconChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px] max-w-xs rounded-2xl p-1.5 bg-popover border-border">
          <DropdownMenuGroup className="space-y-1">
            {skills.length ? (
              skills.map((skill) => (
                <DropdownMenuItem key={skill} className="rounded-[calc(1rem-6px)] text-xs truncate cursor-pointer" onClick={() => onInsertText?.(`[use skill: ${skill}]`)}>
                  <IconPuzzle size={16} className="opacity-60 shrink-0" />
                  <span className="truncate">{skill}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs text-muted-foreground">
                <IconPuzzle size={16} className="opacity-60" />
                {t("input.noSkills")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="rounded-[calc(1rem-6px)] text-xs gap-2 cursor-pointer text-primary focus:text-primary"
              onClick={() => setSkillsDialogOpen(true)}
            >
              <IconSettings size={16} className="shrink-0" />
              {tCommon("manage")}
            </DropdownMenuItem>
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
          <span className="bar-label">{t("input.tools")}{tools.length ? ` ${tools.length}` : ""}</span>
          <IconChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px] max-w-xs rounded-2xl p-1.5 bg-popover border-border">
          <DropdownMenuGroup className="space-y-1">
            {tools.length ? (
              tools.map(({ name, label, icon: Icon }) => (
                <DropdownMenuItem key={name} className="rounded-[calc(1rem-6px)] text-xs truncate cursor-pointer" onClick={() => onInsertText?.(`[use tool: ${name}]`)}>
                  <Icon size={16} className="opacity-60 shrink-0" />
                  <span className="truncate">{label}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem className="rounded-[calc(1rem-6px)] text-xs text-muted-foreground">
                <IconTools size={16} className="opacity-60" />
                {t("input.noTools")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="rounded-[calc(1rem-6px)] text-xs gap-2 cursor-pointer text-primary focus:text-primary"
              onClick={() => setToolsDialogOpen(true)}
            >
              <IconSettings size={16} className="shrink-0" />
              {tCommon("manage")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {todos && todos.length > 0 && (
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
            <span className="bar-label">{t("input.todos")} {todos.length}</span>
            <IconChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80 rounded-2xl p-1.5 bg-popover border-border">
            <DropdownMenuGroup className="space-y-0.5">
              {todos.map((todo, index) => (
                <DropdownMenuItem
                  key={todo.id || `${getTodoTitle(todo, t("untitledTodo"))}-${index}`}
                  className="rounded-[calc(1rem-6px)] text-xs gap-2"
                  onSelect={(e) => e.preventDefault()}
                >
                  {todo.status === "completed" ? (
                    <IconCircleCheck size={14} className="text-green-500 shrink-0" />
                  ) : todo.status === "in_progress" ? (
                    <IconLoader2
                      size={14}
                      className="text-blue-500 shrink-0 animate-spin"
                      style={{ animationDuration: "3s" }}
                    />
                  ) : (
                    <IconCircleDashed size={14} className="text-muted-foreground shrink-0" />
                  )}
                  <span className={cn("todo-text-scroll", todo.status === "completed" && "line-through text-muted-foreground")}>
                    {getTodoTitle(todo, t("untitledTodo"))}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {onClearTodos && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-[calc(1rem-6px)] text-xs text-destructive focus:text-destructive gap-2 justify-center cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); onClearTodos(); }}
                >
                  <IconTrash size={14} />
                  {t("input.clearTodos")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="flex-1" />

      <McpsDialog
        open={mcpsDialogOpen}
        onOpenChange={setMcpsDialogOpen}
        selectable
        selectedMcps={draftMcps}
        onSelectedMcpsChange={(nextMcps, configs) => {
          setDraftMcps(nextMcps);
          applyMcpSelection(nextMcps, configs);
        }}
      />
      <SkillsDialog
        open={skillsDialogOpen}
        onOpenChange={setSkillsDialogOpen}
        selectable
        selectedSkills={draftSkills}
        onSelectedSkillsChange={(nextSkills) => {
          setDraftSkills(nextSkills);
          void persistAgentBindings({ skills: nextSkills });
        }}
      />
      <ToolsDialog
        open={toolsDialogOpen}
        onOpenChange={setToolsDialogOpen}
        selectable
        selectedTools={draftTools}
        onSelectedToolsChange={(nextTools) => {
          setDraftTools(nextTools);
          void persistAgentBindings({ tools: nextTools });
        }}
      />
    </div>
  );
}
