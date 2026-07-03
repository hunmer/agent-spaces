"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilesIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileNode, FileSearchResult } from "@agent-spaces/shared";
import { CommonEditorPanel } from "@/components/editor/editor-panel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { sdk } from "@/lib/sdk";
import { useChatStore } from "@/stores/chat";

interface ChatRightPanelProps {
  agentId?: string;
  onFileSelect?: (path: string) => void;
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

export function ChatRightPanel({ agentId, onFileSelect }: ChatRightPanelProps) {
  const t = useTranslations("chat.rightPanel");
  const agent = useChatStore((s) => s.agents.find((item) => item.id === agentId));
  const activeWorkspaceId = useChatStore((s) => s.activeWorkspaceId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const boundDir = agent?.workingDir ?? "";

  const loadAgentTree = useCallback((path?: string) => {
    if (!agentId) return Promise.resolve([]);
    return sdk.chat.workspaceTree(agentId, path ? { path } : undefined);
  }, [agentId]);

  const loadCurrentTabTree = useCallback((path?: string) => {
    if (!activeWorkspaceId || !activeSessionId) return Promise.resolve([]);
    const sessionPath = `sessions/${activeSessionId}`;
    return sdk.chat.chatWorkspaceTree(activeWorkspaceId, { path: path || sessionPath });
  }, [activeWorkspaceId, activeSessionId]);

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
          <WorkspaceFileTreePanel
            title={"\u5f53\u524d Tab \u5de5\u4f5c\u533a"}
            emptyTitle={"\u672a\u9009\u62e9\u804a\u5929 Tab"}
            enabled={!!activeWorkspaceId && !!activeSessionId}
            loadTree={loadCurrentTabTree}
            workspaceId={activeWorkspaceId && activeSessionId ? `chat-workspace:${activeWorkspaceId}:sessions/${activeSessionId}` : undefined}
            boundDir=""
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
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarTab, setSidebarTab] = useState<'files' | 'search'>('files');

  const reloadTree = useCallback(async () => {
    if (!enabled) {
      setTree([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      setTree(await loadTree());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [enabled, loadTree]);

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/40 px-2">
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{title}</div>
        <button
          type="button"
          onClick={() => setSidebarTab('files')}
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
            sidebarTab === 'files' ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          <FilesIcon className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab('search')}
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
            sidebarTab === 'search' ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          <SearchIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!enabled ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyTitle}
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-destructive">{error}</div>
        ) : (
          <CommonEditorPanel
            workspaceId={workspaceId}
            storageKey={workspaceId}
            boundDir={boundDir}
            variant="project"
            api={editorApi}
            sidebarTab={sidebarTab}
            onSidebarTabChange={setSidebarTab}
            hideSidebarTabs
            hideBottomTabs
            showImport={false}
          />
        )}
      </div>
    </div>
  );
}
