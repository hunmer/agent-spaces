"use client";

import { useEffect, useMemo, useState } from "react";
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
import { sdk } from "@/lib/sdk";
import { pluginApi } from "@/lib/workflow-plugin-api";
import { useAgentStore } from "@/stores/agent";
import { useInspectorHistoryStore } from "@/stores/inspector-history";
import { useWorkflowStore } from "@/stores/workflow";
import { McpsDialog } from "@/components/sidebar/mcps-dialog";
import { SkillsDialog } from "@/components/sidebar/skills-dialog";
import { ToolsDialog } from "@/components/sidebar/tools-dialog";
import { WorkflowListDialog } from "@/components/workflow/workflow-list-dialog";
import { PluginToolDialog } from "@/components/workflow/plugin-tool-dialog";
import { cn } from "@/lib/utils";
import {
  IconChevronDown,
  IconCircleCheck,
  IconCircleDashed,
  IconCode,
  IconHistory,
  IconLoader2,
  IconPlug,
  IconPuzzle,
  IconSettings,
  IconTools,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { Icon } from "@tabler/icons-react";
import type { Channel, TodoItem } from "@agent-spaces/shared";
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

interface ChatInputInfoBarProps {
  workspaceId: string;
  mcps: string[];
  skills: string[];
  tools: ToolEntry[];
  activeAgent?: MentionedAgent;
  workflowIds: string[];
  workflowPluginTools: Array<{ pluginId: string; toolName: string }>;
  todos: Channel["todos"];
  contextLength: number;
  onContextLengthChange: (contextLength: number) => void;
  enableContextControl?: boolean;
  enableRecentCode?: boolean;
  onClearTodos?: () => void;
  onInsertText?: (text: string) => void;
}

export function ChatInputInfoBar({
  workspaceId,
  mcps,
  skills,
  tools,
  activeAgent,
  workflowIds,
  workflowPluginTools,
  todos,
  contextLength,
  onContextLengthChange,
  enableContextControl = true,
  enableRecentCode = true,
  onClearTodos,
  onInsertText,
}: ChatInputInfoBarProps) {
  const t = useTranslations("chat");
  const tc = useTranslations("composer");
  const tCommon = useTranslations("common");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [mcpsManageOpen, setMcpsManageOpen] = useState(false);
  const [skillsManageOpen, setSkillsManageOpen] = useState(false);
  const [toolsManageOpen, setToolsManageOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowToolOpen, setWorkflowToolOpen] = useState(false);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [pluginToolDialogOpen, setPluginToolDialogOpen] = useState(false);
  const [dialogEnabledPlugins, setDialogEnabledPlugins] = useState<string[]>([]);
  const [draftWorkflowIds, setDraftWorkflowIds] = useState<string[]>([]);
  const [draftWorkflowPluginTools, setDraftWorkflowPluginTools] = useState<Array<{ pluginId: string; toolName: string }>>([]);
  const agents = useAgentStore((s) => s.agents);
  const workflows = useWorkflowStore((s) => s.workflows);
  const loadWorkflows = useWorkflowStore((s) => s.loadWorkflows);
  const history = useInspectorHistoryStore((s) => s.histories[workspaceId] ?? EMPTY_HISTORY);
  const loadHistory = useInspectorHistoryStore((s) => s.loadHistory);
  const clearHistory = useInspectorHistoryStore((s) => s.clearHistory);

  useEffect(() => {
    if (workflowOpen) void loadWorkflows();
  }, [loadWorkflows, workflowOpen]);

  useEffect(() => {
    if (!pluginToolDialogOpen) return;
    void pluginApi.listWorkflowPlugins().then((items) => {
      setDialogEnabledPlugins(items.filter((item) => item.enabled).map((item) => item.id));
    });
  }, [pluginToolDialogOpen]);

  useEffect(() => {
    if (workflowDialogOpen) setDraftWorkflowIds(workflowIds);
  }, [workflowDialogOpen, workflowIds]);

  useEffect(() => {
    if (pluginToolDialogOpen) setDraftWorkflowPluginTools(workflowPluginTools);
  }, [pluginToolDialogOpen, workflowPluginTools]);

  const workflowNameMap = useMemo(() => new Map(workflows.map((workflow) => [workflow.id, workflow.name])), [workflows]);
  const selectedWorkflowLabels = workflowIds.map((id) => workflowNameMap.get(id) || id);

  const insertCodeLocation = (path: string, line: number, column: number) => {
    onInsertText?.(`${path}:${line}:${column}`);
    setHistoryOpen(false);
  };

  const persistAgentBindings = async (
    updates: {
      boundWorkflowIds?: string[];
      boundWorkflowPluginTools?: Array<{ pluginId: string; toolName: string }>;
    },
  ) => {
    if (!activeAgent?.id) return;
    const storedAgent = agents.find((agent) => agent.id === activeAgent.id);
    if (!storedAgent) return;
    const next = { ...storedAgent, ...updates };
    await sdk.agent.updatePreset(storedAgent.id, next);
    useAgentStore.setState((state) => ({
      agents: state.agents.map((agent) => agent.id === storedAgent.id ? next : agent),
    }));
  };

  return (
    <div className="flex items-center gap-0 pt-2">
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
          <span className="hidden md:inline">{tc("shell.recentCode")}{history.length ? ` ${history.length}` : ""}</span>
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
            <span className="hidden md:inline">{contextLength === 0 ? tc("shell.newAgent") : tc("shell.contextN", { count: contextLength })}</span>
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
          <IconPlug className="size-3" />
          <span className="hidden md:inline">{t("input.mcp")}{mcps.length ? ` ${mcps.length}` : ""}</span>
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
              onClick={() => setMcpsManageOpen(true)}
            >
              <IconSettings size={16} className="shrink-0" />
              {tCommon("manage")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={workflowOpen} onOpenChange={setWorkflowOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
            />
          }
        >
          <IconTools className="size-3" />
          <span className="hidden md:inline">Workflow{workflowIds.length ? ` ${workflowIds.length}` : ""}</span>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-80 p-2">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Bound Workflows</div>
          {selectedWorkflowLabels.length ? (
            <div className="flex flex-col gap-1">
              {selectedWorkflowLabels.map((label, index) => (
                <button
                  key={`${workflowIds[index]}:${label}`}
                  type="button"
                  className="rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                  onClick={() => onInsertText?.(`[use workflow: ${workflowIds[index]}]`)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-2 py-4 text-xs text-muted-foreground">No bound workflows</div>
          )}
          <div className="mt-2 border-t pt-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-accent"
              onClick={() => {
                setWorkflowOpen(false);
                setWorkflowDialogOpen(true);
              }}
            >
              <IconSettings size={16} className="shrink-0" />
              {tCommon("manage")}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={workflowToolOpen} onOpenChange={setWorkflowToolOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 rounded-full border border-transparent hover:bg-accent text-muted-foreground text-xs"
            />
          }
        >
          <IconTools className="size-3" />
          <span className="hidden md:inline">Workflow Tools{workflowPluginTools.length ? ` ${workflowPluginTools.length}` : ""}</span>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-96 p-2">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Bound Workflow Plugin Tools</div>
          {workflowPluginTools.length ? (
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {workflowPluginTools.map((item) => (
                <button
                  key={`${item.pluginId}:${item.toolName}`}
                  type="button"
                  className="rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                  onClick={() => onInsertText?.(`[use workflow plugin tool: ${item.pluginId}:${item.toolName}]`)}
                >
                  {item.pluginId}:{item.toolName}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-2 py-4 text-xs text-muted-foreground">No bound workflow plugin tools</div>
          )}
          <div className="mt-2 border-t pt-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-accent"
              onClick={() => {
                setWorkflowToolOpen(false);
                setPluginToolDialogOpen(true);
              }}
            >
              <IconSettings size={16} className="shrink-0" />
              {tCommon("manage")}
            </button>
          </div>
        </PopoverContent>
      </Popover>

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
          <span className="hidden md:inline">{t("input.skill")}{skills.length ? ` ${skills.length}` : ""}</span>
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
              onClick={() => setSkillsManageOpen(true)}
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
          <span className="hidden md:inline">{t("input.tools")}{tools.length ? ` ${tools.length}` : ""}</span>
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
              onClick={() => setToolsManageOpen(true)}
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
            <span className="hidden md:inline">{t("input.todos")} {todos.length}</span>
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

      <McpsDialog open={mcpsManageOpen} onOpenChange={setMcpsManageOpen} />
      <SkillsDialog open={skillsManageOpen} onOpenChange={setSkillsManageOpen} />
      <ToolsDialog open={toolsManageOpen} onOpenChange={setToolsManageOpen} />
      <WorkflowListDialog
        open={workflowDialogOpen}
        workflows={workflows}
        onSelect={() => {}}
        onCreate={() => {}}
        onClose={() => setWorkflowDialogOpen(false)}
        selectable
        showCreate={false}
        selectedWorkflowIds={draftWorkflowIds}
        onSelectedWorkflowIdsChange={(nextWorkflowIds) => {
          setDraftWorkflowIds(nextWorkflowIds);
          void persistAgentBindings({ boundWorkflowIds: nextWorkflowIds });
        }}
      />
      <PluginToolDialog
        open={pluginToolDialogOpen}
        onOpenChange={setPluginToolDialogOpen}
        projectId="chat-agent-bindings"
        enabledPlugins={dialogEnabledPlugins}
        onEnabledPluginsChange={setDialogEnabledPlugins}
        persistEnabledPlugins={false}
        selectable
        selectedTools={draftWorkflowPluginTools}
        onSelectedToolsChange={(nextTools) => {
          setDraftWorkflowPluginTools(nextTools);
          void persistAgentBindings({ boundWorkflowPluginTools: nextTools });
        }}
      />
    </div>
  );
}
