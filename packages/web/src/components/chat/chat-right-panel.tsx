"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilesIcon, FolderPlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileNode, FileSearchResult } from "@agent-spaces/shared";
import { CommonEditorPanel } from "@/components/editor/editor-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderPicker } from "@/components/ui/folder-picker";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sdk } from "@/lib/sdk";
import { useChatStore } from "@/stores/chat";

interface ChatRightPanelProps {
  agentId?: string;
  onFileSelect?: (path: string) => void;
}

interface DirectoryTab {
  id: string;
  path: string;
}

function searchTree(nodes: FileNode[], query: string): FileSearchResult[] {
  const lower = query.toLowerCase();
  const results: FileSearchResult[] = [];

  const walk = (items: FileNode[]) => {
    for (const item of items) {
      if (item.name.toLowerCase().includes(lower)) {
        results.push({ path: item.path, name: item.name, type: item.type });
      }
      if (item.children) walk(item.children);
    }
  };

  walk(nodes);
  return results;
}

function getDirectoryName(path: string) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path || "目录";
}

export function ChatRightPanel({ agentId, onFileSelect }: ChatRightPanelProps) {
  const t = useTranslations("chat.rightPanel");
  const agent = useChatStore((s) => s.agents.find((item) => item.id === agentId));
  const activeWorkspaceId = useChatStore((s) => s.activeWorkspaceId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const activeSession = useChatStore((s) => s.sessions.find((item) => item.id === s.activeSessionId));
  const updateSessionEditorDirectories = useChatStore((s) => s.updateSessionEditorDirectories);
  const boundDir = agent?.workingDir ?? "";

  const loadAgentTree = useCallback((path?: string) => {
    if (!agentId) return Promise.resolve([]);
    return sdk.chat.workspaceTree(agentId, path ? { path } : undefined);
  }, [agentId]);

  const loadCurrentTabTree = useCallback((path?: string) => {
    if (!activeWorkspaceId || !path) return Promise.resolve([]);
    return sdk.chat.chatWorkspaceTree(activeWorkspaceId, { path });
  }, [activeWorkspaceId]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-sm">
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel id="chat-agent-workspace-tree" defaultSize={50} minSize={20}>
          <WorkspaceFileTreePanel
            title={"Agent \u5de5\u4f5c\u533a"}
            emptyTitle={t("noAgent")}
            enabled={!!agentId}
            loadTree={loadAgentTree}
            workspaceId={agentId ? `chat:${agentId}` : undefined}
            boundDir={boundDir}
            onFileSelect={onFileSelect}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="chat-current-workspace-tree" defaultSize={50} minSize={20}>
          <MultiDirectoryFileTreePanel
            title={"\u5f53\u524d Tab \u5de5\u4f5c\u533a"}
            emptyTitle={"\u672a\u9009\u62e9\u804a\u5929 Tab"}
            enabled={!!activeWorkspaceId && !!activeSessionId}
            loadTree={loadCurrentTabTree}
            workspaceId={activeWorkspaceId ? `chat-workspace:${activeWorkspaceId}:custom-dirs` : undefined}
            sessionId={activeSessionId ?? undefined}
            directoryTabs={activeSession?.editorDirectoryTabs ?? []}
            activeDirectoryTabId={activeSession?.activeEditorDirectoryTabId ?? ""}
            onDirectoryTabsChange={updateSessionEditorDirectories}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function WorkspaceFileTreePanel({
  title,
  emptyTitle,
  enabled,
  loadTree,
  workspaceId,
  boundDir,
  onFileSelect,
}: {
  title: string;
  emptyTitle: string;
  enabled: boolean;
  loadTree: (path?: string) => Promise<FileNode[]>;
  workspaceId?: string;
  boundDir: string;
  onFileSelect?: (path: string) => void;
}) {
  const [sidebarTab, setSidebarTab] = useState<'files' | 'search'>('files');

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title={title}
        sidebarTab={sidebarTab}
        onSidebarTabChange={setSidebarTab}
      />

      <WorkspaceEditorPanel
        enabled={enabled}
        emptyTitle={emptyTitle}
        loadTree={loadTree}
        workspaceId={workspaceId}
        storageKey={workspaceId}
        boundDir={boundDir}
        sidebarTab={sidebarTab}
        onSidebarTabChange={setSidebarTab}
        onFileSelect={onFileSelect}
      />
    </div>
  );
}

function MultiDirectoryFileTreePanel({
  title,
  emptyTitle,
  enabled,
  loadTree,
  workspaceId,
  sessionId,
  directoryTabs,
  activeDirectoryTabId,
  onDirectoryTabsChange,
}: {
  title: string;
  emptyTitle: string;
  enabled: boolean;
  loadTree: (path?: string) => Promise<FileNode[]>;
  workspaceId?: string;
  sessionId?: string;
  directoryTabs: DirectoryTab[];
  activeDirectoryTabId: string;
  onDirectoryTabsChange: (
    sessionId: string,
    data: { editorDirectoryTabs?: DirectoryTab[]; activeEditorDirectoryTabId?: string },
  ) => Promise<void>;
}) {
  const [sidebarTab, setSidebarTab] = useState<'files' | 'search'>('files');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [localActiveTab, setLocalActiveTab] = useState("");

  const tabs = useMemo(() => directoryTabs.map((tab) => ({
    id: tab.id,
    label: getDirectoryName(tab.path),
    path: tab.path,
  })), [directoryTabs]);

  const activeTab = tabs.some((tab) => tab.id === activeDirectoryTabId)
    ? activeDirectoryTabId
    : localActiveTab && tabs.some((tab) => tab.id === localActiveTab)
      ? localActiveTab
      : (tabs[0]?.id ?? "");

  useEffect(() => {
    if (activeDirectoryTabId && tabs.some((tab) => tab.id === activeDirectoryTabId)) {
      setLocalActiveTab(activeDirectoryTabId);
      return;
    }
    if (!localActiveTab || !tabs.some((tab) => tab.id === localActiveTab)) {
      setLocalActiveTab(tabs[0]?.id ?? "");
    }
  }, [activeDirectoryTabId, localActiveTab, tabs]);

  const addDirectory = useCallback(() => {
    const dir = folderInput.trim();
    if (!dir || !sessionId) return;
    const existing = directoryTabs.find((tab) => tab.path === dir);
    if (existing) {
      setLocalActiveTab(existing.id);
      onDirectoryTabsChange(sessionId, { activeEditorDirectoryTabId: existing.id });
    } else {
      const id = `custom-dir-${Date.now()}`;
      setLocalActiveTab(id);
      onDirectoryTabsChange(sessionId, {
        editorDirectoryTabs: [...directoryTabs, { id, path: dir }],
        activeEditorDirectoryTabId: id,
      });
    }
    setFolderInput("");
    setAddDialogOpen(false);
  }, [directoryTabs, folderInput, onDirectoryTabsChange, sessionId]);

  const removeDirectory = useCallback((id: string) => {
    if (!sessionId) return;
    const next = directoryTabs.filter((tab) => tab.id !== id);
    const nextActiveTab = activeTab === id ? (next.at(-1)?.id ?? "") : activeTab;
    setLocalActiveTab(nextActiveTab);
    onDirectoryTabsChange(sessionId, {
      editorDirectoryTabs: next,
      activeEditorDirectoryTabId: nextActiveTab,
    });
  }, [activeTab, directoryTabs, onDirectoryTabsChange, sessionId]);

  const handleActiveTabChange = useCallback((id: string) => {
    setLocalActiveTab(id);
    if (!sessionId) return;
    onDirectoryTabsChange(sessionId, { activeEditorDirectoryTabId: id });
  }, [onDirectoryTabsChange, sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/40 px-2">
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{title}</div>
        <button
          type="button"
          onClick={() => setAddDialogOpen(true)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="添加目录"
        >
          <FolderPlusIcon className="size-3.5" />
        </button>
      </div>

      {tabs.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {enabled ? "请添加目录" : emptyTitle}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={handleActiveTabChange} className="flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden">
          <TabsList variant="line" className="h-8 w-full shrink-0 justify-start overflow-x-auto rounded-none border-b bg-transparent px-1 py-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="w-auto flex-none shrink-0 rounded-none border-b-2 border-transparent px-2 text-xs text-muted-foreground data-[active]:border-b-primary data-[active]:text-foreground"
              >
                <span className="max-w-56 truncate">{tab.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeDirectory(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      removeDirectory(tab.id);
                    }
                  }}
                >
                  <XIcon className="size-3" />
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="m-0 flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              <WorkspaceEditorPanel
                enabled={enabled}
                emptyTitle={emptyTitle}
                loadTree={loadTree}
                workspaceId={workspaceId}
                storageKey={workspaceId ? `${workspaceId}:${tab.id}` : tab.id}
                boundDir=""
                rootPath={tab.path}
                sidebarTab={sidebarTab}
                onSidebarTabChange={setSidebarTab}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>添加目录</DialogTitle>
          </DialogHeader>
          <FolderPicker
            value={folderInput}
            onChange={setFolderInput}
            placeholder="/path/to/project"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={addDirectory} disabled={!folderInput.trim()}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PanelHeader({
  title,
  sidebarTab,
  onSidebarTabChange,
  children,
}: {
  title: string;
  sidebarTab: 'files' | 'search';
  onSidebarTabChange: (value: 'files' | 'search') => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/40 px-2">
      <div className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{title}</div>
      {children}
      <button
        type="button"
        onClick={() => onSidebarTabChange('files')}
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
          sidebarTab === 'files' ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <FilesIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onSidebarTabChange('search')}
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
          sidebarTab === 'search' ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <SearchIcon className="size-3.5" />
      </button>
    </div>
  );
}

function WorkspaceEditorPanel({
  emptyTitle,
  enabled,
  loadTree,
  workspaceId,
  storageKey,
  boundDir,
  rootPath,
  sidebarTab,
  onSidebarTabChange,
  onFileSelect,
}: {
  emptyTitle: string;
  enabled: boolean;
  loadTree: (path?: string) => Promise<FileNode[]>;
  workspaceId?: string;
  storageKey?: string;
  boundDir: string;
  rootPath?: string;
  sidebarTab: 'files' | 'search';
  onSidebarTabChange: (value: 'files' | 'search') => void;
  onFileSelect?: (path: string) => void;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reloadTree = useCallback(async () => {
    if (!enabled) {
      setTree([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      setTree(await loadTree(rootPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [enabled, loadTree, rootPath]);

  const editorApi = useMemo(() => ({
    tree,
    treeLoading: loading,
    loadingDirs: new Set<string>(),
    openFiles: [],
    loadTree: async () => {
      await reloadTree();
    },
    loadDirectory: async (_dirPath: string) => {},
    openFile: (path: string) => {
      onFileSelect?.(path);
    },
    searchFiles: async (query: string) => searchTree(tree, query),
    saveEmptyFile: async (_path: string) => {},
    deletePath: async (_path: string) => {},
    renamePath: async (_oldPath: string, _newPath: string) => {},
    copyPath: async (_srcPath: string, _destPath: string) => {},
  }), [loading, onFileSelect, reloadTree, tree]);

  useEffect(() => {
    reloadTree();
    const timer = setInterval(reloadTree, 10_000);
    return () => clearInterval(timer);
  }, [reloadTree]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-hidden">
      {!enabled ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {emptyTitle}
        </div>
      ) : error ? (
        <div className="p-3 text-xs text-destructive">{error}</div>
      ) : (
        <CommonEditorPanel
          workspaceId={workspaceId}
          storageKey={storageKey}
          boundDir={boundDir}
          variant="project"
          api={editorApi}
          sidebarTab={sidebarTab}
          onSidebarTabChange={onSidebarTabChange}
          hideSidebarTabs
          hideBottomTabs
          showImport={false}
        />
      )}
    </div>
  );
}
