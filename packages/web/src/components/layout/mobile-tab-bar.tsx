"use client";

import { useMobilePanelStore } from "@/stores/mobile-panel";
import { useGitStore } from "@/stores/git";
import { useTerminalStore } from "@/stores/terminal";
import { useChannelStore } from "@/stores/channel";
import { useTaskStore } from "@/stores/task";
import { cn } from "@/lib/utils";
import { TAB_ITEMS, RIGHT_TO_LEFT_TAB_MAP, getTabBadge } from "./tab-config";

export function MobileTabBar() {
  const { activePanel, setActivePanel } = useMobilePanelStore();
  const gitStatus = useGitStore((s) => s.status);
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const channelMessages = useChannelStore((s) => s.messages);
  const tasks = useTaskStore((s) => s.tasks);

  const handleTabClick = (id: string) => {
    setActivePanel(id as typeof activePanel);
    const leftTab = RIGHT_TO_LEFT_TAB_MAP[id];
    if (leftTab) {
      // 让右侧 tab 切换时同步激活，以便 back navigation 正确
      // 不直接切换 activePanel，因为用户明确点了右侧 tab
    }
  };

  return (
    <div className="relative shrink-0 bg-background">
      <div className="flex items-center h-10 border-b px-1 gap-2 shrink-0 overflow-x-auto overflow-y-visible md:hidden">
        {TAB_ITEMS.map((tab, i) => {
          const Icon = tab.icon;
          const prevGroup = i > 0 ? TAB_ITEMS[i - 1].group : null;
          const showDivider = prevGroup !== null && prevGroup !== tab.group;
          const { trailing, badge } = getTabBadge(tab.id, gitStatus, terminalSessions, channelMessages, tasks);
          return (
            <div key={tab.id} className="flex items-center shrink-0 overflow-visible">
              {showDivider && <div className="w-px h-4 bg-border mx-0.5" />}
              <button
                onClick={() => handleTabClick(tab.id)}
                className={cn(
                  "relative flex items-center justify-center size-8 rounded-md transition-colors",
                  activePanel === tab.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                <span className="relative">
                  <Icon size={16} />
                  {badge}
                </span>
                {trailing}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
