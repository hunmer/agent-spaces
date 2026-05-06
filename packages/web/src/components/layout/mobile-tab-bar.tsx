"use client";

import { Hash, ListChecks, FolderOpen, Code2, MessageSquare, TerminalSquare, FileDiff, GitCommitHorizontal, Network, Settings2 } from "lucide-react";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { cn } from "@/lib/utils";

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

export function MobileTabBar() {
  const { activePanel, setActivePanel } = useMobilePanelStore();

  return (
    <div className="relative shrink-0 bg-background">
      <div className="flex items-center h-10 border-b px-1 gap-0.5 shrink-0 overflow-x-auto md:hidden">
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
    </div>
  );
}
