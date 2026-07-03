"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty";
import {
  Workspaces, WorkspaceTrigger, WorkspaceContent,
} from "@/components/ui/workspaces";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/components/common/agent-icon";
import { FileIconImg } from "@/components/editor/file-icon";
import {
  MessageSquarePlus, Settings2, Search, Trash2, Archive, ArchiveRestore, Eraser, FolderX, X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useMemo, useCallback } from "react";
import type { ChatAgent, ChatWorkspace, ChatSession } from "@agent-spaces/sdk";
import { formatDistanceToNow } from "date-fns";
import type { ChatFileTab } from "@/stores/chat";

interface ChatSessionListProps {
  workspaces: ChatWorkspace[];
  activeWorkspaceId: string | null;
  agents: ChatAgent[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  sending: Record<string, boolean>;
  onWorkspaceChange: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onManageAgents: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onClearAllMessages: () => void;
  onDeleteWorkspace: () => void;
  fileTabs: ChatFileTab[];
  activeFileTabPath: string | null;
  onSelectFileTab: (path: string) => void;
  onCloseFileTab: (path: string) => void;
  className?: string;
}

interface SessionItemProps {
  session: ChatSession & { agent?: ChatAgent };
  isActive: boolean;
  isSending: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent, sessionId: string, archived: boolean) => void;
}

