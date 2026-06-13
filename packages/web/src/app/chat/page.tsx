"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useChatStore, type ChatTab } from "@/stores/chat";
import { ChatAgentList } from "@/components/chat/chat-agent-list";
import { InlineChatPanel } from "@/components/chat/inline-chat-panel";
import { ChatRightPanel } from "@/components/chat/chat-right-panel";
import { ChatFileViewer } from "@/components/chat/chat-file-viewer";
import { AddChatAgentDialog } from "@/components/chat/add-chat-agent-dialog";
import { AddMemberDialog } from "@/components/chat/add-member-dialog";
import { ChatAgentPickerDialog } from "@/components/chat/chat-agent-picker-dialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIconImg } from "@/components/editor/file-icon";
import { AgentIcon } from "@/components/common/agent-icon";
import type { ChatAgent } from "@agent-spaces/sdk";
import type { AgentPreset } from "@/components/sidebar/agent-shared";

const PANEL_ID_AGENT_LIST = "chat-agent-list";
const PANEL_ID_CHAT = "chat-main";
const PANEL_ID_RIGHT = "chat-right";

const LAYOUT_KEY = "agent-spaces:chat-layout";
type Layout = Record<string, number>;

function loadLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return undefined;
    const layout = JSON.parse(raw) as Layout;
    return layout[PANEL_ID_AGENT_LIST] && layout[PANEL_ID_CHAT] ? layout : undefined;
  } catch {
    return undefined;
  }
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const {
    agents,
    workspaces,
    activeWorkspaceId,
    sessions,
    activeSessionId,
    messages,
    sending,
    errors,
    streamingContent,
    streamingThinking,
    streamingTimeline,
    loadAgents,
    loadWorkspaces,
    createAgent,
    deleteAgent,
    updateAgent,
    createWorkspace,
    updateWorkspace,
    selectWorkspace,
    createSession,
    deleteSession,
    archiveSession,
    unarchiveSession,
    selectSession,
    sendSessionMessage,
    regenerateSessionMessage,
    stopSession,
    clearSessionMessages,
    openFileTabs,
    activeFileTabPath,
    openChatFile,
    closeChatFile,
    setActiveFileTab,
    openSessionTabIds,
    selectSessionTab,
    removeSessionTab,
  } = useChatStore();

  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<ChatAgent | undefined>(undefined);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [createAgentPreset, setCreateAgentPreset] = useState<AgentPreset | undefined>(undefined);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const searchParams = useSearchParams();
  const router = useRouter();

  const defaultLayout = useMemo<Layout | undefined>(() => loadLayout(), []);
  const onLayoutChange = useCallback((layout: Layout) => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
  }, []);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeAgent = activeSession
    ? agents.find((a) => a.id === activeSession.agentId)
    : activeFileTabPath
      ? agents.find((a) => openFileTabs.some((f) => f.path === activeFileTabPath && f.agentId === a.id))
      : undefined;
  const activeMessages = activeSessionId ? (messages[activeSessionId] ?? []) : [];
  const isSending = activeSessionId ? (sending[activeSessionId] ?? false) : false;
  const activeError = activeSessionId ? (errors[activeSessionId] ?? "") : "";
  const activeStreamingContent = activeSessionId ? (streamingContent[activeSessionId] ?? "") : "";
  const activeStreamingThinking = activeSessionId ? (streamingThinking[activeSessionId] ?? "") : "";
  const activeStreamingTimeline = activeSessionId ? (streamingTimeline[activeSessionId] ?? []) : [];

  // Build tabs: sessions + open files
  const openSessionTabIdSet = useMemo(() => new Set(openSessionTabIds), [openSessionTabIds]);
  const tabs: ChatTab[] = useMemo(() => {
    const sessionTabs: ChatTab[] = sessions
      .filter((s) => !s.archived && openSessionTabIdSet.has(s.id))
      .map((s) => {
        const agent = agents.find((a) => a.id === s.agentId);
        return {
          type: 'session' as const,
          id: s.id,
          label: s.title || agent?.name || 'Chat',
          agentId: s.agentId,
        };
      });
    const fileTabs: ChatTab[] = openFileTabs.map((f) => ({
      type: 'file' as const,
      id: `file:${f.path}`,
      path: f.path,
      name: f.name,
    }));
    return [...sessionTabs, ...fileTabs];
  }, [sessions, agents, openFileTabs, openSessionTabIdSet]);

  const activeTabId = activeSessionId ?? (activeFileTabPath ? `file:${activeFileTabPath}` : null);

  useEffect(() => {
    loadAgents();
    loadWorkspaces();
  }, [loadAgents, loadWorkspaces]);

  // Restore active tab from URL after sessions loaded
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (!tabParam || sessions.length === 0) return;
    const [type, ...rest] = tabParam.split(':');
    const id = rest.join(':');
    if (type === 'session' && id) {
      const session = sessions.find((s) => s.id === id && !s.archived);
      if (session) selectSessionTab(id);
    } else if (type === 'file' && id) {
      const fileTab = openFileTabs.find((f) => f.path === id);
      if (fileTab) setActiveFileTab(id);
    }
  }, [searchParams, sessions, openFileTabs, selectSessionTab, setActiveFileTab]);

  const handleSend = useCallback(
    (content: string) => {
      if (!activeSessionId || isSending) return;
      sendSessionMessage(content.trim());
    },
    [activeSessionId, isSending, sendSessionMessage]
  );

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (!activeSessionId || isSending) return;
      regenerateSessionMessage(messageId);
    },
    [activeSessionId, isSending, regenerateSessionMessage]
  );

  const handleManageAgents = useCallback(() => {
    setMemberDialogOpen(true);
  }, []);

  const handlePickAgentForSession = useCallback(
    async (agentIds: string[]) => {
      if (!activeWorkspaceId || agentIds.length === 0) return;
      await createSession(agentIds[0]);
      setAgentPickerOpen(false);
    },
    [activeWorkspaceId, createSession]
  );

  const handleCreateWorkspace = useCallback(async () => {
    if (!newWorkspaceName.trim()) return;
    await createWorkspace(newWorkspaceName.trim());
    setNewWorkspaceOpen(false);
    setNewWorkspaceName("");
  }, [newWorkspaceName, createWorkspace]);

  const handleAddAgent = useCallback(
    async (preset: AgentPreset) => {
      if (!preset.providerId || !preset.modelId) {
        setCreateAgentPreset({
          ...preset,
          id: preset.id || `draft-chat-${Date.now()}`,
          runtimeKind: "langchain",
        });
        setCreateAgentOpen(true);
        return;
      }
      await createAgent({
        name: preset.name,
        role: "agent",
        runtimeKind: "langchain",
        description: preset.description || undefined,
        systemPrompt: preset.systemPrompt || undefined,
        modelProvider: preset.modelProvider || "openai-chat-completions",
        providerId: preset.providerId,
        modelId: preset.modelId || "gpt-4o-mini",
        model: preset.modelId || "gpt-4o-mini",
        avatarUrl: preset.avatarUrl || undefined,
        avatar: preset.avatarUrl || undefined,
        icon: preset.icon || undefined,
        workingDir: preset.workingDir,
        mcps: preset.mcps,
        skills: preset.skills,
        tools: preset.tools,
        outputStyle: preset.outputStyle || undefined,
        temperature: preset.temperature,
        maxTokens: preset.maxTokens,
        enabled: preset.enabled,
      });
    },
    [createAgent]
  );

  // URL sync: push active tab to URL
  const syncUrl = useCallback(
    (tab: { type: string; id: string } | null) => {
      if (!tab) {
        router.replace('/chat', { scroll: false });
      } else {
        const params = new URLSearchParams();
        params.set('tab', `${tab.type}:${tab.id}`);
        router.replace(`/chat?${params.toString()}`, { scroll: false });
      }
    },
    [router]
  );

  // 左侧面板点击 session：开 tab + 激活
  const handleSelectSession = useCallback(
    (sessionId: string | null) => {
      if (!sessionId) return;
      selectSessionTab(sessionId);
      syncUrl({ type: 'session', id: sessionId });
    },
    [selectSessionTab, syncUrl]
  );

  const handleTabClick = useCallback(
    (tab: ChatTab) => {
      if (tab.type === 'session') {
        selectSession(tab.id);
        syncUrl({ type: 'session', id: tab.id });
      } else {
        setActiveFileTab(tab.path);
        syncUrl({ type: 'file', id: tab.path });
      }
    },
    [selectSession, setActiveFileTab, syncUrl]
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tab: ChatTab) => {
      e.stopPropagation();
      if (tab.type === 'session') {
        removeSessionTab(tab.id);
        if (activeSessionId === tab.id) {
          const remaining = sessions.filter((s) => openSessionTabIdSet.has(s.id) && s.id !== tab.id);
          if (remaining.length > 0) {
            selectSession(remaining[0].id);
            syncUrl({ type: 'session', id: remaining[0].id });
          } else {
            syncUrl(null);
          }
        }
      } else {
        closeChatFile(tab.path);
        if (activeFileTabPath === tab.path) {
          const remainingFiles = openFileTabs.filter((f) => f.path !== tab.path);
          if (remainingFiles.length > 0) {
            syncUrl({ type: 'file', id: remainingFiles[remainingFiles.length - 1].path });
          } else {
            syncUrl(null);
          }
        }
      }
    },
    [activeSessionId, activeFileTabPath, sessions, openSessionTabIdSet, openFileTabs, selectSession, removeSessionTab, closeChatFile, syncUrl]
  );

  const handleFileSelect = useCallback(
    (path: string) => {
      const agentId = activeAgent?.id ?? activeSession?.agentId;
      if (!agentId) return;
      openChatFile(agentId, path);
      syncUrl({ type: 'file', id: path });
    },
    [activeAgent, activeSession, openChatFile, syncUrl]
  );

  const workspaceAgentIds = new Set(activeWorkspace?.agentIds ?? []);
  const workspaceAgents = agents.filter((a) => workspaceAgentIds.has(a.id));
  const agentCandidates = workspaceAgents.map((a) => ({
    id: a.id,
    label: a.name,
    description: a.description,
  }));

  const activeFile = activeFileTabPath
    ? openFileTabs.find((f) => f.path === activeFileTabPath)
    : null;

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
      className="h-full bg-muted/30 gap-3 p-2"
    >
      <ResizablePanel id={PANEL_ID_AGENT_LIST} defaultSize="22%" minSize="15%" maxSize="35%">
        <ChatAgentList
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          agents={agents}
          sessions={sessions}
          activeSessionId={activeSessionId}
          sending={sending}
          onWorkspaceChange={selectWorkspace}
          onCreateWorkspace={() => setNewWorkspaceOpen(true)}
          onManageAgents={handleManageAgents}
          onNewSession={() => setAgentPickerOpen(true)}
          onSelectSession={handleSelectSession}
          onDeleteSession={deleteSession}
          onArchiveSession={archiveSession}
          onUnarchiveSession={unarchiveSession}
          className="h-full rounded-xl border border-border/40 bg-background shadow-sm"
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel id={PANEL_ID_CHAT} defaultSize="53%" minSize="35%">
        <div className="flex h-full w-full flex-col rounded-xl border border-border/40 bg-background shadow-sm">
          {/* Tab bar */}
          {tabs.length > 0 && (
            <div className="flex items-center border-b bg-muted/30 overflow-x-auto shrink-0">
              {tabs.map((tab) => {
                const isActive = activeTabId === (tab.type === 'session' ? tab.id : tab.id);
                return (
                  <div
                    key={tab.id}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 text-xs border-r cursor-pointer shrink-0 select-none",
                      isActive
                        ? "bg-background text-foreground border-b-2 border-b-primary"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                    onClick={() => handleTabClick(tab)}
                  >
                    {tab.type === 'session' ? (
                      <AgentIcon
                        agentId={tab.agentId}
                        name={agents.find((a) => a.id === tab.agentId)?.name ?? ''}
                        avatarUrl={agents.find((a) => a.id === tab.agentId)?.avatar}
                        icon={agents.find((a) => a.id === tab.agentId)?.icon}
                        className="size-4 shrink-0"
                        rounded=""
                      />
                    ) : (
                      <FileIconImg name={tab.name} />
                    )}
                    <span className="truncate max-w-28">
                      {tab.type === 'session' ? tab.label : tab.name}
                    </span>
                    <button
                      className="ml-1 hover:bg-accent rounded p-0.5"
                      onClick={(e) => handleTabClose(e, tab)}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab content */}
          <div className="min-h-0 flex-1">
            {activeSession && activeAgent ? (
              <InlineChatPanel
                agentId={activeAgent.id}
                agentName={activeAgent.name}
                agentAvatar={activeAgent.avatar}
                agentIcon={activeAgent.icon}
                agentDescription={activeAgent.description}
                messages={activeMessages}
                sending={isSending}
                error={activeError}
                streamingContent={activeStreamingContent}
                streamingThinking={activeStreamingThinking}
                streamingTimeline={activeStreamingTimeline}
                archived={!!activeSession.archived}
                onSend={handleSend}
                onStop={stopSession}
                onClearMessages={clearSessionMessages}
                onRegenerate={handleRegenerate}
                onEditAgent={(id) => {
                  const agent = agents.find((a) => a.id === id);
                  if (agent) setEditAgent(agent);
                }}
              />
            ) : activeFile ? (
              <ChatFileViewer path={activeFile.path} content={activeFile.content} />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <MessageSquare className="size-12" />
                <p className="text-sm">Select a session or start a new chat</p>
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>

      {activeAgent && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id={PANEL_ID_RIGHT} defaultSize="25%" minSize="18%" maxSize="40%" collapsible>
            <ChatRightPanel agentId={activeAgent.id} onFileSelect={handleFileSelect} />
          </ResizablePanel>
        </>
      )}

      {/* Agent picker for new session */}
      <AddMemberDialog
        open={agentPickerOpen}
        onOpenChange={setAgentPickerOpen}
        candidates={agentCandidates}
        onAdd={handlePickAgentForSession}
      />

      {/* Manage workspace agents */}
      <ChatAgentPickerDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        chatAgents={agents}
        selectedAgentIds={new Set(activeWorkspace?.agentIds ?? [])}
        onAdd={handleAddAgent}
        onAddToChat={(id) => {
          if (!activeWorkspaceId) return;
          updateWorkspace(activeWorkspaceId, {
            agentIds: [...(activeWorkspace?.agentIds ?? []), id],
          });
        }}
        onRemoveFromChat={(id) => {
          if (!activeWorkspaceId) return;
          updateWorkspace(activeWorkspaceId, {
            agentIds: (activeWorkspace?.agentIds ?? []).filter((aid) => aid !== id),
          });
        }}
        onRemoveAgent={deleteAgent}
        onEditAgent={(agent) => setEditAgent(agent)}
        onCreate={() => setCreateAgentOpen(true)}
      />

      {/* Edit Agent Dialog */}
      <AddChatAgentDialog
        open={!!editAgent}
        onOpenChange={(open) => {
          if (!open) setEditAgent(undefined);
        }}
        onSubmit={async (data) => {
          if (editAgent) await updateAgent(editAgent.id, data);
          setEditAgent(undefined);
        }}
        initialData={editAgent}
      />

      {/* Create Agent Dialog */}
      <AddChatAgentDialog
        open={createAgentOpen}
        onOpenChange={(open) => {
          setCreateAgentOpen(open);
          if (!open) setCreateAgentPreset(undefined);
        }}
        initialPreset={createAgentPreset}
        onSubmit={async (data) => {
          await createAgent(data);
          setCreateAgentOpen(false);
          setCreateAgentPreset(undefined);
        }}
      />

      {/* Create Workspace Dialog */}
      {newWorkspaceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-lg border bg-background p-4 shadow-lg">
            <h3 className="mb-3 font-semibold text-lg">New Workspace</h3>
            <input
              className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Workspace name"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateWorkspace();
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => setNewWorkspaceOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                onClick={handleCreateWorkspace}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </ResizablePanelGroup>
  );
}
