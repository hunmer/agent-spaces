"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
import { useChatStore, type ChatFileTab } from "@/stores/chat";
import { ChatAgentList } from "@/components/chat/chat-agent-list";
import { InlineChatPanel } from "@/components/chat/inline-chat-panel";
import { ChatRightPanel } from "@/components/chat/chat-right-panel";
import { ChatFileViewer } from "@/components/chat/chat-file-viewer";
import { AddChatAgentDialog } from "@/components/chat/add-chat-agent-dialog";
import { AddMemberDialog } from "@/components/chat/add-member-dialog";
import { ChatAgentPickerDialog } from "@/components/chat/chat-agent-picker-dialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { MessageSquare, PanelLeft, PanelRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ChatAgent } from "@agent-spaces/sdk";
import type { AgentPreset } from "@/components/sidebar/agent-shared";

const PANEL_ID_AGENT_LIST = "chat-agent-list";
const PANEL_ID_CHAT = "chat-main";
const PANEL_ID_RIGHT = "chat-right";

// Stable empty array reference to avoid re-rendering when a session has no file tabs
const EMPTY_FILE_TABS: ChatFileTab[] = [];

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
  const t = useTranslations('chat');
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
    deleteWorkspace,
    selectWorkspace,
    createSession,
    deleteSession,
    archiveSession,
    unarchiveSession,
    sendSessionMessage,
    regenerateSessionMessage,
    stopSession,
    clearSessionMessages,
    clearAllSessionMessages,
    sessionFileTabs,
    activeFileTabPath,
    openChatFile,
    closeChatFile,
    setActiveFileTab,
    selectSessionTab,
  } = useChatStore();

  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<ChatAgent | undefined>(undefined);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [createAgentPreset, setCreateAgentPreset] = useState<AgentPreset | undefined>(undefined);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const isMobile = useIsMobile();
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  const defaultLayout = useMemo<Layout | undefined>(() => loadLayout(), []);
  const onLayoutChange = useCallback((layout: Layout) => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
  }, []);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId);
  // Stable Set ref so the picker dialog's open effect doesn't re-run on every render
  const selectedAgentIdSet = useMemo(
    () => new Set(activeWorkspace?.agentIds ?? []),
    [activeWorkspace?.agentIds],
  );
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  // File tabs belong to the active session (stable empty array when none)
  const activeFileTabs: ChatFileTab[] = activeSessionId ? (sessionFileTabs[activeSessionId] ?? EMPTY_FILE_TABS) : EMPTY_FILE_TABS;
  const activeFile = activeFileTabPath
    ? activeFileTabs.find((f) => f.path === activeFileTabPath)
    : undefined;
  const showFileViewer = Boolean(activeFile);
  const activeAgent = activeSession
    ? agents.find((a) => a.id === activeSession.agentId)
    : undefined;
  // Stable derived skill names to avoid re-creating arrays every render
  const activeAgentSkills = useMemo(
    () => activeAgent?.skills?.map((skill) => (typeof skill === "string" ? skill : skill.name)),
    [activeAgent?.skills],
  );
  const activeMessages = activeSessionId ? (messages[activeSessionId] ?? []) : [];
  const isSending = activeSessionId ? (sending[activeSessionId] ?? false) : false;
  const activeError = activeSessionId ? (errors[activeSessionId] ?? "") : "";
  const activeStreamingContent = activeSessionId ? (streamingContent[activeSessionId] ?? "") : "";
  const activeStreamingThinking = activeSessionId ? (streamingThinking[activeSessionId] ?? "") : "";
  const activeStreamingTimeline = activeSessionId ? (streamingTimeline[activeSessionId] ?? []) : [];

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
      // Skip if already active to avoid update loops
      if (activeSessionId === id) return;
      const session = sessions.find((s) => s.id === id && !s.archived);
      if (session) selectSessionTab(id);
    } else if (type === 'file' && id) {
      // Only restore if the file belongs to the active session's tabs and isn't already active
      if (activeFileTabPath === id) return;
      if (activeFileTabs.some((f) => f.path === id)) setActiveFileTab(id);
    }
  }, [searchParams, sessions, activeSessionId, activeFileTabPath, activeFileTabs, selectSessionTab, setActiveFileTab]);

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

  // 左侧 file tab 点击：选中并切回文件视图
  const handleSelectFileTab = useCallback(
    (path: string) => {
      setActiveFileTab(path);
      syncUrl({ type: 'file', id: path });
    },
    [setActiveFileTab, syncUrl]
  );

  const handleCloseFileTab = useCallback(
    (path: string) => {
      closeChatFile(path);
      if (activeFileTabPath === path) {
        const remaining = activeFileTabs.filter((f) => f.path !== path);
        if (remaining.length > 0) {
          syncUrl({ type: 'file', id: remaining[remaining.length - 1].path });
        } else {
          syncUrl(activeSessionId ? { type: 'session', id: activeSessionId } : null);
        }
      }
    },
    [activeFileTabPath, activeFileTabs, activeSessionId, closeChatFile, syncUrl]
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

  const dialogs = (
    <>
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
        selectedAgentIds={selectedAgentIdSet}
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
    </>
  );

  const agentListPanel = (
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
      onSelectSession={(id) => {
        handleSelectSession(id);
        setLeftDrawerOpen(false);
      }}
      onDeleteSession={deleteSession}
      onArchiveSession={archiveSession}
      onUnarchiveSession={unarchiveSession}
      onClearAllMessages={clearAllSessionMessages}
      onDeleteWorkspace={deleteWorkspace}
      fileTabs={activeFileTabs}
      activeFileTabPath={activeFileTabPath}
      onSelectFileTab={(path) => {
        handleSelectFileTab(path);
        setLeftDrawerOpen(false);
      }}
      onCloseFileTab={handleCloseFileTab}
      className="h-full rounded-xl border border-border/40 bg-background shadow-sm"
    />
  );

  const chatMainPanel = (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-sm">
      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {showFileViewer && activeFile ? (
          <ChatFileViewer path={activeFile.path} content={activeFile.content} />
        ) : activeSession && activeAgent ? (
          <InlineChatPanel
            sessionId={activeSession.id}
            agentId={activeAgent.id}
            agentName={activeAgent.name}
            agentAvatar={activeAgent.avatar}
            agentIcon={activeAgent.icon}
            agentDescription={activeAgent.description}
            agentSystemPrompt={activeAgent.systemPrompt}
            agentMcps={activeAgent.mcps}
            agentSkills={activeAgentSkills}
            agentTools={activeAgent.tools}
            messages={activeMessages}
            sending={isSending}
            error={activeError}
            streamingContent={activeStreamingContent}
            streamingThinking={activeStreamingThinking}
            streamingTimeline={activeStreamingTimeline}
            workspaceId={activeWorkspaceId ?? undefined}
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
            <p className="text-sm">{t('emptySession')}</p>
          </div>
        )}
      </div>
    </div>
  );

  const rightPanel = (
    <ChatRightPanel agentId={activeAgent?.id} onFileSelect={(path) => {
      handleFileSelect(path);
      setRightDrawerOpen(false);
    }} />
  );

  if (isMobile) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-muted/30 p-2">
        {/* 边缘切换按钮：左/右，始终可见 */}
        <Button
          aria-label="Toggle left panel"
          className="absolute top-1/2 left-0 z-20 -translate-y-1/2 rounded-full border border-border/40 bg-background shadow-md hover:bg-accent"
          onClick={() => setLeftDrawerOpen(true)}
          size="icon"
          variant="ghost"
          type="button"
        >
          <PanelLeft className="size-4" />
        </Button>
        <Button
          aria-label="Toggle right panel"
          className="absolute top-1/2 right-0 z-20 -translate-y-1/2 rounded-full border border-border/40 bg-background shadow-md hover:bg-accent"
          onClick={() => setRightDrawerOpen(true)}
          size="icon"
          variant="ghost"
          type="button"
        >
          <PanelRight className="size-4" />
        </Button>
        {chatMainPanel}

        {/* 左 Drawer */}
        <Drawer open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen} direction="left">
          <DrawerContent className="h-full w-4/5 max-w-sm p-2">
            {agentListPanel}
          </DrawerContent>
        </Drawer>

        {/* 右 Drawer */}
        <Drawer open={rightDrawerOpen} onOpenChange={setRightDrawerOpen} direction="right">
          <DrawerContent className="h-full w-4/5 max-w-sm p-2">
            {rightPanel}
          </DrawerContent>
        </Drawer>

        {dialogs}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
      className="h-full bg-muted/30 gap-3 p-2"
    >
      <ResizablePanel id={PANEL_ID_AGENT_LIST} defaultSize="22%" minSize="15%" maxSize="35%">
        {agentListPanel}
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel id={PANEL_ID_CHAT} defaultSize="53%" minSize="35%" className="min-w-0 overflow-hidden">
        {chatMainPanel}
      </ResizablePanel>

      <ResizableHandle withHandle />
      <ResizablePanel id={PANEL_ID_RIGHT} defaultSize="25%" minSize="18%" maxSize="40%" collapsible>
        {rightPanel}
      </ResizablePanel>

      {dialogs}
    </ResizablePanelGroup>
  );
}