function SessionItem({ session, isActive, isSending, onSelect, onDelete, onContextMenu }: SessionItemProps) {
  const t = useTranslations("chat.agentList");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Chat: ${session.title || "New Chat"}`}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isActive && "bg-accent",
        !!session.archived && "opacity-60"
      )}
      onClick={onSelect}
      onContextMenu={(e) => onContextMenu(e, session.id, !!session.archived)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="relative flex-shrink-0">
        {session.agent && (
          <AgentIcon
            agentId={session.agent.id}
            name={session.agent.name}
            avatarUrl={session.agent.avatar}
            icon={session.agent.icon}
            className="size-8"
          />
        )}
        {isSending && (
          <span className="-bottom-0 absolute right-0 flex items-center">
            <span
              aria-label="running"
              className="inline-block size-2.5 rounded-full border-2 border-background bg-blue-500 animate-pulse"
            />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {session.title || "New Chat"}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {session.agent?.name ?? "Unknown"}
          {" · "}
          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
        </span>
      </div>
      <button
        type="button"
        aria-label={t("delete")}
        className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function ChatAgentList({
  workspaces,
  activeWorkspaceId,
  agents,
  sessions,
  activeSessionId,
  sending,
  onWorkspaceChange,
  onCreateWorkspace,
  onManageAgents,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onArchiveSession,
  onUnarchiveSession,
  onClearAllMessages,
  onDeleteWorkspace,
  fileTabs,
  activeFileTabPath,
  onSelectFileTab,
  onCloseFileTab,
  className,
}: ChatSessionListProps) {
  const [search, setSearch] = useState("");
  const t = useTranslations("chat.agentList");

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
    archived: boolean;
  } | null>(null);

  // Enrich sessions with agent info for display
  const enrichedSessions = useMemo(() => {
    return sessions.map((session) => {
      const agent = agents.find((a) => a.id === session.agentId);
      return { ...session, agent };
    });
  }, [sessions, agents]);

  const filtered = enrichedSessions.filter((s) => {
    if (!search) return true;
    const title = s.title || "New Chat";
    return (
      title.toLowerCase().includes(search.toLowerCase()) ||
      (s.agent?.name ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const activeSessions = filtered.filter((s) => !s.archived);
  const archivedSessions = filtered.filter((s) => !!s.archived);

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string, archived: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, sessionId, archived });
  }, []);

  const closeContextMenu = useCallback(() => {
    setCtxMenu(null);
  }, []);

  return (
    <aside
      aria-label="Chat Session List"
      className={cn(
        "flex h-full w-full flex-col gap-2 overflow-hidden rounded-xl border bg-background",
        className
      )}
      role="complementary"
    >
      {/* Workspace Switcher Header */}
      <div className="border-b px-3 py-2">
        <Workspaces
          workspaces={workspaces}
          selectedWorkspaceId={activeWorkspaceId ?? undefined}
          onWorkspaceChange={(ws) => onWorkspaceChange(ws.id)}
          getWorkspaceId={(ws) => ws.id}
          getWorkspaceName={(ws) => ws.name}
        >
          <WorkspaceTrigger className="h-9 w-full text-sm" />
          <WorkspaceContent title={t("workspaces")} searchable>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={onCreateWorkspace}
            >
              <MessageSquarePlus className="size-4" />
              {t("newWorkspace")}
            </button>
          </WorkspaceContent>
        </Workspaces>
      </div>

      {/* New Session + Search */}
      <div className="flex flex-col gap-2 px-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 justify-start gap-2"
            onClick={onNewSession}
          >
            <MessageSquarePlus className="size-4" />
            {t("newChat")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            title={t("clearAllMessages")}
            onClick={onClearAllMessages}
          >
            <Eraser className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive"
            title={t("deleteWorkspace")}
            onClick={onDeleteWorkspace}
          >
            <FolderX className="size-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            aria-label="Search sessions"
            autoComplete="off"
            className="h-8 w-full pl-8 text-xs"
            inputMode="search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            spellCheck={false}
            type="search"
            value={search}
          />
        </div>
      </div>

      {/* Session List */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-6">
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquarePlus />
                </EmptyMedia>
                <EmptyTitle>
                  {sessions.length === 0 ? t("noSessions") : t("noMatches")}
                </EmptyTitle>
                <EmptyDescription>
                  {sessions.length === 0 ? t("noSessionsDesc") : t("noMatchesDesc")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <>
            {/* Active sessions */}
            {activeSessions.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {activeSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={activeSessionId === session.id}
                    isSending={!!sending[session.id]}
                    onSelect={() => onSelectSession(session.id)}
                    onDelete={() => onDeleteSession(session.id)}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            )}

            {/* Archived sessions */}
            {archivedSessions.length > 0 && (
              <div className="mt-1">
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {t("archived")}
                </div>
                {archivedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={activeSessionId === session.id}
                    isSending={!!sending[session.id]}
                    onSelect={() => onSelectSession(session.id)}
                    onDelete={() => onDeleteSession(session.id)}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* File tabs of the active session */}
      {fileTabs.length > 0 && (
        <div className="shrink-0 border-t">
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {t("files")}
          </div>
          <div className="flex flex-col gap-0.5 px-1 pb-1.5">
            {fileTabs.map((file) => {
              const isActive = activeFileTabPath === file.path;
              return (
                <div
                  key={file.path}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    isActive && "bg-accent"
                  )}
                  onClick={() => onSelectFileTab(file.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectFileTab(file.path);
                    }
                  }}
                >
                  <FileIconImg name={file.name} />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label="close file"
                    className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseFileTab(file.path);
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom: Manage Agents */}
      <div className="border-t px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={onManageAgents}
        >
          <Settings2 className="size-4" />
          {t("manageAgents")}
        </Button>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
          <div
            className="fixed z-50 min-w-[120px] rounded-md border bg-popover p-1 shadow-md"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            {ctxMenu.archived ? (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  onUnarchiveSession(ctxMenu.sessionId);
                  closeContextMenu();
                }}
              >
                <ArchiveRestore className="size-3.5" />
                {t("unarchive")}
              </button>
            ) : (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  onArchiveSession(ctxMenu.sessionId);
                  closeContextMenu();
                }}
              >
                <Archive className="size-3.5" />
                {t("archive")}
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={() => {
                onDeleteSession(ctxMenu.sessionId);
                closeContextMenu();
              }}
            >
              <Trash2 className="size-3.5" />
              {t("delete")}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
