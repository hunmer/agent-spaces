"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Hash, ListChecks, FolderOpen, Code2, MessageSquare, TerminalSquare, FileDiff, GitCommitHorizontal, Network, Settings2, PanelLeft } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { WorkspaceTabs } from "@/components/layout/workspace-tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Workspace } from "@agent-spaces/shared";

const mobileTabItems = [
  { id: "channel-list", icon: Hash },
  { id: "issue-list", icon: ListChecks },
  { id: "editor", icon: FolderOpen },
  { id: "code-editor", icon: Code2 },
  { id: "chat", icon: MessageSquare },
  { id: "issue-detail", icon: FileDiff },
  { id: "terminal", icon: TerminalSquare },
  { id: "git-changes", icon: FileDiff },
  { id: "git-commits", icon: GitCommitHorizontal },
  { id: "git-graph", icon: Network },
  { id: "project-settings", icon: Settings2 },
] as const;

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { activePanel, setActivePanel } = useMobilePanelStore();
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    fetch(`/api/workspaces/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setWorkspace)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-background">
        <WorkspaceTabs />
        {isMobile && (
          <div className="flex items-center h-10 border-b px-1 gap-0.5 shrink-0 overflow-x-auto">
            <button
              onClick={() => toggleSidebar()}
              className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-accent/50 transition-colors shrink-0"
            >
              <PanelLeft size={16} />
            </button>
            {mobileTabItems.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActivePanel(tab.id)}
                  className={cn(
                    "flex items-center justify-center size-8 rounded-md transition-colors shrink-0",
                    activePanel === tab.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <WorkspaceShell workspaceId={workspace.id} boundDirs={workspace.boundDirs} />
      </div>
    </div>
  );
}
