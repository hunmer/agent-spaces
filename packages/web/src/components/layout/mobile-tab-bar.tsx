"use client";

import { Hash, ListChecks, FolderOpen, Code2, MessageSquare, TerminalSquare, FileDiff, GitCommitHorizontal, Network, Settings2 } from "lucide-react";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { cn } from "@/lib/utils";

const mobileTabItems = [
  // 频道
  { id: "channel-list", icon: Hash, group: "channel" },
  { id: "chat", icon: MessageSquare, group: "channel" },
  // 议题
  { id: "issue-list", icon: ListChecks, group: "issue" },
  { id: "issue-detail", icon: FileDiff, group: "issue" },
  // 编辑器
  { id: "editor", icon: FolderOpen, group: "editor" },
  { id: "code-editor", icon: Code2, group: "editor" },
  // 工具
  { id: "terminal", icon: TerminalSquare, group: "tools" },
  // Git
  { id: "git-changes", icon: FileDiff, group: "git" },
  { id: "git-commits", icon: GitCommitHorizontal, group: "git" },
  { id: "git-graph", icon: Network, group: "git" },
  // 设置
  { id: "project-settings", icon: Settings2, group: "settings" },
] as const;

export function MobileTabBar() {
  const { activePanel, setActivePanel } = useMobilePanelStore();

  return (
    <div className="relative shrink-0 bg-background">
      <div className="flex items-center h-10 border-b px-1 gap-0.5 shrink-0 overflow-x-auto md:hidden">
        {mobileTabItems.map((tab, i) => {
          const Icon = tab.icon;
          const prevGroup = i > 0 ? mobileTabItems[i - 1].group : null;
          const showDivider = prevGroup !== null && prevGroup !== tab.group;
          return (
            <div key={tab.id} className="flex items-center shrink-0">
              {showDivider && <div className="w-px h-4 bg-border mx-0.5" />}
              <button
                onClick={() => setActivePanel(tab.id)}
                className={cn(
                  "flex items-center justify-center size-8 rounded-md transition-colors",
                  activePanel === tab.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                <Icon size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
