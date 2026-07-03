"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileNode } from "@agent-spaces/shared";
import { Input } from "@/components/ui/input";
import { FileTree, FileTreeNodes } from "@/components/editor/file-tree";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { sdk } from "@/lib/sdk";
import { useChatStore } from "@/stores/chat";

interface ChatRightPanelProps {
  agentId?: string;
  onFileSelect?: (path: string) => void;
}

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  return nodes.reduce<FileNode[]>((acc, node) => {
    if (node.name.toLowerCase().includes(lower)) {
      acc.push(node);
    } else if (node.type === "directory" && node.children) {
      const filtered = filterTree(node.children, query);
      if (filtered.length > 0) {
        acc.push({ ...node, children: filtered });
      }
    }
    return acc;
  }, []);
}

export function ChatRightPanel({ agentId, onFileSelect }: ChatRightPanelProps) {
  const t = useTranslations('chat.rightPanel');
  const [search, setSearch] = useState("");
  const agent = useChatStore((s) => s.agents.find((item) => item.id === agentId));
  const activeWorkspaceId = useChatStore((s) => s.activeWorkspaceId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const boundDir = agent?.workingDir ?? "";

  const loadAgentTree = useCallback(() => {
    if (!agentId) return Promise.resolve([]);
    return sdk.chat.workspaceTree(agentId);
  }, [agentId]);

  const loadCurrentWorkspaceTree = useCallback(() => {
    if (!activeWorkspaceId || !activeSessionId) return Promise.resolve([]);
    return sdk.chat.chatWorkspaceTree(activeWorkspaceId, { path: `sessions/${activeSessionId}` });
  }, [activeWorkspaceId, activeSessionId]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border/40 px-2 py-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchFiles')}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel id="chat-agent-workspace-tree" defaultSize={50} minSize={20}>
          <WorkspaceFileTreePanel
            title="Agent 工作区"
            emptyTitle={t('noAgent')}
            emptyWorkspaceText={t('emptyWorkspace')}
            noResultsText={t('noResults')}
            enabled={!!agentId}
            loadTree={loadAgentTree}
            search={search}
            workspaceId={agentId ? `chat:${agentId}` : undefined}
            boundDir={boundDir}
            onFileSelect={onFileSelect}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="chat-current-workspace-tree" defaultSize={50} minSize={20}>
          <WorkspaceFileTreePanel
            title="当前聊天工作区"
            emptyTitle="未选择聊天工作区"
            emptyWorkspaceText={t('emptyWorkspace')}
            noResultsText={t('noResults')}
            enabled={!!activeWorkspaceId}
            loadTree={loadCurrentWorkspaceTree}
            search={search}
            workspaceId={activeWorkspaceId ? `chat-workspace:${activeWorkspaceId}` : undefined}
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
  emptyWorkspaceText,
  noResultsText,
  enabled,
  loadTree,
  search,
  workspaceId,
  boundDir,
  onFileSelect,
}: {
  title: string;
  emptyTitle: string;
  emptyWorkspaceText: string;
  noResultsText: string;
  enabled: boolean;
  loadTree: () => Promise<FileNode[]>;
  search: string;
  workspaceId?: string;
  boundDir: string;
  onFileSelect?: (path: string) => void;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const reloadTree = useCallback(() => {
    if (!enabled) {
      setTree([]);
      setExpanded(new Set());
      return;
    }

    setLoading(true);
    setError("");
    loadTree()
      .then((nodes) => {
        setTree(nodes);
        setExpanded(new Set(nodes.filter((node) => node.type === "directory").map((node) => node.path)));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load workspace");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [enabled, loadTree]);

  useEffect(() => {
    reloadTree();
    const timer = setInterval(reloadTree, 10_000);
    return () => clearInterval(timer);
  }, [reloadTree]);

  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/40 px-2">
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{title}</div>
        <button
          type="button"
          onClick={reloadTree}
          disabled={loading}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          <RefreshCwIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!enabled ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyTitle}
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-destructive">{error}</div>
        ) : filteredTree.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {tree.length === 0 ? emptyWorkspaceText : noResultsText}
          </div>
        ) : (
          <FileTree
            expanded={expanded}
            onExpandedChange={setExpanded}
            selectedPath={undefined}
            onFileSelect={onFileSelect}
            workspaceId={workspaceId}
            boundDir={boundDir}
            className="h-full"
          >
            <FileTreeNodes nodes={filteredTree} />
          </FileTree>
        )}
      </div>
    </div>
  );
}
